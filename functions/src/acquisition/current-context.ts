import { createHash } from "node:crypto";
import type { AcquisitionEmailEligibilityInput, AcquisitionStatePort, AcquisitionStateReadInput } from "../../../shared/acquisition/contracts.js";
import type { CommunicationConsentFact } from "../../../shared/customer/contracts.js";
import type { CommunicationVariableValues } from "../../../shared/communications/contracts.js";
import type { CurrentCommunicationContext, CurrentCommunicationContextPort } from "../communications/acquisition-dispatch.js";
import { getCurrentSubscriptionForCustomer, getOfferRecord } from "../billing/store.js";
import { db } from "../firebase.js";

function organizationRef(organizationId: string) { return db.collection("organizations").doc(organizationId); }
function subjectRef(input: AcquisitionStateReadInput) {
  return input.subjectKind === "customer"
    ? organizationRef(input.organizationId).collection("customers").doc(input.customerId ?? input.subjectId)
    : organizationRef(input.organizationId).collection("leads").doc(input.leadId ?? input.subjectId);
}
function normalizeEmail(value: unknown) { return typeof value === "string" ? value.trim().toLowerCase() : ""; }
function firstName(value: unknown) {
  if (typeof value !== "string") return "there";
  const normalized = value.trim();
  return normalized ? normalized.split(/\s+/)[0] : "there";
}
function publicBaseUrl() { return (process.env.NURTURE_PUBLIC_URL || "https://nurture-12398.web.app").replace(/\/$/, ""); }

async function latestOnboarding(organizationId: string, customerId: string, dataMode: string) {
  const snapshot = await organizationRef(organizationId).collection("onboardingProgress")
    .where("scope.customerId", "==", customerId)
    .where("scope.dataMode", "==", dataMode)
    .limit(20)
    .get();
  return snapshot.docs
    .map((item) => item.data())
    .sort((left, right) => String(right.lastActivityAt ?? "").localeCompare(String(left.lastActivityAt ?? "")))[0] ?? null;
}

async function hasActivationEvent(organizationId: string, customerId: string, dataMode: string) {
  const snapshot = await organizationRef(organizationId).collection("lifecycleEvents")
    .where("customerId", "==", customerId)
    .where("dataMode", "==", dataMode)
    .orderBy("occurredAt", "desc")
    .limit(100)
    .get();
  return snapshot.docs.some((item) => {
    const data = item.data();
    return data.eventType === "experience.milestone_reached" && data.payload?.activation === true;
  });
}

export class FirestoreAcquisitionStatePort implements AcquisitionStatePort {
  async readCurrentState(input: AcquisitionStateReadInput) {
    const checkedAt = new Date().toISOString();
    const [organization, subject] = await Promise.all([
      organizationRef(input.organizationId).get(),
      subjectRef(input).get(),
    ]);
    const organizationStatus = !organization.exists
      ? "missing" as const
      : organization.data()?.status === "active"
        ? "active" as const
        : organization.data()?.status === "paused" || organization.data()?.status === "suspended"
          ? "paused" as const
          : "unknown" as const;
    const subjectData = subject.exists ? subject.data() ?? {} : null;
    const subjectStatus = !subject.exists
      ? "missing" as const
      : subjectData?.status === "active" || subjectData?.status === "captured" || subjectData?.status === "linked"
        ? "active" as const
        : subjectData?.status === "deleted" || subjectData?.status === "archived"
          ? "deleted" as const
          : "unknown" as const;

    const registration = input.subjectKind === "customer"
      ? (subjectStatus === "active" ? "completed" as const : "unknown" as const)
      : typeof subjectData?.linkedCustomerId === "string"
        ? "completed" as const
        : subjectStatus === "active" ? "incomplete" as const : "unknown" as const;

    const customerId = input.customerId ?? (input.subjectKind === "customer" ? input.subjectId : typeof subjectData?.linkedCustomerId === "string" ? subjectData.linkedCustomerId : undefined);
    let onboarding: { status: "not-started" | "incomplete" | "completed" | "unknown"; flowVersionId?: string } = { status: customerId ? "not-started" : "unknown" };
    let activation: "completed" | "missing" | "unknown" = customerId ? "missing" : "unknown";
    let subscription = null as Awaited<ReturnType<typeof getCurrentSubscriptionForCustomer>>;
    if (customerId) {
      const [progress, activated, commercial] = await Promise.all([
        latestOnboarding(input.organizationId, customerId, input.dataMode),
        hasActivationEvent(input.organizationId, customerId, input.dataMode),
        getCurrentSubscriptionForCustomer(input.organizationId, customerId),
      ]);
      if (progress) {
        onboarding = {
          status: progress.status === "complete" ? "completed" : progress.status === "in-progress" || progress.status === "abandoned" ? "incomplete" : "unknown",
          ...(typeof progress.flowVersion === "string" ? { flowVersionId: progress.flowVersion } : {}),
        };
      }
      activation = activated ? "completed" : "missing";
      subscription = commercial;
    }

    const trial = !customerId
      ? { status: "unknown" as const }
      : !subscription
        ? { status: "none" as const }
        : subscription.status === "trialing"
          ? { status: "active" as const, ...(subscription.trialEnd ? { endsAt: subscription.trialEnd } : {}) }
          : subscription.trialEnd
            ? { status: "ended" as const, endsAt: subscription.trialEnd }
            : { status: "none" as const };
    const purchase = !customerId
      ? "unknown" as const
      : !subscription || subscription.status === "trialing" || subscription.status === "incomplete" || subscription.status === "incomplete_expired"
        ? "absent" as const
        : "completed" as const;
    const commercialEligibility = organizationStatus !== "active" || subjectStatus !== "active"
      ? "ineligible" as const
      : subscription?.status === "incomplete_expired" || subscription?.status === "canceled"
        ? "ineligible" as const
        : "eligible" as const;

    return {
      checkedAt,
      organization: organizationStatus,
      subject: subjectStatus,
      registration,
      onboarding,
      activation,
      trial,
      purchase,
      commercialEligibility,
    };
  }
}

