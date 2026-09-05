import { Card, PageHeader } from "../../components/ui";
import { Link } from "../../router";

export const onboardingRoutePrefix = "/onboarding";

export function OnboardingRouteBoundary({ step }: { step?: string }) {
  return (
    <main className="auth-shell">
      <Link className="brand" href="/"><img src="/brand/logo/nurture-n.svg" alt="" /><span>Nurture</span></Link>
      <section className="auth-card-wrap">
        <PageHeader
          eyebrow="Registration + onboarding"
          title={step ? `Onboarding: ${step}` : "Onboarding"}
          description="This route is reserved for the Identity, Registration & Onboarding owner. The application skeleton provides the handoff and state boundary without defining the production onboarding sequence."
        />
        <Card>
          <p>Future onboarding steps can own profile bootstrap, organization context, preferences, verification gates, and completion state behind this route boundary.</p>
          <Link href="/app">Continue to participant shell demo →</Link>
        </Card>
      </section>
    </main>
  );
}
