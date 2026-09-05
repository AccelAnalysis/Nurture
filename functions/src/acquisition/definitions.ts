import type { AnalyticsEventType } from "../../../shared/analytics/contracts.js";
import {
  ACQUISITION_AUTOMATION_SCHEMA_VERSION,
  type AcquisitionAutomationDefinition,
  type AcquisitionCatalogId,
  type AcquisitionDefinitionPort,
  type AcquisitionPredicateKey,
  type AcquisitionSchedule,
} from "../../../shared/acquisition/contracts.js";
import { ACQUISITION_CATALOG, validateAcquisitionDefinition } from "../../../shared/acquisition/catalog.js";
import { communicationTemplateIds, type CommunicationTemplateId } from "../../../shared/communications/contracts.js";
import { getCommunicationTemplateView } from "../communications/store.js";
import { db } from "../firebase.js";

export const LIFECYCLE_WORKSPACE_CATALOG_VERSION = "r2-acquisition-v1" as const;

export interface LifecycleAutomationConfigurationRecord {
  automationId: AcquisitionCatalogId;
  enabled: boolean;
  timingId: string;
  templateId: string;
  selectedConditionIds: string[];
}

interface LifecycleWorkspaceRecord {
  schemaVersion: 1;
  organizationId: string;
  catalogVersion: typeof LIFECYCLE_WORKSPACE_CATALOG_VERSION;
  draft: LifecycleAutomationConfigurationRecord[];
  draftRevision: number;
  draftUpdatedAt: string;
  published: null | {
    id: string;
    version: number;
    publishedAt: string;
    publishedBy: string;
    automations: LifecycleAutomationConfigurationRecord[];
  };
}

const timingCatalog: Readonly<Record<AcquisitionCatalogId, readonly { id: string; label: string; description: string; schedule: AcquisitionSchedule }[]>> = {
  "R2-WELCOME": [
    { id: "after-trigger-immediate", label: "Immediately", description: "After the trusted trigger is accepted", schedule: { kind: "after-trigger", delaySeconds: 0 } },
    { id: "after-trigger-15m", label: "After 15 minutes", description: "Durable 15-minute delay", schedule: { kind: "after-trigger", delaySeconds: 900 } },
  ],
  "R2-LEAD": [
    { id: "after-trigger-1d", label: "After 1 day", description: "Durable one-day delay", schedule: { kind: "after-trigger", delaySeconds: 86_400 } },
    { id: "after-trigger-3d", label: "After 3 days", description: "Durable three-day delay", schedule: { kind: "after-trigger", delaySeconds: 259_200 } },
  ],
  "R2-ACTIVATE": [
    { id: "after-trigger-1d", label: "After 1 day", description: "Durable one-day delay", schedule: { kind: "after-trigger", delaySeconds: 86_400 } },
    { id: "after-trigger-3d", label: "After 3 days", description: "Durable three-day delay", schedule: { kind: "after-trigger", delaySeconds: 259_200 } },
  ],
  "R2-ONBOARD": [
    { id: "after-trigger-1d", label: "After 1 day", description: "Durable one-day delay", schedule: { kind: "after-trigger", delaySeconds: 86_400 } },
    { id: "after-trigger-3d", label: "After 3 days", description: "Durable three-day delay", schedule: { kind: "after-trigger", delaySeconds: 259_200 } },
  ],
  "R2-TRIAL": [
    { id: "before-trial-end-24h", label: "24 hours before trial end", description: "Requires a trusted future trial end", schedule: { kind: "before-trial-end", offsetSeconds: 86_400 } },
    { id: "before-trial-end-6h", label: "6 hours before trial end", description: "Requires a trusted future trial end", schedule: { kind: "before-trial-end", offsetSeconds: 21_600 } },
  ],
  "R2-CHECKOUT": [
    { id: "after-trigger-1h", label: "After 1 hour", description: "Durable one-hour delay", schedule: { kind: "after-trigger", delaySeconds: 3_600 } },
    { id: "after-trigger-1d", label: "After 1 day", description: "Durable one-day delay", schedule: { kind: "after-trigger", delaySeconds: 86_400 } },
  ],
};

