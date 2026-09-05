import { CONFIGURATION_SCHEMA_VERSION, type OrganizationConfiguration } from "./types";

export const NURTURE_DEFAULT_TEMPLATE_VERSION = "nurture-defaults-2026-09-05-v1";

const DEFAULT_FEATURES = [
  {
    id: "start-with-value",
    title: "Start with value",
    body: "Let visitors understand the Experience before asking them to register or purchase.",
  },
  {
    id: "configure-without-code",
    title: "Configure the shell",
    body: "Use Nurture defaults, then override only the brand and site details that make this application yours.",
  },
  {
    id: "publish-deliberately",
    title: "Publish deliberately",
    body: "Preview draft changes at multiple sizes and publish only when the organization is ready.",
  },
] as const;

export function createNurtureDefaultConfiguration(organizationId: string): OrganizationConfiguration {
  return {
    schemaVersion: CONFIGURATION_SCHEMA_VERSION,
    organizationId,
    baseTemplateVersion: NURTURE_DEFAULT_TEMPLATE_VERSION,
    brand: {
      applicationName: "Nurture",
      logoUrl: "/brand/logo/nurture-n-glass.png",
      logoAlt: "Nurture",
      accentColor: "#0264EC",
      appearance: "system",
    },
    site: {
      eyebrow: "A configurable application foundation",
      headline: "Turn a strong Experience into a lasting customer relationship.",
      supportingText: "Nurture supplies the configurable shell around your Experience: public acquisition, offers, identity handoffs, onboarding, ongoing participation, feedback, and referrals.",
      primaryCta: { label: "Start an Experience", href: "/experience" },
      secondaryCta: { label: "View offers", href: "/offers" },
      heroMedia: {
        kind: "none",
        url: "",
        alt: "",
        sourceUrl: "",
        rightsNote: "No default third-party media is published. Configure approved media with source and rights metadata before publishing.",
      },
      navigation: [
        { id: "features", label: "Features", href: "/features" },
        { id: "offers", label: "Offers", href: "/offers" },
        { id: "experience", label: "Experience", href: "/experience" },
        { id: "about", label: "About", href: "/about" },
      ],
      features: DEFAULT_FEATURES.map((feature) => ({ ...feature })),
      proofHeading: "A complete shell before the first customization",
      proofBody: "Every organization begins with useful Nurture defaults. Organization overrides remain scoped to that tenant and unpublished work stays out of production.",
      footerTagline: "A configurable foundation around the Experience.",
      copyrightText: `© ${new Date().getFullYear()} Nurture`,
      privacyHref: "/privacy",
      termsHref: "/terms",
    },
    metadata: {
      homeTitle: "Nurture — Configurable application foundation",
      homeDescription: "Nurture is a configurable application foundation that supplies the lifecycle around a pluggable Experience.",
    },
    extensions: {},
  };
}
