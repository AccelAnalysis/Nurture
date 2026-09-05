import { useState } from "react";
import { REFERENCE_ASSESSMENT_CAPABILITIES } from "../../../../shared/experience/reference-capabilities";
import {
  REFERENCE_ASSESSMENT_MILESTONE_KEY,
  REFERENCE_ASSESSMENT_QUESTIONS,
  referenceAssessmentEvidence,
} from "../../../../shared/experience/reference-lifecycle";
import { Badge, Button, Card } from "../../../components/ui";
import type { ExperienceMediaAsset, ExperienceModule, ExperienceModuleRenderContext } from "../contracts";

const PROGRESS_KEY = "nurture:reference-assessment:progress:v2";

type ReferenceAnswers = Record<string, string>;
interface ReferenceProgress {
  step: number;
  answers: ReferenceAnswers;
}

const referenceMedia: ExperienceMediaAsset[] = [
  {
    id: "reference-blue-texture",
    kind: "image",
    provider: "pexels",
    title: "Abstract blue texture",
    deliveryUrl: "https://images.pexels.com/photos/24712929/pexels-photo-24712929/free-photo-of-abstract-blue-background.jpeg?auto=compress&dpr=1&h=750&w=1260",
    sourceUrl: "https://www.pexels.com/photo/abstract-blue-background-24712929/",
    alt: "Abstract blue brush strokes and gradients.",
    creator: "Steve A Johnson",
    licenseUrl: "https://www.pexels.com/license/",
  },
  {
    id: "reference-youtube-player",
    kind: "video",
    provider: "youtube",
    title: "Optional YouTube player integration fixture",
    sourceUrl: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
  },
];

function emptyProgress(): ReferenceProgress {
  return { step: 0, answers: {} };
}

function readProgress(key: string): ReferenceProgress {
  if (typeof window === "undefined") return emptyProgress();
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptyProgress();
    const record = parsed as Record<string, unknown>;
    const step = typeof record.step === "number" && Number.isInteger(record.step)
      ? record.step
      : 0;
    const rawAnswers = record.answers;
    const answers: ReferenceAnswers = {};
    if (rawAnswers && typeof rawAnswers === "object" && !Array.isArray(rawAnswers)) {
      for (const [questionId, optionId] of Object.entries(rawAnswers as Record<string, unknown>)) {
        if (typeof optionId === "string") answers[questionId] = optionId;
      }
    }
    return {
      step: Math.max(0, Math.min(step, REFERENCE_ASSESSMENT_QUESTIONS.length)),
      answers,
    };
  } catch {
    return emptyProgress();
  }
}

function persistProgress(key: string, progress: ReferenceProgress) {
  if (typeof window !== "undefined") sessionStorage.setItem(key, JSON.stringify(progress));
}

function completionActionId(context: ExperienceModuleRenderContext) {
  const subject = context.customerId ?? context.identityId ?? "public-session";
  return `reference-assessment-completed:${context.experience.id}:${subject}:v1`;
}

