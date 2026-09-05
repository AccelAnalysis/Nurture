import { createNurtureDefaultConfiguration } from "./defaults";
import type {
  ConfigurationProvenance,
  ConfigurationValidationIssue,
  OrganizationConfiguration,
  OrganizationConfigurationOverride,
} from "./types";

function isEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function diffRecord<T extends object>(baseline: T, current: T): Partial<T> {
  const result: Partial<T> = {};
  (Object.keys(baseline) as Array<keyof T>).forEach((key) => {
    if (!isEqual(baseline[key], current[key])) result[key] = current[key];
  });
  return result;
}

function hasValues(value: object | undefined) {
  return Boolean(value && Object.keys(value).length);
}

export function resolveOrganizationConfiguration(
  organizationId: string,
  overrides: OrganizationConfigurationOverride = {},
): OrganizationConfiguration {
  const defaults = createNurtureDefaultConfiguration(organizationId);
  return {
    ...defaults,
    brand: {
      ...defaults.brand,
      ...overrides.brand,
    },
    site: {
      ...defaults.site,
      ...overrides.site,
      primaryCta: overrides.site?.primaryCta ?? defaults.site.primaryCta,
      secondaryCta: overrides.site?.secondaryCta ?? defaults.site.secondaryCta,
      heroMedia: overrides.site?.heroMedia ?? defaults.site.heroMedia,
      navigation: overrides.site?.navigation ?? defaults.site.navigation,
      features: overrides.site?.features ?? defaults.site.features,
    },
    metadata: {
      ...defaults.metadata,
      ...overrides.metadata,
    },
  };
}

export function deriveOrganizationOverrides(
  organizationId: string,
  effective: OrganizationConfiguration,
): OrganizationConfigurationOverride {
  const defaults = createNurtureDefaultConfiguration(organizationId);
  const brand = diffRecord(defaults.brand, effective.brand);
  const site = diffRecord(defaults.site, effective.site);
  const metadata = diffRecord(defaults.metadata, effective.metadata);

  return {
    ...(hasValues(brand) ? { brand } : {}),
    ...(hasValues(site) ? { site } : {}),
    ...(hasValues(metadata) ? { metadata } : {}),
  };
}

export function configurationFieldProvenance(
  overrides: OrganizationConfigurationOverride,
  section: keyof OrganizationConfigurationOverride,
  field: string,
): ConfigurationProvenance {
  const sectionValue = overrides[section];
  return sectionValue && Object.prototype.hasOwnProperty.call(sectionValue, field)
    ? "organization-override"
    : "nurture-default";
}

export function resetConfigurationField(
  overrides: OrganizationConfigurationOverride,
  section: keyof OrganizationConfigurationOverride,
  field: string,
): OrganizationConfigurationOverride {
  const next: OrganizationConfigurationOverride = {
    ...overrides,
    brand: overrides.brand ? { ...overrides.brand } : undefined,
    site: overrides.site ? { ...overrides.site } : undefined,
    metadata: overrides.metadata ? { ...overrides.metadata } : undefined,
  };
  const sectionValue = next[section] as Record<string, unknown> | undefined;
  if (!sectionValue) return overrides;
  delete sectionValue[field];
  if (!Object.keys(sectionValue).length) delete next[section];
  return next;
}

