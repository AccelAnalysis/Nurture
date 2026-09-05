export type OnboardingStepStatus = "not-started" | "current" | "complete" | "blocked";

export interface OnboardingStepDefinition {
  id: string;
  route: string;
  label: string;
  optional: boolean;
}

export interface OnboardingState {
  status: "not-started" | "in-progress" | "complete";
  currentStepId?: string;
  steps: Record<string, OnboardingStepStatus>;
}

// Step order, profile bootstrap, verification gates, and completion rules are
// authoritative to the Identity / Registration / Onboarding owner.
