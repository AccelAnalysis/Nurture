import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { authService } from '../services/authService';
import { invitationService, organizationService } from '../services/organizationService';
import { userService } from '../services/userService';
import { useAuth } from '../providers/AuthProvider';
import { useCurrentUser } from '../providers/CurrentUserProvider';
import { useOrganization } from '../providers/OrganizationProvider';
import { useReferral } from '../providers/ReferralProvider';
import { useAction } from '../lib/useAction';
import { useAsync } from '../lib/useAsync';
import { safeReturnPath } from '../domain/validation';
import { DEMO_MODE, providerFlags } from '../config/runtime';
import {
  ActionStatus,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Input,
  LinkButton,
  PageHeader,
  SkeletonNote,
} from '../components/ui';
import { ResourceState } from '../components/ResourceState';
export function AuthPage({ mode }: { mode: 'login' | 'register' | 'forgot' | 'reset' }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const current = useCurrentUser();
  const { attribution } = useReferral();
  const action = useAction();
  const titles = {
    login: 'Welcome back.',
    register: 'A good place to begin.',
    forgot: 'Reset your password.',
    reset: 'Choose a new password.',
  };
  const next = safeReturnPath(params.get('next'));
  const submit = async (form: HTMLFormElement) => {
    const values = new FormData(form);
    const email = String(values.get('email') ?? '').trim();
    const password = String(values.get('password') ?? '');
    const ok = await action.run(
      async () => {
        if (mode === 'forgot') await authService.resetPassword(email);
        else if (mode === 'reset') {
          const code = params.get('oobCode');
          if (!code) throw new Error('This reset link is incomplete. Request a new password reset.');
          await authService.completePasswordReset(code, password);
        } else {
          if (mode === 'register')
            await authService.register(email, password, String(values.get('name') ?? '').trim());
          else await authService.signIn(email, password);
          await auth.refresh();
          current.refresh();
        }
      },
      mode === 'forgot'
        ? DEMO_MODE
          ? 'Demo only: no password reset email was sent.'
          : 'If this address can receive a password reset, instructions will arrive by email.'
        : mode === 'reset'
          ? DEMO_MODE
            ? 'Demo only: no real password was changed.'
            : 'Your password was changed. You can now sign in.'
          : 'You’re signed in.',
    );
    if (ok && ['login', 'register'].includes(mode))
      navigate(mode === 'register' ? `/onboarding?next=${encodeURIComponent(next)}` : next, {
        replace: true,
      });
  };
  async function provider(name: 'google' | 'apple') {
    if (await action.run(() => authService.provider(name))) {
      await auth.refresh();
      current.refresh();
      navigate(next);
    }
  }
  return (
    <Card className="auth-card">
      <PageHeader
        eyebrow="Your Nurture"
        title={titles[mode]}
        description={
          mode === 'register'
            ? 'Create your profile and continue the experience.'
            : mode === 'forgot'
              ? 'We’ll help you get back to your account.'
              : 'Continue where you left off.'
        }
      />
      {auth.error && <ErrorState message={auth.error} />}
      {DEMO_MODE && (
        <SkeletonNote>
          Demo mode uses fictional accounts. Use the demo guide to choose a role; no real email or password is
          required.
        </SkeletonNote>
      )}
      {auth.user?.isAnonymous && mode === 'register' && (
        <p className="notice success">Your guest identity will be linked to your new account.</p>
      )}
      {attribution && mode === 'register' && (
        <p className="notice subtle">
          Referral code {attribution.referralCode} is saved for verification. It does not grant organization
          membership.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(event.currentTarget);
        }}
      >
        {mode === 'register' && (
          <Input label="Your name" name="name" autoComplete="name" required maxLength={100} />
        )}
        {mode !== 'reset' && (
          <Input label="Email" name="email" type="email" autoComplete="email" required maxLength={254} />
        )}
        {mode !== 'forgot' && (
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'login' ? 1 : 8}
            maxLength={128}
            hint={
              mode !== 'login'
                ? 'Use at least 8 characters. Firebase may enforce a stronger configured policy.'
                : undefined
            }
          />
        )}
        {mode === 'register' && (
          <p className="muted">
            <small>
              Review the <Link to="/privacy">privacy</Link> and <Link to="/terms">terms</Link> pages.
              Marketing permissions are separate and off by default.
            </small>
          </p>
        )}
        <Button type="submit" disabled={action.working}>
          {action.working
            ? 'Working…'
            : {
                login: 'Sign in',
                register: 'Create account',
                forgot: 'Send reset instructions',
                reset: 'Update password',
              }[mode]}
        </Button>
        <ActionStatus {...action} />
      </form>
      {(mode === 'login' || mode === 'register') &&
        !DEMO_MODE &&
        (providerFlags.google || providerFlags.apple) && (
          <>
            <div className="auth-divider">Or continue with</div>
            <div className="stack">
              {providerFlags.google && (
                <Button
                  variant="secondary"
                  disabled={action.working}
                  onClick={() => {
                    void provider('google');
                  }}
                >
                  Continue with Google
                </Button>
              )}
              {providerFlags.apple && (
                <Button
                  variant="secondary"
                  disabled={action.working}
                  onClick={() => {
                    void provider('apple');
                  }}
                >
                  Continue with Apple
                </Button>
              )}
            </div>
          </>
        )}
      <div className="auth-links">
        <Link
          to={
            mode === 'register'
              ? `/login?next=${encodeURIComponent(next)}`
              : `/register?next=${encodeURIComponent(next)}`
          }
        >
          {mode === 'register' ? 'Already have an account?' : 'Create an account'}
        </Link>
        <Link to={mode === 'forgot' || mode === 'reset' ? '/login' : '/forgot-password'}>
          {mode === 'forgot' || mode === 'reset' ? 'Back to sign in' : 'Forgot password?'}
        </Link>
      </div>
      {DEMO_MODE && (
        <div className="auth-divider">
          <Link to="/demo">Choose a demo role →</Link>
        </div>
      )}
    </Card>
  );
}
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const auth = useAuth();
  const action = useAction();
  const code = params.get('oobCode');
  return (
    <Card className="auth-card">
      <PageHeader
        title="Verify your email"
        description="Verification helps protect organization invitations and administrative access."
      />
      <Badge tone={auth.user?.emailVerified ? 'positive' : 'warning'}>
        {auth.user?.emailVerified ? 'Email verified' : 'Verification needed'}
      </Badge>
      <p className="section muted">
        {auth.user?.email ?? 'Open the verification link from your email, or sign in to request a new one.'}
      </p>
      <div className="stack">
        {code && (
          <Button
            onClick={() => {
              void action.run(
                async () => {
                  await authService.verifyEmail(code);
                  if (auth.user) await auth.refresh();
                },
                DEMO_MODE ? 'Demo verification preview.' : 'Email verified.',
              );
            }}
            disabled={action.working}
          >
            Verify this email link
          </Button>
        )}
        {auth.user && !auth.user.emailVerified && (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                void action.run(
                  () => authService.verifyEmail(),
                  DEMO_MODE ? 'Demo only: no email sent.' : 'Verification email requested.',
                );
              }}
              disabled={action.working}
            >
              Send verification email
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                void action.run(auth.refresh, 'Verification status refreshed.');
              }}
            >
              I’ve verified my email
            </Button>
          </>
        )}
        {auth.user ? (
          <LinkButton variant="secondary" to="/app">
            Continue to your app
          </LinkButton>
        ) : (
          <LinkButton to="/login">Sign in</LinkButton>
        )}
      </div>
      <ActionStatus {...action} />
    </Card>
  );
}
export function InvitationPage() {
  const { invitationId = '' } = useParams();
  const auth = useAuth();
  const org = useOrganization();
  const action = useAction();
  const navigate = useNavigate();
  const [accepted, setAccepted] = useState(false);
  const result = useAsync(useCallback(() => invitationService.resolve(invitationId), [invitationId]));
  return (
    <Card className="auth-card">
      <PageHeader
        title="Your organization invitation"
        description="A personal connection to an organization’s experience."
      />
      <ResourceState result={result}>
        {(invitation) => (
          <>
            <Badge tone={invitation.state === 'expired' ? 'warning' : 'positive'}>
              {accepted ? 'accepted' : invitation.state}
            </Badge>
            <h2 className="section">{invitation.organizationName}</h2>
            {invitation.state === 'expired' ? (
              <EmptyState
                icon="mail"
                title="This invitation has expired"
                description="Ask your organization administrator to send a new registration request."
              >
                <LinkButton variant="secondary" to="/help">
                  Invitation help
                </LinkButton>
              </EmptyState>
            ) : invitation.state === 'accepted' || accepted ? (
              <EmptyState
                icon="check"
                title="Invitation already accepted"
                description="Sign in with the account you used when you joined."
              >
                <LinkButton to="/app/account">Your organizations</LinkButton>
              </EmptyState>
            ) : !auth.user || auth.user.isAnonymous ? (
              <>
                <p className="muted">
                  Create an account or sign in first. The invitation must be verified before membership is
                  granted.
                </p>
                <div className="actions">
                  <LinkButton to={`/register?next=${encodeURIComponent(`/invite/${invitationId}`)}`}>
                    Create account
                  </LinkButton>
                  <LinkButton
                    variant="secondary"
                    to={`/login?next=${encodeURIComponent(`/invite/${invitationId}`)}`}
                  >
                    Sign in
                  </LinkButton>
                </div>
              </>
            ) : !auth.user.emailVerified ? (
              <>
                <p>Verify your email before accepting this invitation.</p>
                <LinkButton to="/verify-email">Verify email</LinkButton>
              </>
            ) : (
              <>
                <SkeletonNote>
                  {DEMO_MODE
                    ? 'This is an illustrative invitation. It creates a member relationship in demo memory only.'
                    : 'Acceptance will verify the signed-in email and a single-use token in a trusted Cloud Function.'}
                </SkeletonNote>
                <Button
                  disabled={action.working}
                  onClick={() => {
                    void action
                      .run(async () => {
                        await invitationService.accept(
                          invitationId,
                          auth.user!.uid,
                          auth.user!.displayName ?? 'Member',
                        );
                        org.refresh();
                        setAccepted(true);
                      }, 'Demo membership created.')
                      .then((ok) => {
                        if (ok) navigate('/app/account');
                      });
                  }}
                >
                  Accept invitation
                </Button>
              </>
            )}
          </>
        )}
      </ResourceState>
      <ActionStatus {...action} />
    </Card>
  );
}
export function OnboardingPage() {
  const auth = useAuth();
  const profile = useCurrentUser();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const action = useAction();
  const [emailMarketing, setEmailMarketing] = useState(false);
  return (
    <div className="form-narrow">
      <PageHeader
        eyebrow="Stage 3 · A thoughtful introduction"
        title="Make Nurture your own."
        description="A few essentials, then you can begin. Organization membership is always separate from your profile."
      />
      <Card>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void action
              .run(
                async () => {
                  if (!auth.user) throw new Error('Sign in first.');
                  await userService.ensure(auth.user);
                  const current = await userService.get(auth.user.uid);
                  if (!current) throw new Error('Your profile is not available yet.');
                  await userService.save(auth.user.uid, {
                    displayName: String(form.get('name')),
                    firstName: current.firstName,
                    lastName: current.lastName,
                    phone: current.phone,
                    preferences: { ...current.preferences, emailMarketing },
                    onboardingStatus: 'complete',
                  });
                  profile.refresh();
                },
                DEMO_MODE ? 'Demo profile saved.' : 'Profile saved.',
              )
              .then((ok) => {
                if (ok) navigate(safeReturnPath(params.get('next')));
              });
          }}
        >
          <Input
            label="What should we call you?"
            name="name"
            defaultValue={auth.user?.displayName ?? ''}
            maxLength={100}
            required
            autoComplete="name"
          />
          <Checkbox
            label="I would like optional Nurture email updates"
            checked={emailMarketing}
            onChange={(event) => setEmailMarketing(event.target.checked)}
          />
          <p className="muted">
            <small>
              Optional email preferences do not grant consent for every organization or enable any campaign.
              SMS marketing stays off.
            </small>
          </p>
          <div className="actions">
            <Button type="submit" disabled={action.working}>
              Save and begin
            </Button>
            <LinkButton variant="quiet" to={safeReturnPath(params.get('next'))}>
              Do this later
            </LinkButton>
          </div>
          <ActionStatus {...action} />
        </form>
      </Card>
    </div>
  );
}
export function CreateOrganizationPage() {
  const action = useAction();
  return (
    <div className="form-narrow">
      <PageHeader
        eyebrow="For organizations"
        title="Bring your experience together."
        description="Create a workspace for your team, participants, and the relationships that follow."
      />
      <Card>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void action.run(() => organizationService.create(String(data.get('name'))));
          }}
        >
          <Input label="Organization name" name="name" maxLength={100} required autoComplete="organization" />
          <SkeletonNote>
            Organization provisioning is a protected server workflow. This preview does not create an
            organization or assign an owner role from the browser.
          </SkeletonNote>
          <Button type="submit" disabled={action.working}>
            Preview organization setup
          </Button>
          <ActionStatus {...action} />
        </form>
        {DEMO_MODE && (
          <div className="card-footer">
            <LinkButton variant="secondary" to="/demo">
              Explore the sample organization
            </LinkButton>
          </div>
        )}
      </Card>
    </div>
  );
}
