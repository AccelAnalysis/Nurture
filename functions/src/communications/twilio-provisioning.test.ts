import assert from "node:assert/strict";
import test from "node:test";
import type { OrganizationA2pRegistration, OrganizationSmsSender } from "./branded-types.js";
import { initializeTwilioA2pCampaignInquiry } from "./twilio-provisioning.js";

const sender: OrganizationSmsSender = {
  organizationId: "org-a",
  provider: "twilio",
  senderKind: "long-code",
  messagingServiceSid: "MG0123456789abcdef0123456789abcdef",
  phoneNumberSid: "PN0123456789abcdef0123456789abcdef",
  phoneNumber: "+14045550198",
  countryCode: "US",
  status: "pending",
  updatedAt: "2026-09-06T00:00:00.000Z",
};

function registration(overrides: Partial<OrganizationA2pRegistration> = {}): OrganizationA2pRegistration {
  return {
    organizationId: "org-a",
    provider: "twilio",
    legalBusinessName: "Acme Health, Inc.",
    brandName: "Acme Health",
    website: "https://acme.example/",
    countryCode: "US",
    contactEmail: "compliance@acme.example",
    status: "draft",
    updatedAt: "2026-09-06T00:00:00.000Z",
    ...overrides,
  };
}

test("A2P campaign inquiry requires both public policy URLs", async () => {
  await assert.rejects(
    initializeTwilioA2pCampaignInquiry({
      registration: registration({ privacyPolicyUrl: "https://acme.example/privacy" }),
      sender,
      a2pBrandRegistrationSid: "BN0123456789abcdef0123456789abcdef",
    }),
    /Privacy Policy and Terms & Conditions URLs/,
  );
  await assert.rejects(
    initializeTwilioA2pCampaignInquiry({
      registration: registration({ termsAndConditionsUrl: "https://acme.example/terms" }),
      sender,
      a2pBrandRegistrationSid: "BN0123456789abcdef0123456789abcdef",
    }),
    /Privacy Policy and Terms & Conditions URLs/,
  );
});

test("A2P campaign inquiry rejects a non-BN brand identifier before provider submission", async () => {
  await assert.rejects(
    initializeTwilioA2pCampaignInquiry({
      registration: registration({
        privacyPolicyUrl: "https://acme.example/privacy",
        termsAndConditionsUrl: "https://acme.example/terms",
      }),
      sender,
      a2pBrandRegistrationSid: "not-a-brand-sid",
    }),
    /valid A2P Brand Registration SID/,
  );
});