export function isSafePublicHref(value: string) {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return ["https:", "mailto:", "tel:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export function isSafeMediaUrl(value: string) {
  if (!value) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function hostFor(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isYouTubeHost(host: string) {
  return ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtube-nocookie.com"].includes(host);
}

function isVimeoHost(host: string) {
  return ["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host);
}

export function validateOrganizationConfiguration(configuration: OrganizationConfiguration): ConfigurationValidationIssue[] {
  const issues: ConfigurationValidationIssue[] = [];
  const required = (field: string, value: string, label: string) => {
    if (!value.trim()) issues.push({ field, message: `${label} is required.`, severity: "error" });
  };
  const safeHref = (field: string, value: string, label: string) => {
    if (!isSafePublicHref(value)) issues.push({ field, message: `${label} must be a relative path or an approved https/mail/tel URL.`, severity: "error" });
  };

  required("brand.applicationName", configuration.brand.applicationName, "Application name");
  required("site.headline", configuration.site.headline, "Headline");
  required("site.supportingText", configuration.site.supportingText, "Supporting text");
  required("site.primaryCta.label", configuration.site.primaryCta.label, "Primary CTA label");
  required("metadata.homeTitle", configuration.metadata.homeTitle, "Home page title");
  required("metadata.homeDescription", configuration.metadata.homeDescription, "Home page description");

  if (!/^#[0-9a-f]{6}$/i.test(configuration.brand.accentColor)) {
    issues.push({ field: "brand.accentColor", message: "Accent color must be a six-digit hex color.", severity: "error" });
  }
  if (!isSafeMediaUrl(configuration.brand.logoUrl)) {
    issues.push({ field: "brand.logoUrl", message: "Logo must use a relative application path or HTTPS URL.", severity: "error" });
  }

  safeHref("site.primaryCta.href", configuration.site.primaryCta.href, "Primary CTA destination");
  safeHref("site.secondaryCta.href", configuration.site.secondaryCta.href, "Secondary CTA destination");
  safeHref("site.privacyHref", configuration.site.privacyHref, "Privacy destination");
  safeHref("site.termsHref", configuration.site.termsHref, "Terms destination");

  const navigationIds = new Set<string>();
  configuration.site.navigation.forEach((item, index) => {
    if (navigationIds.has(item.id)) {
      issues.push({ field: `site.navigation.${index}.id`, message: "Navigation item IDs must be unique.", severity: "error" });
    }
    navigationIds.add(item.id);
    if (!item.label.trim()) issues.push({ field: `site.navigation.${index}.label`, message: "Navigation labels cannot be empty.", severity: "error" });
    if (!isSafePublicHref(item.href)) issues.push({ field: `site.navigation.${index}.href`, message: "Navigation destinations must be safe relative or HTTPS URLs.", severity: "error" });
  });

  const media = configuration.site.heroMedia;
  if (media.kind !== "none") {
    if (!isSafeMediaUrl(media.url)) {
      issues.push({ field: "site.heroMedia.url", message: "Hero media must use a relative application path or HTTPS URL.", severity: "error" });
    }
    const host = hostFor(media.url);
    if (media.kind === "youtube" && !isYouTubeHost(host)) {
      issues.push({ field: "site.heroMedia.url", message: "YouTube media must use an approved YouTube host.", severity: "error" });
    }
    if (media.kind === "vimeo" && !isVimeoHost(host)) {
      issues.push({ field: "site.heroMedia.url", message: "Vimeo media must use an approved Vimeo host.", severity: "error" });
    }
    if (media.kind === "image" && !media.alt.trim()) {
      issues.push({ field: "site.heroMedia.alt", message: "Meaningful hero images require alt text.", severity: "error" });
    }
    if (!media.sourceUrl?.trim() || !media.rightsNote?.trim()) {
      issues.push({ field: "site.heroMedia.sourceUrl", message: "Record media source and rights metadata before production approval.", severity: "warning" });
    }
    if ((media.kind === "youtube" || media.kind === "vimeo" || media.kind === "video") && !media.posterUrl?.trim()) {
      issues.push({ field: "site.heroMedia.posterUrl", message: "Add a static poster for reduced-motion and playback-failure fallback.", severity: "warning" });
    }
  }

  if (configuration.metadata.socialImageUrl && !isSafeMediaUrl(configuration.metadata.socialImageUrl)) {
    issues.push({ field: "metadata.socialImageUrl", message: "Social image must use a relative application path or HTTPS URL.", severity: "error" });
  }

  return issues;
}
