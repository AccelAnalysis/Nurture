import type { ExperienceDefinitionSource } from "../../features/experience/contracts";
import { createRegisteredExperience, getExperienceRegistration } from "../../features/experience/registry";

/**
 * The Hosting-only release serves an explicitly shipped reference installation.
 * This is not a browser publication or an entitlement. Once backend publishing
 * is activated, a missing published configuration must stay unavailable.
 */
export function createReleaseExperienceDefinitionSource(
  publishedSource: ExperienceDefinitionSource,
  useShippedReference: boolean,
): ExperienceDefinitionSource {
  if (!useShippedReference) return publishedSource;
  return {
    async loadPublishedExperience(request) {
      if (!request.organizationId) return null;
      const registration = getExperienceRegistration(request.slot);
      if (!registration || registration.id !== request.moduleId || registration.moduleVersion !== request.moduleVersion) return null;
      return createRegisteredExperience(registration, request.organizationId);
    },
  };
}
