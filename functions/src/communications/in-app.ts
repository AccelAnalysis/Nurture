import type { InAppTreatmentIntent, InAppTreatmentInteraction } from "../../../shared/release3/contracts.js";
import { db } from "../firebase.js";

function organizationRef(organizationId: string) { return db.collection("organizations").doc(organizationId); }
function intentRef(intent: Pick<InAppTreatmentIntent, "organizationId" | "treatmentId">) { return organizationRef(intent.organizationId).collection("inAppTreatmentIntents").doc(intent.treatmentId); }
function slotId(customerId: string, placementId: string) { return `${encodeURIComponent(customerId)}__${encodeURIComponent(placementId)}`; }
function slotRef(organizationId: string, customerId: string, placementId: string) { return organizationRef(organizationId).collection("inAppTreatmentSlots").doc(slotId(customerId, placementId)); }
function interactionRef(interaction: InAppTreatmentInteraction) { return organizationRef(interaction.organizationId).collection("inAppTreatmentInteractions").doc(interaction.idempotencyKey.replaceAll("/", "%2F")); }

export async function putInAppTreatmentIntent(intent: InAppTreatmentIntent): Promise<{ created: boolean }> {
  const reference = intentRef(intent);
  const slot = slotRef(intent.organizationId, intent.customerId, intent.placementId);
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(reference);
    const currentSlot = await transaction.get(slot);
    if (existing.exists) return { created: false };
    transaction.create(reference, intent);
    const active = currentSlot.data() as InAppTreatmentIntent | undefined;
    if (!active || active.availableFrom <= intent.availableFrom) transaction.set(slot, intent, { merge: false });
    return { created: true };
  });
}

export async function loadInAppTreatmentIntent(input: {
  organizationId: string;
  customerId: string;
  placementId: string;
  mode: InAppTreatmentIntent["mode"];
  now?: string;
}): Promise<InAppTreatmentIntent | null> {
  const snapshot = await slotRef(input.organizationId, input.customerId, input.placementId).get();
  if (!snapshot.exists) return null;
  const intent = snapshot.data() as InAppTreatmentIntent;
  if (intent.organizationId !== input.organizationId || intent.customerId !== input.customerId || intent.placementId !== input.placementId) return null;
  if (intent.mode !== input.mode) return null;
  const now = input.now ?? new Date().toISOString();
  if (intent.availableFrom > now || (intent.expiresAt && intent.expiresAt <= now)) return null;
  return intent;
}

export async function recordInAppTreatmentInteraction(interaction: InAppTreatmentInteraction): Promise<{ created: boolean }> {
  const source = await intentRef({ organizationId: interaction.organizationId, treatmentId: interaction.treatmentId }).get();
  if (!source.exists) return { created: false };
  const intent = source.data() as InAppTreatmentIntent;
  if (intent.customerId !== interaction.customerId || intent.runId !== interaction.runId) return { created: false };
  const reference = interactionRef(interaction);
  const slot = slotRef(interaction.organizationId, interaction.customerId, intent.placementId);
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(reference);
    const current = await transaction.get(slot);
    if (existing.exists) return { created: false };
    transaction.create(reference, interaction);
    if ((interaction.interaction === "dismissed" || interaction.interaction === "acted") && current.data()?.treatmentId === interaction.treatmentId) {
      transaction.delete(slot);
    }
    return { created: true };
  });
}
