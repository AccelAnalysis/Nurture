import { releaseBackendReady, localDemoEnabled, backendUnavailableMessage } from "../app/release/readiness";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button, Card, Input, PageHeader, Select } from "../components/ui";
import { signInAccount, useAuth } from "../features/identity/auth";
import { emitIdentityLifecycleSignal } from "../features/identity/events";
import { identityPolicy } from "../features/identity/policy";
import { registerAccount } from "../features/identity/registration";
import type { RegistrationEntryPoint, RegistrationHandoff } from "../features/identity/registration/contracts";
import { usePlatform } from "../context/PlatformContext";
import { Link, navigate, useRoute } from "../router";
import { authService } from "../services/authService";
import type { OrganizationRole } from "../types/models";

const registrationEntryPoints = new Set<RegistrationEntryPoint>(["public", "offer", "trial", "organization-invitation", "referral"]);

function safeReturnTo(value: string | null, fallback = "/app") {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

function registrationHandoff(route: ReturnType<typeof useRoute>, returnTo: string): RegistrationHandoff {
  const requestedEntry = route.query.get("entryPoint") as RegistrationEntryPoint | null;
  const entryPoint = requestedEntry && registrationEntryPoints.has(requestedEntry) ? requestedEntry : "public";
  return {
    entryPoint,
    returnTo,
    ...(route.query.get("organizationId") ? { organizationId: route.query.get("organizationId")! } : {}),
    ...(route.query.get("invitationId") ? { invitationId: route.query.get("invitationId")! } : {}),
    ...(route.query.get("referralCode") ? { referralCode: route.query.get("referralCode")! } : {}),
    ...(route.query.get("offerId") ? { offerId: route.query.get("offerId")! } : {}),
    ...(route.query.get("source") ? { source: route.query.get("source")! } : {}),
  };
}

export function AuthPage({ mode }: { mode: "login" | "register" | "forgot" | "verify" }) {
  const { firebaseUser, customerProfile, signInDemo, clearDemo, refreshCustomerProfile, isDemo } = useAuth();
  const { enableDemo: enablePlatformDemo, clearDemo: clearPlatformDemo } = usePlatform();
  const route = useRoute();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const returnTo = safeReturnTo(route.query.get("returnTo"));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!releaseBackendReady) { setMessage(backendUnavailableMessage); return; }
    setBusy(true);
    setMessage(null);
    clearDemo();
    clearPlatformDemo();
    try {
      if (mode === "login") {
        await signInAccount(email, password);
        await refreshCustomerProfile();
        navigate(returnTo);
      }
      if (mode === "register") {
        await registerAccount({ email, password, handoff: registrationHandoff(route, returnTo) });
        await refreshCustomerProfile();
        const onboardingReturn = `/onboarding?returnTo=${encodeURIComponent(returnTo)}`;
        navigate(`/verify-email?returnTo=${encodeURIComponent(onboardingReturn)}`);
      }
      if (mode === "forgot") {
        await authService.resetPassword(email);
        setMessage("If an account can receive a reset message, instructions have been requested. Check your email.");
      }
    } catch (reason: unknown) {
      setMessage(reason instanceof Error ? reason.message : "Unable to continue.");
    } finally {
      setBusy(false);
    }
  };

  if (mode === "verify") {
    return (
      <VerificationPage
        firebaseUser={firebaseUser}
        customerId={customerProfile?.customerId}
        returnTo={returnTo}
        isDemo={isDemo}
      />
    );
  }

  const title = mode === "login" ? "Sign in" : mode === "register" ? "Create your Nurture account" : "Reset your password";
  const description = mode === "login"
    ? "Continue to your participant experience or an authorized administration workspace."
    : mode === "register"
      ? "Registration creates an authentication identity and a separate stable Nurture customer profile. Organization memberships remain separate."
      : "Enter your email to request a password reset.";

  return (
    <AuthFrame>
      <PageHeader eyebrow="Nurture account" title={title} description={description} />
      <Card className="form-card">
        {!releaseBackendReady ? <p role="status">{backendUnavailableMessage}</p> : null}
        <form onSubmit={submit}>
          <label>Email<Input required autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          {mode !== "forgot" ? <label>Password<Input required autoComplete={mode === "register" ? "new-password" : "current-password"} type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></label> : null}
          <Button disabled={busy || !releaseBackendReady}>{busy ? "Working…" : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : "Send reset link"}</Button>
        </form>
        {message ? <p className="form-message" role="status">{message}</p> : null}
        {mode === "login" ? (
          <>
            {localDemoEnabled ? <><div className="divider"><span>Local development preview</span></div>
            <div className="demo-actions">
              <Button className="button-secondary" onClick={() => { clearPlatformDemo(); signInDemo("member"); navigate("/app"); }}>Participant demo</Button>
              <Button className="button-secondary" onClick={() => { clearPlatformDemo(); signInDemo("owner"); navigate("/org/nurture-demo/admin/dashboard"); }}>Organization admin demo</Button>
              <Button className="button-secondary" onClick={() => { signInDemo("member"); enablePlatformDemo("administrator"); navigate("/platform"); }}>Platform admin demo</Button>
            </div>
            </> : null}
            <p><Link href="/forgot-password">Forgot password?</Link> · <Link href="/register">Create account</Link></p>
          </>
        ) : mode === "register" ? <p>Already registered? <Link href="/sign-in">Sign in</Link></p> : <p><Link href="/sign-in">Back to sign in</Link></p>}
      </Card>
    </AuthFrame>
  );
}

