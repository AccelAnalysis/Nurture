import type { ReactNode } from "react";
import { OrganizationProvider } from "../../context/OrganizationContext";
import { PlatformProvider } from "../../context/PlatformContext";
import { ExperienceRuntimeProvider } from "../../features/experience/runtime";
import { AuthProvider } from "../../features/identity/auth";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <OrganizationProvider>
        <ExperienceRuntimeProvider>
          <PlatformProvider>{children}</PlatformProvider>
        </ExperienceRuntimeProvider>
      </OrganizationProvider>
    </AuthProvider>
  );
}
