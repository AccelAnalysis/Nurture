import { NURTURE_DEFAULT_TEMPLATE_VERSION } from "./defaults";
import { deriveOrganizationOverrides, resolveOrganizationConfiguration } from "./resolver";
import {
  CONFIGURATION_SCHEMA_VERSION,
  type ConfigurationExtension,
  type ConfigurationVersion,
  type OrganizationConfiguration,
  type OrganizationConfigurationRecord,
  type Publication,
  type PublishedConfigurationExtension,
} from "./types";

export const CONFIGURATION_CHANGED_EVENT = "nurture:configuration-changed";

export interface ConfigurationStore {
  getRecord(organizationId: string): OrganizationConfigurationRecord;
  getDraft(organizationId: string): OrganizationConfiguration;
  getPublished(organizationId: string): OrganizationConfiguration;
  getDraftExtension(organizationId: string, extensionKey: string): ConfigurationExtension | null;
  getPublishedExtension(organizationId: string, extensionKey: string): PublishedConfigurationExtension | null;
  /** Track A Brand/Site/metadata save. Opaque cross-track extensions are preserved. */
  saveDraft(organizationId: string, effective: OrganizationConfiguration): OrganizationConfigurationRecord;
  saveDraftExtension(organizationId: string, extensionKey: string, extension: ConfigurationExtension): OrganizationConfigurationRecord;
  removeDraftExtension(organizationId: string, extensionKey: string): OrganizationConfigurationRecord;
  /** Reset only Track A-owned Brand/Site/metadata draft values; cross-track extension drafts survive. */
  resetDraft(organizationId: string): OrganizationConfigurationRecord;
  /** Explicit destructive reset for orchestration/testing that intentionally clears every draft domain. */
  resetAllDraft(organizationId: string): OrganizationConfigurationRecord;
  publish(organizationId: string, publishedBy?: string): OrganizationConfigurationRecord;
}

