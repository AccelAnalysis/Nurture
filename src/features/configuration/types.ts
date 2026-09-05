export const CONFIGURATION_SCHEMA_VERSION = 1 as const;

export type AppearanceMode = "system" | "light" | "dark";
export type HeroMediaKind = "none" | "image" | "youtube" | "vimeo" | "video";

export interface MediaAsset {
  kind: HeroMediaKind;
  url: string;
  posterUrl?: string;
  alt: string;
  sourceUrl?: string;
  creator?: string;
  rightsNote?: string;
}

export interface BrandConfiguration {
  applicationName: string;
  logoUrl: string;
  logoAlt: string;
  iconUrl?: string;
  accentColor: string;
  appearance: AppearanceMode;
}

export interface NavigationItem {
  id: string;
  label: string;
  href: string;
}

export interface CallToActionConfiguration {
  label: string;
  href: string;
}

export interface SiteFeature {
  id: string;
  title: string;
  body: string;
}

export interface SiteConfiguration {
  eyebrow: string;
  headline: string;
  supportingText: string;
  primaryCta: CallToActionConfiguration;
  secondaryCta: CallToActionConfiguration;
  heroMedia: MediaAsset;
  navigation: NavigationItem[];
  features: SiteFeature[];
  proofHeading?: string;
  proofBody?: string;
  contactEmail?: string;
  footerTagline: string;
  copyrightText: string;
  privacyHref: string;
  termsHref: string;
}

export interface PublicMetadataConfiguration {
  homeTitle: string;
  homeDescription: string;
  socialImageUrl?: string;
}

export interface OrganizationConfiguration {
  schemaVersion: typeof CONFIGURATION_SCHEMA_VERSION;
  organizationId: string;
  baseTemplateVersion: string;
  brand: BrandConfiguration;
  site: SiteConfiguration;
  metadata: PublicMetadataConfiguration;
}

export interface BrandConfigurationOverride {
  applicationName?: string;
  logoUrl?: string;
  logoAlt?: string;
  iconUrl?: string;
  accentColor?: string;
  appearance?: AppearanceMode;
}

export interface SiteConfigurationOverride {
  eyebrow?: string;
  headline?: string;
  supportingText?: string;
  primaryCta?: CallToActionConfiguration;
  secondaryCta?: CallToActionConfiguration;
  heroMedia?: MediaAsset;
  navigation?: NavigationItem[];
  features?: SiteFeature[];
  proofHeading?: string;
  proofBody?: string;
  contactEmail?: string;
  footerTagline?: string;
  copyrightText?: string;
  privacyHref?: string;
  termsHref?: string;
}

export interface PublicMetadataConfigurationOverride {
  homeTitle?: string;
  homeDescription?: string;
  socialImageUrl?: string;
}

export interface OrganizationConfigurationOverride {
  brand?: BrandConfigurationOverride;
  site?: SiteConfigurationOverride;
  metadata?: PublicMetadataConfigurationOverride;
}

export interface ConfigurationVersion {
  id: string;
  organizationId: string;
  version: number;
  baseTemplateVersion: string;
  schemaVersion: typeof CONFIGURATION_SCHEMA_VERSION;
  overrides: OrganizationConfigurationOverride;
  effective: OrganizationConfiguration;
  publishedAt: string;
  publishedBy?: string;
}

export interface Publication {
  organizationId: string;
  configurationVersionId: string;
  version: number;
  publishedAt: string;
}

export interface OrganizationConfigurationRecord {
  organizationId: string;
  baseTemplateVersion: string;
  draftOverrides: OrganizationConfigurationOverride;
  draftUpdatedAt?: string;
  versions: ConfigurationVersion[];
  publication: Publication | null;
}

export type ConfigurationProvenance = "nurture-default" | "organization-override";

export interface ResolvedField<T> {
  value: T;
  provenance: ConfigurationProvenance;
}

export interface ConfigurationValidationIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export type PreviewViewport = "desktop" | "tablet" | "mobile";