const catalogLabels: Readonly<Record<AcquisitionCatalogId, { label: string; intent: string }>> = {
  "R2-WELCOME": { label: "Registration welcome", intent: "A bounded welcome after trusted registration." },
  "R2-LEAD": { label: "Lead-to-registration follow-up", intent: "Invite a permitted lead while registration remains incomplete." },
  "R2-ACTIVATE": { label: "First-use activation", intent: "Invite a registered customer before validated first meaningful use." },
  "R2-ONBOARD": { label: "Incomplete onboarding reminder", intent: "Remind only while the relevant onboarding flow remains incomplete." },
  "R2-TRIAL": { label: "Actual-trial conversion", intent: "Send relative to a trusted actual-trial end while conversion remains absent." },
  "R2-CHECKOUT": { label: "Checkout recovery", intent: "Recover a trusted incomplete checkout only after current no-purchase checks." },
};

const predicateLabels: Readonly<Record<string, [string, string]>> = {
  "subject.active": ["Subject remains active", "Current organization-scoped subject still exists and is active"],
  "registration.incomplete": ["Registration is incomplete", "Stop after verified registration"],
  "registration.completed": ["Registration is completed", "Trusted registration state remains completed"],
  "activation.missing": ["Activation is still missing", "No validated first meaningful use has been recorded"],
  "onboarding.incomplete": ["Onboarding remains incomplete", "The relevant onboarding flow is not completed"],
  "trial.active": ["Actual trial remains active", "Trusted commercial state still reports an active trial"],
  "purchase.absent": ["Purchase remains absent", "Trusted Release 1 commercial state has no completed purchase"],
  "commercial.eligible": ["Commercial state remains eligible", "Current trusted commercial state permits this treatment"],
};

const stopRuleLabels: Readonly<Record<string, [string, string]>> = {
  "subject.deleted": ["Subject deleted", "Cancel pending work after deletion or loss of scope"],
  "registration.completed": ["Registration completed", "Stop lead follow-up after verified registration"],
  "activation.completed": ["Activation completed", "Stop activation treatment after validated first meaningful use"],
  "onboarding.completed": ["Onboarding completed", "Stop onboarding reminders after completion"],
  "trial.ended": ["Trial ended", "Stop work that requires an active trial"],
  "purchase.completed": ["Purchase completed", "Cancel obsolete conversion or checkout recovery"],
  "commercial.ineligible": ["Commercially ineligible", "Cancel treatment when current commercial state no longer permits it"],
};

function organizationRef(organizationId: string) { return db.collection("organizations").doc(organizationId); }
function workspaceRef(organizationId: string) { return organizationRef(organizationId).collection("lifecycleAutomation").doc("workspace"); }
function definitionHeadRef(organizationId: string, automationId: AcquisitionCatalogId) { return organizationRef(organizationId).collection("acquisitionDefinitions").doc(automationId); }
function definitionVersionRef(organizationId: string, automationId: AcquisitionCatalogId, versionId: string) { return definitionHeadRef(organizationId, automationId).collection("versions").doc(versionId); }

function catalogIds(): AcquisitionCatalogId[] { return Object.keys(ACQUISITION_CATALOG) as AcquisitionCatalogId[]; }

export function defaultLifecycleDraft(): LifecycleAutomationConfigurationRecord[] {
  return catalogIds().map((automationId) => {
    const descriptor = ACQUISITION_CATALOG[automationId];
    return {
      automationId,
      enabled: false,
      timingId: timingCatalog[automationId][0].id,
      templateId: descriptor.templateId,
      selectedConditionIds: [...descriptor.requiredPredicates],
    };
  });
}

function defaultWorkspace(organizationId: string): LifecycleWorkspaceRecord {
  const now = new Date().toISOString();
  return { schemaVersion: 1, organizationId, catalogVersion: LIFECYCLE_WORKSPACE_CATALOG_VERSION, draft: defaultLifecycleDraft(), draftRevision: 1, draftUpdatedAt: now, published: null };
}