function VerificationPage({ firebaseUser, customerId, returnTo, isDemo }: {
  firebaseUser: ReturnType<typeof useAuth>["firebaseUser"];
  customerId?: string;
  returnTo: string;
  isDemo: boolean;
}) {
  const [verified, setVerified] = useState(Boolean(firebaseUser?.emailVerified || isDemo));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setVerified(Boolean(firebaseUser?.emailVerified || isDemo)), [firebaseUser?.emailVerified, isDemo]);

  if (!firebaseUser && !isDemo) {
    return (
      <AuthFrame>
        <PageHeader eyebrow="Account" title="Sign in to verify your email" description="Verification is attached to a registered authentication identity." />
        <Card><Link className="button" href={`/sign-in?returnTo=${encodeURIComponent(`/verify-email?returnTo=${encodeURIComponent(returnTo)}`)}`}>Go to sign in</Link></Card>
      </AuthFrame>
    );
  }

  const refresh = async () => {
    if (isDemo) return;
    setBusy(true);
    setMessage(null);
    try {
      const user = await authService.reloadCurrentUser();
      setVerified(user.emailVerified);
      if (user.emailVerified) {
        emitIdentityLifecycleSignal("identity.verified", {
          identityId: user.uid,
          ...(customerId ? { customerId } : {}),
        });
        setMessage("Email verification confirmed.");
      } else {
        setMessage("Verification has not been confirmed yet.");
      }
    } catch (reason: unknown) {
      setMessage(reason instanceof Error ? reason.message : "Unable to refresh verification status.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await authService.sendVerification();
      setMessage("Verification email requested. Delivery can take a moment depending on the configured Firebase email provider.");
    } catch (reason: unknown) {
      setMessage(reason instanceof Error ? reason.message : "Unable to request a verification email.");
    } finally {
      setBusy(false);
    }
  };

  const verificationRequired = identityPolicy.requireEmailVerificationBeforeOnboarding;
  return (
    <AuthFrame>
      <PageHeader
        eyebrow="Account"
        title={verified ? "Email verified" : "Verify your email"}
        description={verified
          ? "Your authentication identity reports a verified email address."
          : verificationRequired
            ? "Verify this email before onboarding can continue."
            : "Verification is available now; Release 1 does not invent a universal verification gate when an organization or Experience has not required one."}
      />
      <Card className="form-card">
        {!verified && !isDemo ? <p>Check the inbox for <strong>{firebaseUser?.email}</strong>, then refresh the status here.</p> : null}
        <div className="demo-actions">
          {!verified && !isDemo ? <Button className="button-secondary" disabled={busy} onClick={resend}>Resend verification</Button> : null}
          {!verified && !isDemo ? <Button className="button-secondary" disabled={busy} onClick={refresh}>I verified — refresh</Button> : null}
          <Button disabled={busy || (verificationRequired && !verified)} onClick={() => navigate(returnTo)}>{verified ? "Continue" : "Continue to onboarding"}</Button>
        </div>
        {message ? <p className="form-message" role="status">{message}</p> : null}
      </Card>
    </AuthFrame>
  );
}

function AuthFrame({ children }: { children: ReactNode }) {
  return <main className="auth-shell"><Link className="brand" href="/"><img src="/brand/logo/nurture-n-glass.png" alt="" /><span>Nurture</span></Link><section className="auth-card-wrap">{children}</section></main>;
}

export function InvitationPage({ invitationId }: { invitationId: string }) {
  const { signInDemo } = useAuth();
  const { clearDemo: clearPlatformDemo } = usePlatform();
  const [state, setState] = useState<"pending" | "expired" | "accepted">(
    invitationId.includes("expired") ? "expired" : invitationId.includes("accepted") ? "accepted" : "pending",
  );
  return (
    <AuthFrame>
      <PageHeader
        eyebrow="Organization invitation"
        title={state === "pending" ? "Join Nurture Demo Organization" : state === "expired" ? "This invitation expired" : "Invitation already accepted"}
        description={state === "pending" ? "Accepting creates or links a Nurture account, then establishes an organization membership." : state === "expired" ? "Ask the organization administrator to send a new invitation." : "Sign in with the account that accepted the invitation."}
      />
      <Card>
        {state === "pending" ? (
          <>
            <label>Role<Select value="manager" disabled><option>Manager</option></Select></label>
            <Button onClick={() => { clearPlatformDemo(); signInDemo("manager" as OrganizationRole); setState("accepted"); navigate("/org/nurture-demo/admin/dashboard"); }}>Accept invitation</Button>
          </>
        ) : <Link className="button" href="/sign-in">Go to sign in</Link>}
        <p className="muted">Invitation ID: {invitationId}</p>
      </Card>
    </AuthFrame>
  );
}
