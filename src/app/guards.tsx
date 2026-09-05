import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { useCurrentUser } from '../providers/CurrentUserProvider';
import { useOrganization } from '../providers/OrganizationProvider';
import type { Permission } from '../domain/permissions';
import { Card, EmptyState, ErrorState, LinkButton, LoadingState, PageHeader } from '../components/ui';
export function RequireAuth() {
  const auth = useAuth();
  const current = useCurrentUser();
  const location = useLocation();
  if (auth.status === 'loading') return <LoadingState label="Restoring your session…" />;
  if (!auth.user || auth.user.isAnonymous)
    return <Navigate replace to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} />;
  if (current.loading) return <LoadingState label="Loading your profile…" />;
  if (current.error)
    return (
      <div className="public-main">
        <PageHeader title="Your profile needs attention" />
        <ErrorState message={current.error} retry={current.refresh} />
      </div>
    );
  if (current.profile && current.profile.status !== 'active')
    return (
      <div className="public-main">
        <PageHeader title="This account is unavailable" />
        <Card>
          <EmptyState
            icon="lock"
            title="Account access restricted"
            description="This account cannot enter the app while its status is suspended or pending deletion."
          >
            <LinkButton to="/help">Get account help</LinkButton>
          </EmptyState>
        </Card>
      </div>
    );
  return <Outlet />;
}
export function RequireOrganization({ permission = 'workspace:view' }: { permission?: Permission }) {
  const auth = useAuth();
  const org = useOrganization();
  if (org.loading) return <LoadingState label="Checking organization access…" />;
  if (!auth.user?.emailVerified)
    return (
      <div className="public-main">
        <PageHeader title="Verify your email first" />
        <Card>
          <EmptyState
            icon="lock"
            title="Protect your organization access"
            description="A verified email is required before opening the organization workspace."
          >
            <LinkButton to="/verify-email">Verify email</LinkButton>
          </EmptyState>
        </Card>
      </div>
    );
  if (org.error || !org.organization || !org.permits(permission))
    return (
      <div className="public-main">
        <PageHeader title="Access restricted" />
        <Card>
          <EmptyState
            icon="lock"
            title="This area needs organization permission"
            description={
              org.error ?? 'Your current role does not allow access to this part of the organization.'
            }
          >
            <LinkButton to="/app">Return to your app</LinkButton>
            <LinkButton variant="secondary" to="/app/account">
              Your memberships
            </LinkButton>
          </EmptyState>
        </Card>
      </div>
    );
  return <Outlet />;
}