function validateDraft(draft: readonly LifecycleAutomationConfigurationRecord[]) {
  const ids = new Set(draft.map((item) => item.automationId));
  if (ids.size !== catalogIds().length || catalogIds().some((id) => !ids.has(id))) throw new Error("Lifecycle draft must contain every approved Release 2 automation exactly once.");
  for (const item of draft) {
    const descriptor = ACQUISITION_CATALOG[item.automationId];
    if (!descriptor) throw new Error(`Unsupported automation: ${String(item.automationId)}.`);
    if (item.templateId !== descriptor.templateId) throw new Error(`${item.automationId} must use ${descriptor.templateId}.`);
    if (!timingCatalog[item.automationId].some((choice) => choice.id === item.timingId)) throw new Error(`${item.automationId} timing is not approved.`);
    const selected = new Set(item.selectedConditionIds);
    if (selected.size !== item.selectedConditionIds.length) throw new Error(`${item.automationId} predicates contain duplicates.`);
    for (const required of descriptor.requiredPredicates) if (!selected.has(required)) throw new Error(`${item.automationId} is missing required predicate ${required}.`);
    for (const predicate of selected) if (!descriptor.allowedPredicates.includes(predicate as AcquisitionPredicateKey)) throw new Error(`${item.automationId} predicate ${predicate} is not approved.`);
  }
}

async function currentWorkspace(organizationId: string): Promise<LifecycleWorkspaceRecord> {
  const snapshot = await workspaceRef(organizationId).get();
  return snapshot.exists ? snapshot.data() as LifecycleWorkspaceRecord : defaultWorkspace(organizationId);
}

async function templateSummaries(organizationId: string) {
  return Promise.all(communicationTemplateIds.map(async (templateId) => {
    const view = await getCommunicationTemplateView(organizationId, templateId);
    const published = view.published;
    return {
      templateId,
      label: view.draft.content.name,
      purpose: view.purpose,
      publishedVersion: published ? String(published.version) : "",
      readiness: published ? "ready" as const : "not-ready" as const,
      readinessExplanation: published ? `Published immutable version ${published.version}.` : "Publish this communication template before enabling its lifecycle automation.",
    };
  }));
}

function catalogView() {
  return catalogIds().map((id) => {
    const descriptor = ACQUISITION_CATALOG[id];
    return {
      id,
      label: catalogLabels[id].label,
      intent: catalogLabels[id].intent,
      triggerLabel: `${descriptor.triggerEventType} from ${descriptor.allowedTriggerSources.join("/")}`,
      messagePurpose: descriptor.purpose,
      timingChoices: timingCatalog[id],
      conditionChoices: descriptor.allowedPredicates.map((predicate) => ({
        id: predicate,
        label: predicateLabels[predicate]?.[0] ?? predicate,
        description: predicateLabels[predicate]?.[1] ?? predicate,
        required: descriptor.requiredPredicates.includes(predicate),
      })),
      stopRules: descriptor.allowedStopRules.map((rule) => ({
        id: rule,
        label: stopRuleLabels[rule]?.[0] ?? rule,
        description: stopRuleLabels[rule]?.[1] ?? rule,
        required: descriptor.requiredStopRules.includes(rule),
      })),
    };
  });
}

function jobStatusForUi(status: string) {
  if (status === "provider-accepted") return "provider-accepted";
  if (status === "unknown-outcome") return "unknown-outcome";
  return status;
}

async function runHistory(organizationId: string) {
  const snapshot = await organizationRef(organizationId).collection("acquisitionJobs").orderBy("updatedAt", "desc").limit(50).get();
  return snapshot.docs.map((item) => {
    const data = item.data();
    return {
      runId: typeof data.enrollmentId === "string" ? data.enrollmentId : item.id,
      customerId: typeof data.customerId === "string" ? data.customerId : typeof data.subjectId === "string" ? data.subjectId : "unknown",
      automationId: data.automationId,
      automationLabel: catalogLabels[data.automationId as AcquisitionCatalogId]?.label ?? String(data.automationId ?? "Automation"),
      status: jobStatusForUi(String(data.status ?? "held")),
      reason: `${String(data.lastExplanation?.reason ?? "state-unknown")}: ${String(data.lastExplanation?.detail ?? "")}`.trim(),
      pinnedVersion: String(data.automationVersionId ?? "unknown"),
      updatedAt: String(data.updatedAt ?? new Date(0).toISOString()),
      ...(typeof data.dueAt === "string" && !["provider-accepted", "suppressed", "cancelled", "failed", "unknown-outcome"].includes(data.status) ? { nextActionAt: data.dueAt } : {}),
    };
  });
}

