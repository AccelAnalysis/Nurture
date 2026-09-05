import { EmptyState, LoadingState } from "../../components/ui";
import type { ParticipantViewState } from "./contracts";

export function ParticipantStateView({ state, title, description }: { state: ParticipantViewState; title?: string; description?: string }) {
  if (state === "loading") return <LoadingState label={description ?? "Loading experience…"} />;
  if (state === "error") return <div className="state-panel error-state">{description ?? "This experience could not be loaded."}</div>;
  const defaults: Record<Exclude<ParticipantViewState, "loading" | "error" | "ready">, [string, string]> = {
    empty: ["Nothing here yet", "This experience does not have content to show yet."],
    unavailable: ["Experience unavailable", "This participant destination is not available in the current application skeleton."],
    "permission-limited": ["Access is limited", "Your current entitlement does not include this part of the experience."],
    complete: ["Experience complete", "You completed this experience. The next lifecycle action can appear here."],
  };
  if (state === "ready") return null;
  const [defaultTitle, defaultDescription] = defaults[state];
  return <EmptyState title={title ?? defaultTitle} description={description ?? defaultDescription} />;
}
