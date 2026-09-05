import { where } from 'firebase/firestore';
import type { Organization, OrganizationMembership, OrganizationInvitation } from '../domain/identity';
import { isRole } from '../domain/permissions';
import { DEMO_MODE } from '../config/runtime';
import { DEMO_ORG, demoOrganization, demoMembers } from '../demo/data';
import { FeatureUnavailableError } from '../lib/errors';
import { pathId, readMany, readOne, scopedRepository } from './repository';
const organizationCopies = new Map([[DEMO_ORG, structuredClone(demoOrganization)]]);
export const organizationService = {
  async get(id: string): Promise<Organization | null> {
    return DEMO_MODE
      ? structuredClone(organizationCopies.get(id) ?? null)
      : readOne<Organization>(`organizations/${pathId(id)}`);
  },
  async memberships(uid: string): Promise<OrganizationMembership[]> {
    const memberships = DEMO_MODE
      ? demoMembers.filter((member) => member.userId === uid)
      : await readMany<OrganizationMembership>('organizationMemberships', [where('userId', '==', uid)]);
    return memberships.filter(
      (m) =>
        m.userId === uid && typeof m.organizationId === 'string' && isRole(m.role) && m.status === 'active',
    );
  },
  async members(id: string): Promise<OrganizationMembership[]> {
    return DEMO_MODE
      ? structuredClone(demoMembers.filter((m) => m.organizationId === id))
      : readMany<OrganizationMembership>('organizationMemberships', [
          where('organizationId', '==', pathId(id)),
        ]);
  },
  async save(organization: Organization): Promise<void> {
    if (!DEMO_MODE) throw new FeatureUnavailableError('Organization editing');
    organizationCopies.set(organization.id, structuredClone(organization));
  },
  async create(_name: string): Promise<void> {
    throw new FeatureUnavailableError('Organization provisioning');
  },
};
export const invitationService = {
  ...scopedRepository<OrganizationInvitation>(
    'Invitations',
    [
      {
        id: 'demo-invite',
        organizationId: DEMO_ORG,
        email: 'invited@example.test',
        role: 'member',
        invitedBy: 'demo-owner',
        status: 'pending',
        expiresAt: '2027-01-01T00:00:00.000Z',
        createdAt: '2026-09-04T12:00:00.000Z',
        updatedAt: '2026-09-04T12:00:00.000Z',
      },
    ],
    (id) => `organizations/${id}/invitations`,
    DEMO_ORG,
  ),
  async resolve(
    token: string,
  ): Promise<{ state: 'pending' | 'expired' | 'accepted'; organizationName: string }> {
    if (!DEMO_MODE) throw new FeatureUnavailableError('Secure invitation verification');
    if (token === 'expired') return { state: 'expired', organizationName: demoOrganization.name };
    if (token === 'accepted') return { state: 'accepted', organizationName: demoOrganization.name };
    if (token !== 'demo-invite')
      throw new Error('This invitation could not be found. Ask your organization for a new invitation.');
    return { state: 'pending', organizationName: demoOrganization.name };
  },
  async accept(token: string, userId: string, displayName: string): Promise<string> {
    if (!DEMO_MODE) throw new FeatureUnavailableError('Invitation acceptance');
    if (token !== 'demo-invite') throw new Error('This invitation cannot be accepted.');
    if (!demoMembers.some((m) => m.organizationId === DEMO_ORG && m.userId === userId))
      demoMembers.push({
        id: `${DEMO_ORG}_${userId}`,
        organizationId: DEMO_ORG,
        userId,
        displayName,
        role: 'member',
        status: 'active',
        invitedBy: 'demo-owner',
        invitedAt: new Date().toISOString(),
        joinedAt: new Date().toISOString(),
      });
    return DEMO_ORG;
  },
};