export async function getLifecycleWorkspaceView(organizationId: string) {
  const [workspace, templates, history, platformControl] = await Promise.all([
    currentWorkspace(organizationId),
    templateSummaries(organizationId),
    runHistory(organizationId),
    db.collection("_platformRuntime").doc("acquisition").get(),
  ]);
  const paused = platformControl.data()?.paused !== false;
  return {
    organizationId,
    catalogVersion: LIFECYCLE_WORKSPACE_CATALOG_VERSION,
    catalog: catalogView(),
    defaults: defaultLifecycleDraft(),
    draft: workspace.draft,
    draftRevision: workspace.draftRevision,
    published: workspace.published ? { id: workspace.published.id, version: workspace.published.version, publishedAt: workspace.published.publishedAt, automations: workspace.published.automations } : null,
    templates,
    runHistory: history,
    outboundActivation: {
      status: paused ? "disabled" as const : "enabled" as const,
      explanation: paused ? "Outbound acquisition remains platform-paused. Publishing configuration does not send email until explicit runtime activation." : "Durable acquisition dispatch is enabled; D/E still recheck consent, suppression, sender readiness and current state before every provider submission.",
    },
  };
}

export async function saveLifecycleDraft(input: { organizationId: string; draft: LifecycleAutomationConfigurationRecord[]; expectedRevision: number }) {
  validateDraft(input.draft);
  const ref = workspaceRef(input.organizationId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists ? snapshot.data() as LifecycleWorkspaceRecord : defaultWorkspace(input.organizationId);
    if (current.draftRevision !== input.expectedRevision) throw new Error("Lifecycle draft changed since it was loaded. Reload before saving.");
    transaction.set(ref, {
      ...current,
      draft: JSON.parse(JSON.stringify(input.draft)),
      draftRevision: current.draftRevision + 1,
      draftUpdatedAt: new Date().toISOString(),
    }, { merge: false });
  });
  return getLifecycleWorkspaceView(input.organizationId);
}

