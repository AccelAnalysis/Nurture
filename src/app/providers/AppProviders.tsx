import { useMemo, type ReactNode } from "react";
import { OrganizationProvider } from "../../context/OrganizationContext";
import { ConfigurationProvider, useConfiguration } from "../../features/configuration/ConfigurationProvider";
import { AuthProvider } from "../../features/identity/auth";
import { PlatformProvider } from "../../context/PlatformContext";
import { ExperienceRuntimeProvider } from "../../features/experience/runtime";
import { createTrackAExperienceDefinitionSource, createTrackAExperienceOrganizationSource } from "../../features/experience/configuration";
import { releaseCustomerSource, releaseEntitlementSource, releaseOperationSource } from "../release/runtime";

function ComposedExperience({ children }: { children: ReactNode }) {
  const configuration = useConfiguration();
  const organizationSource = useMemo(() => createTrackAExperienceOrganizationSource(() => configuration.publicOrganizationId), [configuration.publicOrganizationId]);
  const definitionSource = useMemo(() => createTrackAExperienceDefinitionSource(configuration), [configuration.getPublishedExtension]);
  return <ExperienceRuntimeProvider organizationSource={organizationSource} definitionSource={definitionSource} customerSource={releaseCustomerSource} entitlementSource={releaseEntitlementSource} operationSource={releaseOperationSource}>
    <PlatformProvider>{children}</PlatformProvider>
  </ExperienceRuntimeProvider>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return <AuthProvider><OrganizationProvider><ConfigurationProvider><ComposedExperience>{children}</ComposedExperience></ConfigurationProvider></OrganizationProvider></AuthProvider>;
}