function Assessment({ context }: { context: ExperienceModuleRenderContext }) {
  const progressKey = `${PROGRESS_KEY}:${context.experience.id}:${context.identityId ?? "public"}`;
  const [progress, setProgress] = useState<ReferenceProgress>(() => readProgress(progressKey));
  const complete = progress.step >= REFERENCE_ASSESSMENT_QUESTIONS.length;
  const title = typeof context.configuration.title === "string" ? context.configuration.title : "Momentum Check";
  const completionMessage = typeof context.configuration.completionMessage === "string"
    ? context.configuration.completionMessage
    : "You have a clearer signal for what to do next.";

  const choose = (questionId: string, optionId: string) => {
    const nextAnswers = { ...progress.answers, [questionId]: optionId };
    const nextStep = Math.min(progress.step + 1, REFERENCE_ASSESSMENT_QUESTIONS.length);
    const next = { step: nextStep, answers: nextAnswers };
    persistProgress(progressKey, next);
    setProgress(next);
    context.submitEvent("experience.reference-assessment.answer_selected", { questionId, step: nextStep });
    if (nextStep === REFERENCE_ASSESSMENT_QUESTIONS.length) {
      const actionId = completionActionId(context);
      context.submitEvent(
        "experience.reference-assessment.completed",
        { completedQuestions: REFERENCE_ASSESSMENT_QUESTIONS.length },
        actionId,
      );
      // This is a command request, not a trusted event. The server re-binds the
      // customer and validates the complete answer set before emitting the
      // global `experience.milestone_reached` event.
      void context.reachMilestone(
        REFERENCE_ASSESSMENT_MILESTONE_KEY,
        actionId,
        referenceAssessmentEvidence(nextAnswers),
      );
    }
  };

  const restart = () => {
    const next = emptyProgress();
    persistProgress(progressKey, next);
    setProgress(next);
  };

  if (complete) {
    return (
      <div className="experience-module-stack">
        <Card className="reference-completion">
          <Badge tone="positive">Complete</Badge>
          <h2>{completionMessage}</h2>
          <p>
            This reference module keeps only browser-session progress. Completion is a browser signal until the
            trusted domain validator accepts it as a customer milestone.
          </p>
          <div className="hero-actions">
            {context.accessMode === "authenticated"
              ? <Button className="button-secondary" onClick={restart}>Restart check</Button>
              : <Button onClick={() => context.requestRegistration("/app/experience/review")}>Create account to continue</Button>}
          </div>
        </Card>

        <section aria-labelledby="reference-media-title">
          <div className="experience-section-heading">
            <div>
              <p className="eyebrow">Host-rendered media</p>
              <h2 id="reference-media-title">Optional supporting content</h2>
            </div>
            <p>Neither item is required to complete the Experience or earn access.</p>
          </div>
          <div className="experience-media-grid">{referenceMedia.map((asset) => <div key={asset.id}>{context.renderMedia(asset)}</div>)}</div>
        </section>
      </div>
    );
  }

  const question = REFERENCE_ASSESSMENT_QUESTIONS[progress.step];
  return (
    <Card className="reference-assessment-card">
      <div className="experience-progress">
        <span>Question {progress.step + 1} of {REFERENCE_ASSESSMENT_QUESTIONS.length}</span>
        <progress max={REFERENCE_ASSESSMENT_QUESTIONS.length} value={progress.step + 1} />
      </div>
      <p className="eyebrow">{title}</p>
      <h2>{question.prompt}</h2>
      <div className="experience-answer-grid">
        {question.options.map((option) => (
          <Button key={option.id} className="button-secondary" onClick={() => choose(question.id, option.id)}>{option.label}</Button>
        ))}
      </div>
      <p className="muted">Lifecycle activity records only the question identifier and progress step; answer selections are used only as short-lived evidence for the owning domain validator.</p>
    </Card>
  );
}

function Review({ context }: { context: ExperienceModuleRenderContext }) {
  const progress = readProgress(`${PROGRESS_KEY}:${context.experience.id}:${context.identityId ?? "public"}`);
  return (
    <div className="two-column">
      <Card>
        <Badge tone="accent">Authenticated capability</Badge>
        <h2>Your review</h2>
        <p>{progress.step >= REFERENCE_ASSESSMENT_QUESTIONS.length ? "The public/trial check is complete in this browser." : `You reached ${progress.step} of ${REFERENCE_ASSESSMENT_QUESTIONS.length} questions in this browser.`}</p>
        <p className="muted">A future persisted module record can live behind the module's organization/customer data contract without changing authentication or billing.</p>
      </Card>
      <Card>
        <h2>Access stays separate</h2>
        <p>This review is available because the module declares authenticated access. It does not imply a paid entitlement or organization administrator role.</p>
      </Card>
    </div>
  );
}

function DeepDive({ context }: { context: ExperienceModuleRenderContext }) {
  const [result, setResult] = useState<{ title: string; prompt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true); setError(null);
    try {
      const data = await context.runProtectedOperation("reference.deep-dive");
      if (typeof data.title !== "string" || typeof data.prompt !== "string") throw new Error("The protected result is unavailable.");
      setResult({ title: data.title, prompt: data.prompt });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The protected result is unavailable."); }
    finally { setBusy(false); }
  };
  return <Card><h2>Deep dive</h2><p>Your current access is verified again by the server before a result is returned.</p>
    <Button disabled={busy} onClick={() => void load()}>{busy ? "Checking access…" : "Open my reflection"}</Button>
    {error ? <p role="alert">{error}</p> : null}
    {result ? <section aria-live="polite"><h3>{result.title}</h3><p>{result.prompt}</p></section> : null}
  </Card>;
}

