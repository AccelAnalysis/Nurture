import type { ReactNode } from "react";
import { AuthProvider } from "../../features/identity/auth";
import { OrganizationProvider } from "../../context/OrganizationContext";
import { PlatformProvider } from "../../context/PlatformContext";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <OrganizationProvider>
        <PlatformProvider>{children}</PlatformProvider>
      </OrganizationProvider>
    </AuthProvider>
  );
}