async function currentConsent(input: AcquisitionStateReadInput & { purpose: "transactional" | "marketing" }): Promise<CommunicationConsentFact | null> {
  const cPurpose = input.purpose === "transactional" ? "service" : "marketing";
  const snapshot = await organizationRef(input.organizationId).collection("communicationConsents")
    .where("subjectKind", "==", input.subjectKind)
    .where("subjectId", "==", input.subjectId)
    .where("dataMode", "==", input.dataMode)
    .limit(20)
    .get();
  const candidates = snapshot.docs
    .map((item) => item.data() as CommunicationConsentFact)
    .filter((fact) => fact.channel === "email" && fact.purpose === cPurpose)
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
  return candidates[0] ?? null;
}

async function currentRecipient(input: AcquisitionStateReadInput) {
  const snapshot = await subjectRef(input).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() ?? {};
  const profile = data.profile && typeof data.profile === "object" ? data.profile as Record<string, unknown> : {};
  const contact = data.contact && typeof data.contact === "object" ? data.contact as Record<string, unknown> : {};
  const email = normalizeEmail(input.subjectKind === "customer" ? profile.email : contact.email);
  if (!email) return null;
  return {
    email,
    displayName: input.subjectKind === "customer" ? profile.displayName : contact.name,
    firstName: input.subjectKind === "customer" ? (profile.firstName ?? profile.displayName) : contact.name,
  };
}

async function communicationVariables(input: AcquisitionStateReadInput, recipient: NonNullable<Awaited<ReturnType<typeof currentRecipient>>>): Promise<CommunicationVariableValues> {
  const base = publicBaseUrl();
  const [organization, sender, subscription] = await Promise.all([
    organizationRef(input.organizationId).get(),
    organizationRef(input.organizationId).collection("communicationSettings").doc("emailSender").get(),
    input.customerId || input.subjectKind === "customer" ? getCurrentSubscriptionForCustomer(input.organizationId, input.customerId ?? input.subjectId) : Promise.resolve(null),
  ]);
  let offerName = "your plan";
  if (subscription) {
    const offer = await getOfferRecord(input.organizationId, subscription.offerId);
    offerName = offer?.published?.name ?? offer?.draft?.name ?? offerName;
  }
  const organizationName = typeof organization.data()?.name === "string" ? organization.data()!.name : "Nurture";
  const supportEmail = typeof sender.data()?.fromAddress === "string" ? sender.data()!.fromAddress : "support@example.test";
  return {
    "organization.name": organizationName,
    "customer.firstName": firstName(recipient.firstName),
    "customer.displayName": typeof recipient.displayName === "string" && recipient.displayName.trim() ? recipient.displayName.trim() : firstName(recipient.firstName),
    "lead.firstName": firstName(recipient.firstName),
    "experience.name": typeof organization.data()?.experienceName === "string" ? organization.data()!.experienceName : organizationName,
    "experience.startUrl": `${base}/experience`,
    "onboarding.resumeUrl": `${base}/onboarding`,
    "offer.name": offerName,
    "offer.checkoutUrl": `${base}/offers`,
    "trial.endDate": subscription?.trialEnd ? new Date(subscription.trialEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "soon",
    "application.publicUrl": `${base}/`,
    "preferences.url": `${base}/app/settings`,
    "support.email": supportEmail,
  };
}

export class FirestoreCurrentCommunicationContextPort implements CurrentCommunicationContextPort {
  async readCurrent(input: AcquisitionEmailEligibilityInput): Promise<CurrentCommunicationContext> {
    const [recipient, consent] = await Promise.all([
      currentRecipient(input),
      currentConsent(input),
    ]);
    const recordedAt = new Date().toISOString();
    if (!recipient) {
      return {
        recipientRef: `missing:${input.subjectKind}:${input.subjectId}`,
        consent: { purpose: input.purpose === "transactional" ? "service" : "marketing", decision: "unknown", source: "recipient-unavailable", recordedAt },
        variables: {},
      };
    }
    const variables = await communicationVariables(input, recipient);
    const recipientRef = createHash("sha256").update(`${input.organizationId}:${input.subjectKind}:${input.subjectId}:${recipient.email}`).digest("hex");
    return {
      recipientRef,
      recipientEmail: recipient.email,
      consent: consent
        ? { purpose: consent.purpose, decision: consent.decision, source: consent.source, recordedAt: consent.recordedAt, policyVersion: consent.policyVersion }
        : { purpose: input.purpose === "transactional" ? "service" : "marketing", decision: "unknown", source: "consent-unavailable", recordedAt },
      variables,
    };
  }
}

export const acquisitionStatePort = new FirestoreAcquisitionStatePort();
export const currentCommunicationContextPort = new FirestoreCurrentCommunicationContextPort();
