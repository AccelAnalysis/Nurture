import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import type { Organization, OrganizationMembership } from '../domain/identity';
import { can, type Permission } from '../domain/permissions';
import { useAsync } from '../lib/useAsync';
import { organizationService } from '../services/organizationService';
import { useAuth } from './AuthProvider';
import { useCurrentUser } from './CurrentUserProvider';
interface OrganizationState {
  organization: Organization | null;
  membership: OrganizationMembership | null;
  memberships: OrganizationMembership[];
  loading: boolean;
  error: string | null;
  select: (id: string) => void;
  refresh: () => void;
  permits: (permission: Permission) => boolean;
}
const Context = createContext<OrganizationState | null>(null);
export function OrganizationProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const { profile } = useCurrentUser();
  const { pathname } = useLocation();
  const [selected, select] = useState<string | null>(null);
  const routeId = matchPath('/org/:organizationId/*', pathname)?.params.organizationId;
  const uid = user?.isAnonymous ? undefined : user?.uid;
  useEffect(() => {
    select(null);
  }, [uid]);
  const wanted = routeId ?? selected ?? profile?.defaultOrganizationId;
  const load = useCallback(async () => {
    if (!uid) return { organization: null, membership: null, memberships: [] };
    const memberships = await organizationService.memberships(uid);
    const membership =
      memberships.find((m) => m.organizationId === wanted) ??
      (!routeId && !selected ? memberships[0] : null) ??
      null;
    if (routeId && !membership) throw new Error('You do not have access to this organization.');
    const organization = membership ? await organizationService.get(membership.organizationId) : null;
    if (membership && (!organization || organization.status !== 'active'))
      throw new Error('This organization is unavailable.');
    return { organization, membership, memberships };
  }, [uid, wanted, routeId, selected]);
  const result = useAsync(load);
  // Never expose the previous account/tenant while the next request is resolving.
  const resolved = !result.loading && uid ? result.data : null;
  const membership = resolved?.membership ?? null;
  return (
    <Context.Provider
      value={{
        organization: resolved?.organization ?? null,
        membership,
        memberships: resolved?.memberships ?? [],
        loading: result.loading,
        error: result.error,
        select,
        refresh: result.refresh,
        permits: (permission) => !!user?.emailVerified && can(membership, permission),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useOrganization() {
  const value = useContext(Context);
  if (!value) throw new Error('OrganizationProvider is required.');
  return value;
}
