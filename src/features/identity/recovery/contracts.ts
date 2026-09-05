export type RecoveryState = "idle" | "requesting" | "requested" | "error";

export interface RecoveryRequest {
  email: string;
  returnTo?: string;
}

// Recovery UX, abuse controls, messaging, and success/error semantics belong to
// the Identity owner. This file exists only to reserve a feature-local model.