export const referenceAssessmentModule: ExperienceModule = {
  manifest: {
    id: "nurture.reference-assessment",
    version: "1.0.0",
    contractVersion: "1.1.0",
    name: "Momentum Check",
    description: "A deliberately small reference Experience proving trial, authenticated, entitlement, media, routing, and lifecycle boundaries.",
    icon: "/brand/logo/nurture-n-glass.png",
    routes: [
      { path: "", label: "Check", access: ["public", "trial", "authenticated"], capability: REFERENCE_ASSESSMENT_CAPABILITIES.preview },
      { path: "review", label: "Review", access: ["authenticated"], capability: REFERENCE_ASSESSMENT_CAPABILITIES.review },
      { path: "deep-dive", label: "Deep dive", access: ["authenticated"], capability: REFERENCE_ASSESSMENT_CAPABILITIES.deepDive },
    ],
    navigation: [
      { path: "", label: "Check", description: "Run the short reference interaction.", access: ["public", "trial", "authenticated"], capability: REFERENCE_ASSESSMENT_CAPABILITIES.preview },
      { path: "review", label: "Review", description: "Account-only continuation.", access: ["authenticated"], capability: REFERENCE_ASSESSMENT_CAPABILITIES.review },
      { path: "deep-dive", label: "Deep dive", description: "Protected capability handoff.", access: ["authenticated"], capability: REFERENCE_ASSESSMENT_CAPABILITIES.deepDive },
    ],
    configurationSchema: {
      title: { type: "string", label: "Experience title", required: true },
      completionMessage: { type: "string", label: "Completion message", required: true },
    },
    defaults: {
      title: "Momentum Check",
      completionMessage: "You have a clearer signal for what to do next.",
    },
    capabilities: [
      {
        key: REFERENCE_ASSESSMENT_CAPABILITIES.preview,
        label: "Momentum Check",
        description: "Complete the short reference interaction.",
        availability: ["public", "trial", "authenticated"],
      },
      {
        key: REFERENCE_ASSESSMENT_CAPABILITIES.review,
        label: "Account review",
        description: "Continue the reference Experience after authentication.",
        availability: ["authenticated"],
      },
      {
        key: REFERENCE_ASSESSMENT_CAPABILITIES.deepDive,
        label: "Deep dive",
        description: "A protected optional capability used to prove entitlement enforcement.",
        availability: ["authenticated"],
        requiresEntitlement: true,
        upgradeContext: "reference-assessment-deep-dive",
      },
    ],
    eventDefinitions: [
      {
        name: "experience.reference-assessment.answer_selected",
        description: "Browser-observed ordinary progress through the reference interaction.",
        source: "browser",
        schemaVersion: 1,
        maxPayloadBytes: 512,
        payloadSchema: {
          questionId: {
            type: "string",
            required: true,
            maxLength: 40,
            allowedValues: REFERENCE_ASSESSMENT_QUESTIONS.map((question) => question.id),
          },
          step: {
            type: "number",
            required: true,
            integer: true,
            min: 1,
            max: REFERENCE_ASSESSMENT_QUESTIONS.length,
          },
        },
      },
      {
        name: "experience.reference-assessment.completed",
        description: "Browser-observed completion candidate; shared activation requires the trusted domain validator.",
        source: "browser",
        schemaVersion: 1,
        maxPayloadBytes: 256,
        payloadSchema: {
          completedQuestions: {
            type: "number",
            required: true,
            integer: true,
            min: REFERENCE_ASSESSMENT_QUESTIONS.length,
            max: REFERENCE_ASSESSMENT_QUESTIONS.length,
          },
        },
        requiresServerValidation: true,
      },
    ],
    profileRequirements: [],
    onboardingRequirements: [],
    activityDefinition: {
      meaningfulEvent: "experience.reference-assessment.completed",
      description: "Completing all reference questions is the first meaningful-use candidate; opening the page is only `experience.started` and is not activation.",
      pageViewCountsAsActivity: false,
      activation: {
        moduleEvent: "experience.reference-assessment.completed",
        milestoneKey: REFERENCE_ASSESSMENT_MILESTONE_KEY,
        verification: "trusted-domain-action",
      },
    },
    dataContract: {
      scope: "session-only",
      retention: "Reference progress and candidate evidence are stored only for the current browser session.",
      export: "No durable module record is created by this fixture.",
      migration: "Versioned session keys prevent incompatible progress from being reinterpreted.",
    },
    compatibility: {
      hostContract: "1.x",
      hostVersion: ">=0.1.0",
      unavailableBehavior: "Host renders a standardized unavailable state without affecting account or billing access.",
    },
  },
  render(context) {
    if (context.route.path === "review") return <Review context={context} />;
    if (context.route.path === "deep-dive") return <DeepDive context={context} />;
    return <Assessment context={context} />;
  },
};
