import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import { useAuth } from '../providers/AuthProvider';
import { useCurrentUser } from '../providers/CurrentUserProvider';
import { useOrganization } from '../providers/OrganizationProvider';
import { useAction } from '../lib/useAction';
import type { Role } from '../domain/identity';
import { DEMO_MODE } from '../config/runtime';
import { ActionStatus, Badge, Button, Card, EmptyState, LinkButton, PageHeader } from '../components/ui';
import { Icon } from '../components/Icon';
export function DemoPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const user = useCurrentUser();
  const org = useOrganization();
  const action = useAction();
  async function enter(role: Role) {
    if (
      await action.run(async () => {
        await authService.demoSignIn(role);
        await auth.refresh();
        user.refresh();
        org.refresh();
      })
    )
      navigate(role === 'member' ? '/app' : '/org/demo-org');
  }
  if (!DEMO_MODE)
    return (
      <Card>
        <EmptyState
          title="Demo mode is not enabled in this build"
          description="The production app never grants demo identities. Run the separate development demo build to review fictional data."
        >
          <LinkButton to="/experience">Explore the public experience</LinkButton>
        </EmptyState>
      </Card>
    );
  return (
    <>
      <PageHeader
        eyebrow="An isolated product walkthrough"
        title="Explore Nurture, from every side."
        description="All names, contacts, prices, and metrics here are fictional. Demo changes stay in memory and reset on a page reload."
      />
      <div className="grid two">
        <Card className="demo-personas">
          <Badge tone="warning">No production access</Badge>
          <h2 className="section">Choose your perspective</h2>
          <p className="muted">The same interface adapts to the role’s permissions.</p>
          {(
            [
              ['owner', 'Organization owner', 'All organization destinations'],
              ['administrator', 'Administrator', 'Team and organization management'],
              ['manager', 'Experience manager', 'People, outreach, surveys, and insights'],
              ['member', 'Ordinary member', 'Personal app only; no admin access'],
            ] as const
          ).map(([role, title, description]) => (
            <Button
              key={role}
              variant="secondary"
              disabled={action.working}
              onClick={() => {
                void enter(role);
              }}
            >
              <span>
                {title}
                <small style={{ display: 'block', textAlign: 'left', fontWeight: 400 }}>{description}</small>
              </span>
              <Icon name="arrow" />
            </Button>
          ))}
          <ActionStatus {...action} />
        </Card>
        <div className="stack">
          <Card>
            <h2>Follow the customer journey</h2>
            <p className="muted">
              Start publicly, try a guest identity, register, continue, and follow a referral back to
              acquisition.
            </p>
            <div className="actions">
              <LinkButton to="/experience">Public experience</LinkButton>
              <LinkButton variant="secondary" to="/r/NURTURE-DEMO">
                Referral entry
              </LinkButton>
            </div>
          </Card>
          <Card>
            <h2>Review invitation & survey states</h2>
            <div className="stack">
              <LinkButton variant="secondary" to="/invite/demo-invite">
                Pending invitation
              </LinkButton>
              <LinkButton variant="quiet" to="/invite/expired">
                Expired invitation
              </LinkButton>
              <LinkButton variant="quiet" to="/invite/accepted">
                Already accepted invitation
              </LinkButton>
              <LinkButton variant="secondary" to="/survey/demo-survey">
                Public survey
              </LinkButton>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
