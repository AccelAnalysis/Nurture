import type {
  Experience,
  ExperienceDefinitionSource,
  ExperienceSlot,
  JsonObject,
} from "./contracts";

export const EXPERIENCE_CONFIGURATION_EXTENSION_NAMESPACE = "nurture.experience";
export const EXPERIENCE_CONFIGURATION_EXTENSION_SCHEMA_VERSION = "1";

export interface TrackAConfigurationExtensionLike {
  namespace: string;
  schemaVersion: string;
  payload: JsonObject;
}

export interface TrackAPublishedConfigurationExtensionLike {
  organizationId: string;
  extensionKey: string;
  extension: TrackAConfigurationExtensionLike;
  configurationVersionId: string;
  configurationVersion: number;
  publishedAt: string;
}

/** Structural subset of Track A's completed ConfigurationStore. */
export interface TrackAConfigurationExtensionReader {
  getPublishedExtension(
    organizationId: string,
    extensionKey: string,
  ):
    | TrackAPublishedConfigurationExtensionLike
    | null
    | Promise<TrackAPublishedConfigurationExtensionLike | null>;
}

/** Structural write subset used by a Track B organization-admin settings editor. */
export interface TrackAConfigurationExtensionWriter extends TrackAConfigurationExtensionReader {
  saveDraftExtension(
    organizationId: string,
    extensionKey: string,
    extension: TrackAConfigurationExtensionLike,
  ): unknown | Promise<unknown>;
  removeDraftExtension(
    organizationId: string,
    extensionKey: string,
  ): unknown | Promise<unknown>;
}

export function experienceConfigurationExtensionKey(
  slot: ExperienceSlot,
  moduleId: string,
  moduleVersion: string,
) {
  return `experience:${slot}:${moduleId}:${moduleVersion}`;
}

export function createExperienceConfigurationExtension(experience: Experience): TrackAConfigurationExtensionLike {
  return {
    namespace: EXPERIENCE_CONFIGURATION_EXTENSION_NAMESPACE,
    schemaVersion: EXPERIENCE_CONFIGURATION_EXTENSION_SCHEMA_VERSION,
    payload: {
      experienceId: experience.id,
      moduleId: experience.moduleId,
      moduleVersion: experience.moduleVersion,
      slot: experience.slot,
      configuration: experience.configuration,
    },
  };
}

export async function saveExperienceDraftExtension(
  store: TrackAConfigurationExtensionWriter,
  experience: Experience,
) {
  if (!experience.organizationId) {
    throw new Error("An organization-scoped Experience is required before saving organization configuration.");
  }
  const key = experienceConfigurationExtensionKey(experience.slot, experience.moduleId, experience.moduleVersion);
  return store.saveDraftExtension(
    experience.organizationId,
    key,
    createExperienceConfigurationExtension(experience),
  );
}

export async function removeExperienceDraftExtension(
  store: TrackAConfigurationExtensionWriter,
  experience: Pick<Experience, "organizationId" | "slot" | "moduleId" | "moduleVersion">,
) {
  if (!experience.organizationId) {
    throw new Error("An organization-scoped Experience is required before removing organization configuration.");
  }
  const key = experienceConfigurationExtensionKey(experience.slot, experience.moduleId, experience.moduleVersion);
  return store.removeDraftExtension(experience.organizationId, key);
}

function requireString(payload: JsonObject, field: string) {
  const value = payload[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Published Experience extension field "${field}" must be a non-empty string.`);
  }
  return value;
}

function requireConfiguration(payload: JsonObject): JsonObject {
  const value = payload.configuration;
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error("Published Experience extension configuration must be a JSON object.");
  }
  return value as JsonObject;
}

/**
 * Concrete Track A -> Track B adapter. It reads only Track A's immutable
 * published extension snapshot; draft values cannot enter the participant host.
 */
export function createTrackAExperienceDefinitionSource(
  store: TrackAConfigurationExtensionReader,
): ExperienceDefinitionSource {
  return {
    async loadPublishedExperience(request) {
      if (!request.organizationId) return null;

      const extensionKey = experienceConfigurationExtensionKey(
        request.slot,
        request.moduleId,
        request.moduleVersion,
      );
      const published = await store.getPublishedExtension(request.organizationId, extensionKey);
      if (!published) return null;

      if (published.organizationId !== request.organizationId || published.extensionKey !== extensionKey) {
        throw new Error("Track A returned an Experience extension from a different organization or extension key.");
      }
      if (published.extension.namespace !== EXPERIENCE_CONFIGURATION_EXTENSION_NAMESPACE) {
        throw new Error("Published Experience extension uses an unsupported namespace.");
      }
      if (published.extension.schemaVersion !== EXPERIENCE_CONFIGURATION_EXTENSION_SCHEMA_VERSION) {
        throw new Error("Published Experience extension uses an unsupported schema version.");
      }

      const payload = published.extension.payload;
      const experienceId = requireString(payload, "experienceId");
      const moduleId = requireString(payload, "moduleId");
      const moduleVersion = requireString(payload, "moduleVersion");
      const slot = requireString(payload, "slot");

      if (moduleId !== request.moduleId || moduleVersion !== request.moduleVersion || slot !== request.slot) {
        throw new Error("Published Experience extension does not match the trusted module registration request.");
      }

      return {
        id: experienceId,
        organizationId: published.organizationId,
        moduleId,
        moduleVersion,
        slot: request.slot,
        status: "published",
        configurationVersion: published.configurationVersionId,
        configuration: requireConfiguration(payload),
      } satisfies Experience;
    },
  };
}
