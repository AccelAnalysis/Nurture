import assert from "node:assert/strict";
import {
  createExperienceConfigurationExtension,
  createTrackAExperienceDefinitionSource,
  createTrackAExperienceOrganizationSource,
  experienceConfigurationExtensionKey,
} from "../src/features/experience/configuration.ts";
import {
  authorizeProjectedCapability,
  projectCommercialEntitlements,
} from "../shared/experience/entitlements.ts";
import { REFERENCE_ASSESSMENT_CAPABILITIES } from "../shared/experience/reference-capabilities.ts";

const offer = {
  id: "premium",
  organizationId: "org-a",
  status: "published",
  capabilityKeys: [
    REFERENCE_ASSESSMENT_CAPABILITIES.deepDive,
    "experience.unknown-capability",
  ],
};

const subscription = {
  organizationId: "org-a",
  customerId: "customer-1",
  offerId: "premium",
  providerSubscriptionId: "sub_test_1",
  status: "active",
  trustedAt: "2026-09-05T12:00:00.000Z",
  cancelAtPeriodEnd: false,
  currentPeriodEnd: "2026-10-05T12:00:00.000Z",
};

const projection = projectCommercialEntitlements({
  offer,
  subscription,
  experienceId: "org-a:primary:nurture.reference-assessment",
  declaredCapabilities: [{ key: REFERENCE_ASSESSMENT_CAPABILITIES.deepDive }],
  fetchedAt: "2026-09-05T12:01:00.000Z",
});

assert.equal(projection.ok, true);
if (!projection.ok) throw new Error("Expected active subscription projection to succeed.");
assert.deepEqual(projection.unmappedCapabilityKeys, ["experience.unknown-capability"]);
assert.equal(projection.snapshot.entitlements.length, 1);
assert.equal(projection.snapshot.entitlements[0]?.capabilityKey, REFERENCE_ASSESSMENT_CAPABILITIES.deepDive);

const allowed = authorizeProjectedCapability({
  snapshot: projection.snapshot,
  organizationId: "org-a",
  customerId: "customer-1",
  experienceId: "org-a:primary:nurture.reference-assessment",
  capabilityKey: REFERENCE_ASSESSMENT_CAPABILITIES.deepDive,
  now: "2026-09-06T12:00:00.000Z",
});
assert.equal(allowed.allowed, true);

const wrongTenant = authorizeProjectedCapability({
  snapshot: projection.snapshot,
  organizationId: "org-b",
  customerId: "customer-1",
  experienceId: "org-a:primary:nurture.reference-assessment",
  capabilityKey: REFERENCE_ASSESSMENT_CAPABILITIES.deepDive,
  now: "2026-09-06T12:00:00.000Z",
});
assert.deepEqual(wrongTenant, { allowed: false, reason: "scope-mismatch" });

const expired = authorizeProjectedCapability({
  snapshot: projection.snapshot,
  organizationId: "org-a",
  customerId: "customer-1",
  experienceId: "org-a:primary:nurture.reference-assessment",
  capabilityKey: REFERENCE_ASSESSMENT_CAPABILITIES.deepDive,
  now: "2026-11-01T12:00:00.000Z",
});
assert.deepEqual(expired, { allowed: false, reason: "entitlement-expired" });

const canceled = projectCommercialEntitlements({
  offer,
  subscription: { ...subscription, status: "canceled" },
  experienceId: "org-a:primary:nurture.reference-assessment",
  declaredCapabilities: [{ key: REFERENCE_ASSESSMENT_CAPABILITIES.deepDive }],
  fetchedAt: "2026-09-05T12:01:00.000Z",
});
assert.equal(canceled.ok, true);
if (!canceled.ok) throw new Error("Expected canceled subscription projection to return an empty trusted snapshot.");
assert.equal(canceled.snapshot.entitlements.length, 0);

const crossTenantProjection = projectCommercialEntitlements({
  offer,
  subscription: { ...subscription, organizationId: "org-b" },
  experienceId: "org-a:primary:nurture.reference-assessment",
  declaredCapabilities: [{ key: REFERENCE_ASSESSMENT_CAPABILITIES.deepDive }],
});
assert.deepEqual(crossTenantProjection, {
  ok: false,
  reason: "scope-mismatch",
  explanation: "The Offer and subscription belong to different organizations.",
});

const configuredExperience = {
  id: "org-a:primary:nurture.reference-assessment",
  organizationId: "org-a",
  moduleId: "nurture.reference-assessment",
  moduleVersion: "1.0.0",
  slot: "primary",
  status: "published",
  configurationVersion: "draft-placeholder",
  configuration: { title: "Organization Momentum Check", completionMessage: "Ready for the next step." },
};
const extensionKey = experienceConfigurationExtensionKey(
  configuredExperience.slot,
  configuredExperience.moduleId,
  configuredExperience.moduleVersion,
);
const extension = createExperienceConfigurationExtension(configuredExperience);
const definitionSource = createTrackAExperienceDefinitionSource({
  getPublishedExtension(organizationId, requestedKey) {
    assert.equal(organizationId, "org-a");
    assert.equal(requestedKey, extensionKey);
    return {
      organizationId,
      extensionKey: requestedKey,
      extension,
      configurationVersionId: "org-a-configuration-v4",
      configurationVersion: 4,
      publishedAt: "2026-09-05T12:02:00.000Z",
    };
  },
});
const publishedExperience = await definitionSource.loadPublishedExperience({
  organizationId: "org-a",
  slot: "primary",
  moduleId: "nurture.reference-assessment",
  moduleVersion: "1.0.0",
});
assert.equal(publishedExperience?.configurationVersion, "org-a-configuration-v4");
assert.equal(publishedExperience?.configuration.title, "Organization Momentum Check");
assert.equal(publishedExperience?.status, "published");

const organizationSource = createTrackAExperienceOrganizationSource(() => "org-public");
assert.equal(organizationSource.resolveOrganizationId({ accessMode: "trial" }), "org-public");
assert.equal(
  organizationSource.resolveOrganizationId({ accessMode: "authenticated", authenticatedOrganizationId: "org-auth" }),
  "org-auth",
);

console.log("Experience cross-track contract verification passed.");
