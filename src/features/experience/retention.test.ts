import { describe, expect, it } from "vitest";
import type { InAppTreatmentIntent } from "../../../shared/release3/contracts";
import { assessmentRetentionManifest, checklistRetentionManifest } from "./retention-fixtures";
import {
  activitySupportsReactivation,
  buildTreatmentInteraction,
  sanitizeMeaningfulPayload,
  validateRetentionManifest,
} from "./retention";

describe("Release 3 Experience retention contract", () => {
  it("uses the same host contract for materially different Experience fixtures", () => {
    expect(validateRetentionManifest(assessmentRetentionManifest)).toEqual([]);
    expect(validateRetentionManifest(checklistRetentionManifest)).toEqual([]);
  });

  it("rejects duplicate activity keys and unknown treatment placements", () => {
    const invalid = {
      ...assessmentRetentionManifest,
      meaningfulActivities: [assessmentRetentionManifest.meaningfulActivities[0], assessmentRetentionManifest.meaningfulActivities[0]],
      premiumCapabilities: [{ ...assessmentRetentionManifest.premiumCapabilities[0], placementId: "missing" }],
    };
    const errors = validateRetentionManifest(invalid);
    expect(errors.some((error) => error.includes("Duplicate meaningful activity"))).toBe(true);
    expect(errors).toContain("Unknown placement: missing.");
  });

  it("copies only explicitly allowlisted lifecycle payload keys", () => {
    const definition = assessmentRetentionManifest.meaningfulActivities[0];
    expect(sanitizeMeaningfulPayload(definition, { resultBand: "high", email: "private@example.com", rawAnswers: [1, 2] }))
      .toEqual({ resultBand: "high" });
  });

  it("does not infer reactivation from an arbitrary page or activity", () => {
    expect(activitySupportsReactivation({ key: "page.opened", label: "Page", description: "Navigation only" })).toBe(false);
    expect(activitySupportsReactivation(checklistRetentionManifest.meaningfulActivities[0])).toBe(true);
  });

  it("uses a stable interaction idempotency key so refresh/retry cannot create another logical interaction", () => {
    const treatment: InAppTreatmentIntent = {
      treatmentId: "treatment-1",
      runId: "run-1",
      organizationId: "org-a",
      customerId: "customer-a",
      placementId: "experience.contextual",
      templateId: "upgrade",
      templateVersion: 2,
      title: "Unlock more",
      body: "Review the eligible offer.",
      availableFrom: "2026-09-05T12:00:00.000Z",
      mode: "test",
      purpose: "promotional",
    };
    const first = buildTreatmentInteraction({ treatment, interaction: "dismissed", occurredAt: "2026-09-05T12:01:00.000Z" });
    const replay = buildTreatmentInteraction({ treatment, interaction: "dismissed", occurredAt: "2026-09-05T12:02:00.000Z" });
    expect(first.idempotencyKey).toBe(replay.idempotencyKey);
  });
});