export async function publishLifecycleDraft(input: { organizationId: string; expectedRevision: number; actorIdentityId: string }) {
  const ref = workspaceRef(input.organizationId);
  const snapshot = await ref.get();
  const current = snapshot.exists ? snapshot.data() as LifecycleWorkspaceRecord : defaultWorkspace(input.organizationId);
  if (current.draftRevision !== input.expectedRevision) throw new Error("Lifecycle draft changed since it was loaded. Reload before publishing.");
  validateDraft(current.draft);

  const templates = await Promise.all(current.draft.map(async (item) => {
    const view = await getCommunicationTemplateView(input.organizationId, item.templateId as CommunicationTemplateId);
    if (!view.published) throw new Error(`${item.templateId} must have a published immutable template version before lifecycle publication.`);
    return [item.automationId, view.published] as const;
  }));
  const templateByAutomation = new Map(templates);
  const publishedAt = new Date().toISOString();
  const version = (current.published?.version ?? 0) + 1;
  const publicationId = `${input.organizationId}-lifecycle-v${version}-${Date.now()}`;
  const definitions = current.draft.map((item): AcquisitionAutomationDefinition => {
    const descriptor = ACQUISITION_CATALOG[item.automationId];
    const template = templateByAutomation.get(item.automationId)!;
    if (template.templateId !== descriptor.templateId || template.purpose !== descriptor.purpose) throw new Error(`${item.automationId} published template contract does not match E's canonical purpose/template.`);
    const timing = timingCatalog[item.automationId].find((choice) => choice.id === item.timingId);
    if (!timing) throw new Error(`${item.automationId} timing is unavailable.`);
    const maxTimingSeconds = timing.schedule.kind === "after-trigger" ? timing.schedule.delaySeconds : timing.schedule.offsetSeconds;
    return validateAcquisitionDefinition({
      schemaVersion: ACQUISITION_AUTOMATION_SCHEMA_VERSION,
      organizationId: input.organizationId,
      automationId: item.automationId,
      versionId: `${item.automationId}-v${version}-${Date.now()}`,
      enabled: item.enabled,
      triggerEventType: descriptor.triggerEventType,
      allowedTriggerSources: [...descriptor.allowedTriggerSources],
      predicates: [...item.selectedConditionIds] as AcquisitionPredicateKey[],
      stopRules: [...descriptor.requiredStopRules],
      steps: [{ stepId: "email-1", schedule: timing.schedule, action: { kind: "email", templateId: descriptor.templateId, templateVersion: template.version, purpose: descriptor.purpose } }],
      expirationSeconds: Math.min(60 * 60 * 24 * 90, Math.max(60 * 60 * 24 * 7, maxTimingSeconds + 60 * 60 * 24 * 7)),
      retryPolicy: { maxAttempts: 3, baseBackoffSeconds: 60, maxBackoffSeconds: 3_600 },
      frequencyPolicy: { maxProviderAcceptedEffects: descriptor.purpose === "marketing" ? 3 : 5, windowSeconds: 60 * 60 * 24 * 7 },
      publishedAt,
    });
  });

  await db.runTransaction(async (transaction) => {
    const latest = await transaction.get(ref);
    const workspace = latest.exists ? latest.data() as LifecycleWorkspaceRecord : defaultWorkspace(input.organizationId);
    if (workspace.draftRevision !== input.expectedRevision) throw new Error("Lifecycle draft changed during publication. Reload before publishing.");
    const publication = { id: publicationId, version, publishedAt, publishedBy: input.actorIdentityId, automations: JSON.parse(JSON.stringify(workspace.draft)) as LifecycleAutomationConfigurationRecord[] };
    transaction.set(ref, { ...workspace, published: publication }, { merge: false });
    for (const definition of definitions) {
      transaction.create(definitionVersionRef(input.organizationId, definition.automationId, definition.versionId), JSON.parse(JSON.stringify(definition)));
      transaction.set(definitionHeadRef(input.organizationId, definition.automationId), {
        automationId: definition.automationId,
        publishedVersionId: definition.versionId,
        triggerEventType: definition.triggerEventType,
        enabled: definition.enabled,
        publishedAt,
        publicationId,
      }, { merge: false });
    }
  });
  return getLifecycleWorkspaceView(input.organizationId);
}

export class FirestoreAcquisitionDefinitionPort implements AcquisitionDefinitionPort {
  async listPublishedForTrigger(input: { organizationId: string; eventType: AnalyticsEventType }): Promise<readonly AcquisitionAutomationDefinition[]> {
    const definitions: AcquisitionAutomationDefinition[] = [];
    for (const automationId of catalogIds()) {
      const head = await definitionHeadRef(input.organizationId, automationId).get();
      const versionId = head.data()?.publishedVersionId;
      if (!head.exists || head.data()?.enabled !== true || head.data()?.triggerEventType !== input.eventType || typeof versionId !== "string") continue;
      const version = await this.getVersion({ organizationId: input.organizationId, automationId, versionId });
      if (version?.enabled) definitions.push(version);
    }
    return definitions;
  }

  async getVersion(input: { organizationId: string; automationId: AcquisitionCatalogId; versionId: string }): Promise<AcquisitionAutomationDefinition | null> {
    const snapshot = await definitionVersionRef(input.organizationId, input.automationId, input.versionId).get();
    if (!snapshot.exists) return null;
    const definition = validateAcquisitionDefinition(snapshot.data() as AcquisitionAutomationDefinition);
    if (definition.organizationId !== input.organizationId || definition.automationId !== input.automationId || definition.versionId !== input.versionId) throw new Error("Acquisition definition version scope mismatch.");
    return definition;
  }
}

export const acquisitionDefinitionPort = new FirestoreAcquisitionDefinitionPort();
