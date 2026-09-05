import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { useCurrentUser } from '../providers/CurrentUserProvider';
import { useOrganization } from '../providers/OrganizationProvider';
import { useNotifications } from '../providers/NotificationProvider';
import { useReferral } from '../providers/ReferralProvider';
import { useAction } from '../lib/useAction';
import { useAsync } from '../lib/useAsync';
import { userService } from '../services/userService';
import { notificationService } from '../services/lifecycleServices';
import { billingService, referralService } from '../services/commerceServices';
import { FeatureUnavailableError } from '../lib/errors';
import type { UserProfile } from '../domain/identity';
import { DEMO_MODE } from '../config/runtime';
import {
  ActionStatus,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Input,
  LinkButton,
  LoadingState,
  PageHeader,
  Select,
  SkeletonNote,
} from '../components/ui';
import { Icon } from '../components/Icon';
import { FeedbackForm } from '../components/FeedbackForm';
import { DataTable } from '../components/DataTable';
export function CustomerHomePage() {
  const { user } = useAuth();
  const org = useOrganization();
  const { notifications } = useNotifications();
  return (
    <>
      <PageHeader
        eyebrow="Your Nurture"
        title={`Good to see you${user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}.`}
        description="A home for your experiences, the people behind them, and the next useful step."
        actions={<Badge tone="positive">{org.organization?.name ?? 'Personal workspace'}</Badge>}
      />
      <Card>
        <div className="row">
          <p className="eyebrow">Continue your journey</p>
          <Badge>Stage 4</Badge>
        </div>
        <div className="grid two">
          <div>
            <h2>Your next experience starts here.</h2>
            <p className="lede">
              Explore the primary app container. As modules are added, this becomes the place to pick up where
              you left off.
            </p>
            <LinkButton to="/app/experience">
              Open your experience
              <Icon name="arrow" />
            </LinkButton>
          </div>
          <div className="module-stage">
            <Icon name="leaf" size={36} />
            <h3>Room to grow</h3>
            <p>The primary experience module is ready to be designed around your purpose.</p>
          </div>
        </div>
      </Card>
      <section className="section grid three">
        {[
          {
            title: 'Keep exploring',
            text: 'Companion resources and the next chapter of your experience.',
            to: '/app/secondary',
            icon: 'layers' as const,
          },
          {
            title: 'Your perspective matters',
            text: 'Tell us what was useful and what could be better.',
            to: '/app/feedback',
            icon: 'feedback' as const,
          },
          {
            title: 'Make an introduction',
            text: 'Help someone else discover an experience worth starting.',
            to: '/app/referrals',
            icon: 'share' as const,
          },
        ].map((item) => (
          <Card className="feature-card" key={item.to}>
            <div className="feature-icon">
              <Icon name={item.icon} />
            </div>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
            <Link to={item.to}>
              Take the next step <Icon name="arrow" size={16} />
            </Link>
          </Card>
        ))}
      </section>
      <section className="section">
        <div className="section-heading">
          <h2>Your updates</h2>
          <Link to="/app/notifications">View inbox</Link>
        </div>
        <Card>
          {notifications.length ? (
            notifications.slice(0, 2).map((notification) => (
              <div className="list-row" key={notification.id}>
                <div>
                  <h3>{notification.title}</h3>
                  <p>{notification.message}</p>
                </div>
                <LinkButton variant="quiet" to={notification.href}>
                  Open
                </LinkButton>
              </div>
            ))
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              You’re all caught up. Experience updates will appear here.
            </p>
          )}
        </Card>
      </section>
    </>
  );
}
export function FeedbackPage() {
  return (
    <div className="form-narrow">
      <PageHeader
        eyebrow="Stage 7 · Learn from every experience"
        title="Your perspective matters."
        description="Share an idea, report a problem, or tell us about your experience."
      />
      <Card>
        <FeedbackForm />
      </Card>
    </div>
  );
}
export function ProfilePage({ settings = false }: { settings?: boolean }) {
  const current = useCurrentUser();
  return (
    <>
      <PageHeader
        eyebrow={settings ? 'Make Nurture work for you' : 'Your personal details'}
        title={settings ? 'Settings & preferences' : 'Your profile'}
        description={
          settings
            ? 'Choose your appearance and optional communication preferences.'
            : 'Only the essentials needed to personalize your experience.'
        }
      />
      {current.loading ? (
        <LoadingState />
      ) : current.error ? (
        <ErrorState message={current.error} retry={current.refresh} />
      ) : current.profile ? (
        <ProfileEditor
          key={`${current.profile.uid}-${settings}`}
          profile={current.profile}
          settings={settings}
          onSaved={current.refresh}
        />
      ) : (
        <Card>
          <EmptyState
            title="Your profile is not ready"
            description="Complete the short onboarding step to create your profile."
          >
            <LinkButton to="/onboarding">Set up profile</LinkButton>
          </EmptyState>
        </Card>
      )}
    </>
  );
}
function ProfileEditor({
  profile,
  settings,
  onSaved,
}: {
  profile: UserProfile;
  settings: boolean;
  onSaved: () => void;
}) {
  const [name, setName] = useState(profile.displayName);
  const [first, setFirst] = useState(profile.firstName);
  const [last, setLast] = useState(profile.lastName);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [preferences, setPreferences] = useState(profile.preferences);
  const action = useAction();
  return (
    <Card className="form-narrow">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(
            async () => {
              await userService.save(profile.uid, {
                displayName: name.trim(),
                firstName: first.trim(),
                lastName: last.trim(),
                phone: phone.trim() || null,
                preferences,
                onboardingStatus: profile.onboardingStatus,
              });
              onSaved();
            },
            DEMO_MODE ? 'Saved in demo memory.' : 'Preferences saved.',
          );
        }}
      >
        {settings ? (
          <>
            <Select
              label="Appearance"
              value={preferences.theme}
              onChange={(event) =>
                setPreferences({ ...preferences, theme: event.target.value as typeof preferences.theme })
              }
            >
              <option value="system">Use system appearance</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </Select>
            <Select
              label="Time zone"
              value={preferences.timeZone}
              onChange={(event) => setPreferences({ ...preferences, timeZone: event.target.value })}
            >
              {[
                ...new Set([
                  preferences.timeZone,
                  'America/New_York',
                  'America/Chicago',
                  'America/Denver',
                  'America/Los_Angeles',
                  'Europe/London',
                  'UTC',
                ]),
              ].map((zone) => (
                <option value={zone} key={zone}>
                  {zone.replaceAll('_', ' ')}
                </option>
              ))}
            </Select>
            <fieldset>
              <legend>Optional communications</legend>
              <Checkbox
                label="Nurture email updates"
                checked={preferences.emailMarketing}
                onChange={(event) => setPreferences({ ...preferences, emailMarketing: event.target.checked })}
              />
              <Checkbox
                label="Nurture SMS marketing preference"
                checked={preferences.smsMarketing}
                onChange={(event) => setPreferences({ ...preferences, smsMarketing: event.target.checked })}
              />
              <Checkbox
                label="In-app notifications"
                checked={preferences.inAppNotifications}
                onChange={(event) =>
                  setPreferences({ ...preferences, inAppNotifications: event.target.checked })
                }
              />
            </fieldset>
            <SkeletonNote>
              These are product preferences, not a completed consent enrollment. SMS requires a verified
              number and purpose-specific opt-in before any future delivery.
            </SkeletonNote>
          </>
        ) : (
          <>
            <div className="person" style={{ marginBottom: 24 }}>
              <Avatar name={name} />
              <div>
                <strong>{name || 'Your profile'}</strong>
                <small>Profile photo upload will be added later</small>
              </div>
            </div>
            <Input
              label="Display name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={100}
              autoComplete="nickname"
            />
            <div className="form-grid">
              <Input
                label="First name (optional)"
                value={first}
                onChange={(event) => setFirst(event.target.value)}
                maxLength={100}
                autoComplete="given-name"
              />
              <Input
                label="Last name (optional)"
                value={last}
                onChange={(event) => setLast(event.target.value)}
                maxLength={100}
                autoComplete="family-name"
              />
            </div>
            <Input
              label="Email"
              type="email"
              value={profile.email}
              readOnly
              hint="Email changes will require a verified authentication workflow."
            />
            <Input
              label="Phone (optional)"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              maxLength={30}
              autoComplete="tel"
              hint="Adding a number does not opt you into messages."
            />
          </>
        )}
        <Button type="submit" disabled={action.working}>
          Save {settings ? 'preferences' : 'profile'}
        </Button>
        <ActionStatus {...action} />
      </form>
    </Card>
  );
}
export function AccountPage() {
  const { user } = useAuth();
  const org = useOrganization();
  const action = useAction();
  return (
    <>
      <PageHeader
        title="Your account"
        description="Manage your identity, organization connections, and privacy controls."
      />
      <div className="grid two">
        <Card>
          <h2>Sign-in & security</h2>
          <dl className="key-value">
            <dt>Email</dt>
            <dd>{user?.email}</dd>
            <dt>Verification</dt>
            <dd>
              <Badge tone={user?.emailVerified ? 'positive' : 'warning'}>
                {user?.emailVerified ? 'Verified' : 'Unverified'}
              </Badge>
            </dd>
            <dt>Authentication</dt>
            <dd>{DEMO_MODE ? 'Isolated demo identity' : 'Firebase Authentication'}</dd>
          </dl>
          <div className="card-footer actions">
            <LinkButton variant="secondary" to="/verify-email">
              Email verification
            </LinkButton>
            <LinkButton variant="quiet" to="/forgot-password">
              Reset password
            </LinkButton>
          </div>
          <SkeletonNote>
            Passkeys, session management, and additional sign-in methods have not been implemented.
          </SkeletonNote>
        </Card>
        <Card>
          <h2>Your organizations</h2>
          {org.loading ? (
            <LoadingState />
          ) : org.error ? (
            <ErrorState message={org.error} retry={org.refresh} />
          ) : org.memberships.length ? (
            org.memberships.map((membership) => (
              <div className="list-row" key={membership.id}>
                <div>
                  <h3>
                    {membership.organizationId === org.organization?.id
                      ? org.organization.name
                      : membership.organizationId}
                  </h3>
                  <p>
                    {membership.role} · {membership.status}
                  </p>
                </div>
                {membership.role !== 'member' && user?.emailVerified && (
                  <LinkButton variant="quiet" to={`/org/${membership.organizationId}`}>
                    Open
                  </LinkButton>
                )}
              </div>
            ))
          ) : (
            <p className="muted">No organization memberships yet. Accept an invitation to join.</p>
          )}
          <div className="card-footer">
            <LinkButton variant="secondary" to="/organizations/new">
              Create an organization
            </LinkButton>
          </div>
        </Card>
        <Card>
          <h2>Privacy & your data</h2>
          <p className="muted">
            Account export and deletion will use protected server workflows. Organization records have
            separate ownership and retention requirements.
          </p>
          <div className="actions">
            <Button
              variant="secondary"
              onClick={() => {
                void action.run(async () => {
                  throw new FeatureUnavailableError('Account data export');
                });
              }}
            >
              Preview data export
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                void action.run(async () => {
                  throw new FeatureUnavailableError('Account deletion');
                });
              }}
            >
              Review account deletion
            </Button>
          </div>
          <ActionStatus {...action} />
        </Card>
        <Card>
          <h2>Preferences are yours to choose</h2>
          <p className="muted">Keep your profile current and choose the optional updates you receive.</p>
          <LinkButton variant="secondary" to="/app/settings">
            Open settings
          </LinkButton>
        </Card>
      </div>
    </>
  );
}
export function NotificationsPage() {
  const { user } = useAuth();
  const notifications = useNotifications();
  const action = useAction();
  return (
    <>
      <PageHeader
        title="Your inbox"
        description="Invitations, experience updates, and useful next steps in one place."
      />
      <Card>
        {notifications.loading ? (
          <LoadingState />
        ) : notifications.error ? (
          <ErrorState message={notifications.error} retry={notifications.refresh} />
        ) : notifications.notifications.length ? (
          notifications.notifications.map((item) => (
            <article className="list-row" key={item.id}>
              <div>
                <div className="status-line">
                  <Badge tone={item.readAt ? 'neutral' : 'positive'}>{item.readAt ? 'Read' : 'New'}</Badge>
                  <small>{new Date(item.createdAt).toLocaleDateString()}</small>
                </div>
                <h3 style={{ marginTop: 12 }}>{item.title}</h3>
                <p>{item.message}</p>
                <div className="actions">
                  <LinkButton variant="quiet" to={item.href.startsWith('/app/') ? item.href : '/app'}>
                    Open update
                  </LinkButton>
                  {!item.readAt && (
                    <Button
                      variant="quiet"
                      onClick={() => {
                        void action.run(
                          async () => {
                            await notificationService.save(user!.uid, {
                              ...item,
                              readAt: new Date().toISOString(),
                            });
                            notifications.refresh();
                          },
                          DEMO_MODE ? 'Marked read in demo memory.' : 'Marked as read.',
                        );
                      }}
                    >
                      Mark as read
                    </Button>
                  )}
                </div>
              </div>
            </article>
          ))
        ) : (
          <EmptyState
            title="You’re all caught up"
            description="Your next experience update will appear here."
            icon="bell"
          >
            <LinkButton variant="secondary" to="/app/experience">
              Explore your experience
            </LinkButton>
          </EmptyState>
        )}
        <ActionStatus {...action} />
      </Card>
    </>
  );
}
export function BillingPage({ organization = false }: { organization?: boolean }) {
  const auth = useAuth();
  const org = useOrganization();
  const action = useAction();
  return (
    <>
      <PageHeader
        title={organization ? 'Organization billing' : 'Billing & subscriptions'}
        description="Your plan, subscription status, invoices, and billing settings will live here."
      />
      <div className="grid two">
        <Card>
          <Badge>Integration placeholder</Badge>
          <h2 className="section">No live billing is connected.</h2>
          <p className="muted">
            Stripe Checkout, the customer portal, and subscription synchronization are separated behind
            service interfaces. The client cannot grant an entitlement or change a billing state.
          </p>
          <Button
            variant="secondary"
            disabled={action.working}
            onClick={() => {
              void action.run(() =>
                billingService.openPortal({
                  type: organization ? 'organization' : 'user',
                  id: organization ? org.organization!.id : auth.user!.uid,
                }),
              );
            }}
          >
            Preview billing portal
          </Button>
          <ActionStatus {...action} />
        </Card>
        <Card>
          <EmptyState
            icon="billing"
            title="Invoices will appear here"
            description="No payment information is collected in this skeleton. Stripe integration must begin in test mode."
          >
            <LinkButton
              variant="secondary"
              to={organization ? `/org/${org.organization?.id}/offers` : '/app/offers'}
            >
              Review offers
            </LinkButton>
          </EmptyState>
        </Card>
      </div>
    </>
  );
}
export function ReferralsPage() {
  const { user } = useAuth();
  const attribution = useReferral();
  const result = useAsync(useCallback(() => referralService.userReferrals(user?.uid ?? ''), [user?.uid]));
  const action = useAction();
  const link = `${window.location.origin}/r/NURTURE-DEMO`;
  return (
    <>
      <PageHeader
        eyebrow="Stage 7 → Stage 1"
        title="Good experiences are worth sharing."
        description="Make an introduction and help someone else discover what comes next."
      />
      <div className="grid two">
        <Card>
          <h2>Your referral link</h2>
          {DEMO_MODE ? (
            <>
              <Input label="Sample referral link" value={link} readOnly />
              <div className="actions">
                <Button
                  onClick={() => {
                    void action.run(() => navigator.clipboard.writeText(link), 'Sample link copied.');
                  }}
                >
                  Copy sample link
                </Button>
                <LinkButton variant="secondary" to="/r/NURTURE-DEMO">
                  Preview referral journey
                </LinkButton>
              </div>
            </>
          ) : (
            <EmptyState
              icon="share"
              title="Your referral program is being prepared"
              description="A trusted backend will issue your code. No organization or user identity will be accepted from an unverified URL."
            />
          )}
          <ActionStatus {...action} />
        </Card>
        <Card>
          <h2>Attribution, not automatic access</h2>
          <p className="muted">
            Referral attribution connects an introduction to a later registration or conversion. Memberships
            and monetary rewards require separate verified actions.
          </p>
          {attribution.attribution && (
            <p className="notice subtle">
              Saved introduction: {attribution.attribution.referralCode} · pending verification
            </p>
          )}
          <SkeletonNote>
            Rewards and payouts are not implemented. A saved code does not create a benefit.
          </SkeletonNote>
        </Card>
      </div>
      <section className="section">
        <h2>Referral history</h2>
        {result.loading ? (
          <LoadingState />
        ) : (
          <DataTable
            caption="Your referral history"
            rows={result.data ?? []}
            columns={[
              { key: 'code', label: 'Referral code', render: (row) => row.referralCode },
              { key: 'source', label: 'Source', render: (row) => row.source },
              { key: 'campaign', label: 'Campaign', render: (row) => row.campaign },
              { key: 'status', label: 'Status', render: (row) => <Badge>{row.status}</Badge> },
            ]}
            emptyTitle="No referral history yet"
            emptyDescription={result.error ?? 'Your verified introductions will appear here.'}
          />
        )}
      </section>
    </>
  );
}
