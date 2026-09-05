import type { OrganizationCapability } from "../../security/authorization";

export interface OrganizationCapabilityAssignment {
  organizationId: string;
  roleId: string;
  capabilities: OrganizationCapability[];
  builtIn: boolean;
}

export interface OrganizationAdminAuditEvent {
  id: string;
  organizationId: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string;
  occurredAt: string;
  context?: Record<string, string | number | boolean | null>;
}
