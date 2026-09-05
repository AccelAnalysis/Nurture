import { httpsCallable, type Functions } from "firebase/functions";
import type { InAppTreatmentInteraction, InAppTreatmentIntent } from "../../../shared/release3/contracts";
import type { ExperienceRetentionBridge, ExperienceRetentionContext, MeaningfulActivityDefinition, PremiumCapabilityIntentDefinition } from "./retention";

function requireCustomer(context: ExperienceRetentionContext): asserts context is ExperienceRetentionContext & { customerId: string } {
  if (!context.organizationId || !context.customerId) throw new Error("Authenticated organization/customer scope is required for lifecycle treatment.");
}

export class FirebaseExperienceRetentionBridge implements ExperienceRetentionBridge {
  constructor(private readonly functions: Functions) {}

  async submitMeaningfulActivity(_input: { context: ExperienceRetentionContext; definition: MeaningfulActivityDefinition; actionId: string; occurredAt: string; payload?: Record<string, unknown> }): Promise<{ accepted: boolean; eventId?: string }> {
    // Meaningful activity is submitted by the existing Experience event sink, whose
    // server adapter owns browser trust validation. Do not create a second event path.
    return { accepted: false };
  }

  async requestPremiumCapability(_input: { context: ExperienceRetentionContext; definition: PremiumCapabilityIntentDefinition; actionId: string; occurredAt: string }): Promise<{ accepted: boolean; requestId?: string }> {
    // Premium requests are likewise handled by the existing Experience host event sink.
    return { accepted: false };
  }

  async loadTreatment(input: { context: ExperienceRetentionContext; placementId: string }): Promise<InAppTreatmentIntent | null> {
    requireCustomer(input.context);
    const callable = httpsCallable<{ organizationId: string; customerId: string; placementId: string; dataMode: "live" }, { intent: InAppTreatmentIntent | null }>(this.functions, "r3GetInAppTreatment");
    return (await callable({ organizationId: input.context.organizationId, customerId: input.context.customerId, placementId: input.placementId, dataMode: "live" })).data.intent;
  }

  async recordTreatmentInteraction(interaction: InAppTreatmentInteraction): Promise<{ accepted: boolean }> {
    const callable = httpsCallable<{ organizationId: string; customerId: string; dataMode: "live"; interaction: InAppTreatmentInteraction }, { created: boolean }>(this.functions, "r3RecordInAppTreatmentInteraction");
    const result = (await callable({ organizationId: interaction.organizationId, customerId: interaction.customerId, dataMode: "live", interaction })).data;
    return { accepted: result.created };
  }

  async startCommercialHandoff(input: { context: ExperienceRetentionContext; treatment: InAppTreatmentIntent }): Promise<{ href: string }> {
    requireCustomer(input.context);
    if (input.treatment.organizationId !== input.context.organizationId || input.treatment.customerId !== input.context.customerId) throw new Error("Treatment scope mismatch.");
    const href = input.treatment.cta?.href;
    if (!href || !href.startsWith("/") || href.startsWith("//")) throw new Error("The lifecycle treatment does not contain an approved internal commercial handoff.");
    return { href };
  }
}