function emptyRecord(organizationId: string): OrganizationConfigurationRecord {
  return {
    organizationId,
    baseTemplateVersion: NURTURE_DEFAULT_TEMPLATE_VERSION,
    draftOverrides: {},
    versions: [],
    publication: null,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeEffective(configuration: OrganizationConfiguration): OrganizationConfiguration {
  return {
    ...configuration,
    extensions: configuration.extensions ?? {},
  };
}

export class BrowserConfigurationStore implements ConfigurationStore {
  private readonly prefix = "nurture:organization-configuration:v1:";
  private memory = new Map<string, OrganizationConfigurationRecord>();

  private key(organizationId: string) {
    return `${this.prefix}${organizationId}`;
  }

  private read(organizationId: string): OrganizationConfigurationRecord {
    const inMemory = this.memory.get(organizationId);
    if (!isBrowser()) return clone(inMemory ?? emptyRecord(organizationId));

    const raw = window.localStorage.getItem(this.key(organizationId));
    if (!raw) return clone(inMemory ?? emptyRecord(organizationId));

    try {
      const parsed = JSON.parse(raw) as Partial<OrganizationConfigurationRecord>;
      if (parsed.organizationId !== organizationId) return emptyRecord(organizationId);
      return {
        ...emptyRecord(organizationId),
        ...parsed,
        organizationId,
        draftOverrides: parsed.draftOverrides ?? {},
        versions: Array.isArray(parsed.versions) ? parsed.versions : [],
        publication: parsed.publication ?? null,
      };
    } catch {
      return emptyRecord(organizationId);
    }
  }

  private write(record: OrganizationConfigurationRecord) {
    const safe = clone(record);
    this.memory.set(record.organizationId, safe);
    if (isBrowser()) {
      window.localStorage.setItem(this.key(record.organizationId), JSON.stringify(safe));
      window.dispatchEvent(new CustomEvent(CONFIGURATION_CHANGED_EVENT, { detail: { organizationId: record.organizationId } }));
    }
    return clone(safe);
  }

  getRecord(organizationId: string) {
    return this.read(organizationId);
  }

  getDraft(organizationId: string) {
    const record = this.read(organizationId);
    return resolveOrganizationConfiguration(organizationId, record.draftOverrides);
  }

  getPublished(organizationId: string) {
    const record = this.read(organizationId);
    if (!record.publication) return resolveOrganizationConfiguration(organizationId);
    const version = record.versions.find((item) => item.id === record.publication?.configurationVersionId);
    return version?.effective
      ? normalizeEffective(clone(version.effective))
      : resolveOrganizationConfiguration(organizationId);
  }

  getDraftExtension(organizationId: string, extensionKey: string) {
    return clone(this.getDraft(organizationId).extensions[extensionKey] ?? null);
  }

  getPublishedExtension(organizationId: string, extensionKey: string): PublishedConfigurationExtension | null {
    const record = this.read(organizationId);
    if (!record.publication) return null;
    const version = record.versions.find((item) => item.id === record.publication?.configurationVersionId);
    if (!version?.effective) return null;
    const extension = normalizeEffective(version.effective).extensions[extensionKey];
    if (!extension) return null;
    return {
      organizationId,
      extensionKey,
      extension: clone(extension),
      configurationVersionId: version.id,
      configurationVersion: version.version,
      publishedAt: version.publishedAt,
    };
  }

  saveDraft(organizationId: string, effective: OrganizationConfiguration) {
    const record = this.read(organizationId);
    const derived = deriveOrganizationOverrides(organizationId, normalizeEffective(effective));
    const extensions = record.draftOverrides.extensions;
    const next: OrganizationConfigurationRecord = {
      ...record,
      baseTemplateVersion: NURTURE_DEFAULT_TEMPLATE_VERSION,
      draftOverrides: {
        ...derived,
        ...(extensions && Object.keys(extensions).length ? { extensions: clone(extensions) } : {}),
      },
      draftUpdatedAt: new Date().toISOString(),
    };
    return this.write(next);
  }

  saveDraftExtension(organizationId: string, extensionKey: string, extension: ConfigurationExtension) {
    const record = this.read(organizationId);
    const extensions = {
      ...(record.draftOverrides.extensions ?? {}),
      [extensionKey]: clone(extension),
    };
    return this.write({
      ...record,
      baseTemplateVersion: NURTURE_DEFAULT_TEMPLATE_VERSION,
      draftOverrides: { ...record.draftOverrides, extensions },
      draftUpdatedAt: new Date().toISOString(),
    });
  }

  removeDraftExtension(organizationId: string, extensionKey: string) {
    const record = this.read(organizationId);
    const extensions = { ...(record.draftOverrides.extensions ?? {}) };
    delete extensions[extensionKey];
    const draftOverrides = { ...record.draftOverrides };
    if (Object.keys(extensions).length) draftOverrides.extensions = extensions;
    else delete draftOverrides.extensions;
    return this.write({
      ...record,
      baseTemplateVersion: NURTURE_DEFAULT_TEMPLATE_VERSION,
      draftOverrides,
      draftUpdatedAt: new Date().toISOString(),
    });
  }

  resetDraft(organizationId: string) {
    const record = this.read(organizationId);
    const extensions = record.draftOverrides.extensions;
    return this.write({
      ...record,
      baseTemplateVersion: NURTURE_DEFAULT_TEMPLATE_VERSION,
      draftOverrides: extensions && Object.keys(extensions).length ? { extensions: clone(extensions) } : {},
      draftUpdatedAt: new Date().toISOString(),
    });
  }

  resetAllDraft(organizationId: string) {
    const record = this.read(organizationId);
    return this.write({
      ...record,
      baseTemplateVersion: NURTURE_DEFAULT_TEMPLATE_VERSION,
      draftOverrides: {},
      draftUpdatedAt: new Date().toISOString(),
    });
  }

  publish(organizationId: string, publishedBy?: string) {
    const record = this.read(organizationId);
    const effective = resolveOrganizationConfiguration(organizationId, record.draftOverrides);
    const publishedAt = new Date().toISOString();
    const versionNumber = Math.max(0, ...record.versions.map((item) => item.version)) + 1;
    const versionId = `${organizationId}-configuration-v${versionNumber}-${Date.now()}`;
    const version: ConfigurationVersion = {
      id: versionId,
      organizationId,
      version: versionNumber,
      baseTemplateVersion: NURTURE_DEFAULT_TEMPLATE_VERSION,
      schemaVersion: CONFIGURATION_SCHEMA_VERSION,
      overrides: clone(record.draftOverrides),
      effective: clone(effective),
      publishedAt,
      ...(publishedBy ? { publishedBy } : {}),
    };
    const publication: Publication = {
      organizationId,
      configurationVersionId: versionId,
      version: versionNumber,
      publishedAt,
    };
    return this.write({
      ...record,
      baseTemplateVersion: NURTURE_DEFAULT_TEMPLATE_VERSION,
      versions: [...record.versions, version],
      publication,
    });
  }
}

export const configurationStore: ConfigurationStore = new BrowserConfigurationStore();

/**
 * Production integration boundary for Track E:
 * replace `configurationStore` with a tenant-authorized implementation that persists
 * the same contracts to the existing Firebase project, enforces organization scope
 * server-side, uses Track E's `brand.*` authorization and audit conventions, and keeps
 * opaque extension payloads scoped/versioned without interpreting another track's data.
 * UI components must not call Firestore or privileged provider APIs directly.
 */
