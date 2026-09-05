export type ParticipantViewState =
  | "loading"
  | "ready"
  | "empty"
  | "unavailable"
  | "error"
  | "permission-limited"
  | "complete";

export type ParticipantAccessMode = "public" | "trial" | "authenticated";

export interface ParticipantEntitlement {
  key: string;
  label: string;
  source: "free" | "trial" | "offer" | "organization" | "subscription";
  expiresAt?: string;
}

export interface ParticipantExperienceState {
  experienceId: string;
  state: ParticipantViewState;
  progressPercent?: number;
  currentAction?: string;
  completedAt?: string;
}

export interface ExperienceModuleRegistration {
  id: string;
  slot: "primary" | "secondary";
  label: string;
  route: "/app/experience" | "/app/secondary";
  supportedAccess: ParticipantAccessMode[];
}

export const participantExperienceSlots: ExperienceModuleRegistration[] = [
  {
    id: "primary-experience-slot",
    slot: "primary",
    label: "Primary App Experience",
    route: "/app/experience",
    supportedAccess: ["public", "trial", "authenticated"],
  },
  {
    id: "secondary-experience-slot",
    slot: "secondary",
    label: "Secondary Experience",
    route: "/app/secondary",
    supportedAccess: ["authenticated"],
  },
];
