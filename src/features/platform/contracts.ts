import type { PlatformRole } from "../../security/authorization";

export interface PlatformScopeContext {
  scope: "platform";
  role: PlatformRole;
  authorizationSource: "custom-claims" | "trusted-backend" | "demo";
}

export type { AuditRecord as PlatformAuditEvent } from "../../platform/audit";
