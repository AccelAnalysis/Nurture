import type { PlatformRole } from "../../security/authorization";

export interface PlatformScopeContext {
  scope: "platform";
  role: PlatformRole;
  authorizationSource: "custom-claims" | "trusted-backend" | "demo";
}

export interface PlatformAuditEvent {
  id: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string;
  occurredAt: string;
  context?: Record<string, string | number | boolean | null>;
}
