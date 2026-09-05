import type { OrganizationMembership, Role } from './identity';
export const permissions = [
  'workspace:view',
  'people:manage',
  'outreach:manage',
  'surveys:manage',
  'offers:manage',
  'insights:view',
  'feedback:review',
  'members:manage',
  'organization:manage',
  'billing:manage',
] as const;
export type Permission = (typeof permissions)[number];
export const rolePermissions: Readonly<Record<Role, readonly Permission[]>> = {
  owner: permissions,
  administrator: permissions,
  manager: [
    'workspace:view',
    'people:manage',
    'outreach:manage',
    'surveys:manage',
    'offers:manage',
    'insights:view',
    'feedback:review',
  ],
  member: [],
};
export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && Object.hasOwn(rolePermissions, value);
}
export function can(membership: OrganizationMembership | null | undefined, permission: Permission): boolean {
  return (
    !!membership &&
    membership.status === 'active' &&
    isRole(membership.role) &&
    rolePermissions[membership.role].includes(permission)
  );
}
export function membershipId(organizationId: string, userId: string): string {
  return `${organizationId}_${userId}`;
}
