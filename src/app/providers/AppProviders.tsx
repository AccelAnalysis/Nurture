import type { ReactNode } from "react";
import { OrganizationProvider } from "../../context/OrganizationContext";
import { ConfigurationProvider } from "../../features/configuration/ConfigurationProvider";
import { AuthProvider } from "../../features/identity/auth";
import { PlatformProvider } from "../../context/PlatformContext";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <OrganizationProvider>
        <ConfigurationProvider>
          <PlatformProvider>{children}</PlatformProvider>
        </ConfigurationProvider>
      </OrganizationProvider>
    </AuthProvider>
  );
}
