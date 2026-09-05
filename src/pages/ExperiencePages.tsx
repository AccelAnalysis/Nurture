import { useAuth } from '../providers/AuthProvider';
import { authService } from '../services/authService';
import { useAction } from '../lib/useAction';
import { DEMO_MODE, providerFlags } from '../config/runtime';
import { experienceModules } from '../modules/registry';
import { Badge, Button, Card, PageHeader, LinkButton, ActionStatus } from '../components/ui';
import { Icon } from '../components/Icon';
export function ExperiencePage({
  publicEntry = false,
  secondary = false,
}: {
  publicEntry?: boolean;
  secondary?: boolean;
}) {
  const auth = useAuth();
  const action = useAction();
  const module = experienceModules[secondary ? 1 : 0];
  return (
    <>
      <PageHeader
        eyebrow={
          secondary ? 'Stage 5 · Keep the connection going' : 'Stage 4 · Public & personal experiences'
        }
        title={secondary ? 'There’s more to explore.' : 'A little space for something useful.'}
        description={module.description}
        actions={
          <Badge tone="positive">
            {publicEntry ? 'Public preview' : secondary ? 'Registered experience' : 'Your app experience'}
          </Badge>
        }
      />
      <div className="module-container">
        <div className="row">
          <div className="person">
            <span className="empty-icon" style={{ margin: 0, width: 44, height: 44 }}>
              <Icon name={secondary ? 'layers' : 'experience'} />
            </span>
            <div>
              <h3>{module.title}</h3>
              <small>Module container · ready for future implementation</small>
            </div>
          </div>
          <Badge>Not yet installed</Badge>
        </div>
        <div className="module-stage section">
          <Icon name={secondary ? 'layers' : 'leaf'} size={42} />
          <h2>{secondary ? 'The next chapter belongs here.' : 'Your experience will live here.'}</h2>
          <p>
            {secondary
              ? 'Install companion content, a follow-on program, or tools that keep the relationship useful.'
              : 'Install a course, a guided interaction, a tool, or another focused app. The Nurture shell takes care of the journey around it.'}
          </p>
          <Badge>{secondary ? 'Secondary module' : 'Primary module'}</Badge>
        </div>
        <div className="card-footer actions">
          {publicEntry ? (
            <>
              <LinkButton to={auth.user && !auth.user.isAnonymous ? '/app' : '/register'}>
                {auth.user && !auth.user.isAnonymous ? 'Open your app' : 'Create an account to continue'}
                <Icon name="arrow" />
              </LinkButton>
              {(!auth.user || auth.user.isAnonymous) && (DEMO_MODE || providerFlags.anonymous) && (
                <Button
                  variant="secondary"
                  disabled={action.working || !!auth.user?.isAnonymous}
                  onClick={() => {
                    void action.run(
                      async () => {
                        await authService.startTrial();
                        await auth.refresh();
                      },
                      DEMO_MODE
                        ? 'Demo guest identity created. Registration will keep this identity.'
                        : 'Guest identity ready. Register later to preserve your account identity.',
                    );
                  }}
                >
                  {auth.user?.isAnonymous ? 'Guest session active' : 'Try a guest session'}
                </Button>
              )}
            </>
          ) : (
            <>
              <LinkButton to={secondary ? '/app/offers' : '/app/secondary'}>
                {secondary ? 'Explore ways to continue' : 'Explore the secondary experience'}
                <Icon name="arrow" />
              </LinkButton>
              <LinkButton variant="quiet" to="/app/feedback">
                Share an idea
              </LinkButton>
            </>
          )}
        </div>
        <ActionStatus {...action} />
      </div>
      <div className="grid two section">
        <Card>
          <h3>{publicEntry ? 'No account required to look around' : 'A stable home for future modules'}</h3>
          <p className="muted">
            Public, anonymous, registered, and entitled access are separate module policies. The placeholder
            never unlocks paid or organization data.
          </p>
        </Card>
        <Card>
          <h3>Keep the journey connected</h3>
          <p className="muted">
            Experience events will connect to follow-ups, feedback, and referrals through trusted service
            boundaries.
          </p>
        </Card>
      </div>
    </>
  );
}
