import { FeedbackError, type FeedbackScope } from "../../../shared/feedback/contracts.js";
import { id, integer, invariant, onlyKeys, record, text } from "../../../shared/feedback/validation.js";
import type { FeedbackDependencies, TrustedFeedbackActor } from "./ports.js";
import { FeedbackConfigurationService } from "./configuration.js";
import { SurveyService } from "./surveys.js";
import { ReferralService } from "./referrals.js";

export interface FeedbackRequestContext { scope: FeedbackScope; actor: TrustedFeedbackActor | null }
/** Called only after the existing server resolver verifies tenant/mode, App Check, rate limit and identity.
 * No handler accepts caller-supplied capabilities, qualification state, rewards, recipient IDs or event provenance. */
export function feedbackCommands(deps: FeedbackDependencies) {
  const config = new FeedbackConfigurationService(deps), surveys = new SurveyService(deps), referrals = new ReferralService(deps);
  return async (context: FeedbackRequestContext, raw: unknown): Promise<unknown> => {
    const input = record(raw); const action = text(input.action, 32);
    const payload = record(input.payload); onlyKeys(input, ["action", "payload"]);
    const { scope, actor } = context;
    const authenticated = () => { invariant(actor, "permission-denied"); return actor; };
    const cursor = () => payload.after === undefined ? undefined : id(payload.after);
    const kind = () => { invariant(payload.kind === "survey" || payload.kind === "program", "invalid-input"); return payload.kind; };
    switch (action) {
      case "list": onlyKeys(payload,["kind","after"]); return config.list(scope,authenticated(),kind(),cursor());
      case "save": onlyKeys(payload,["kind","entityId","revision","draft"]); return config.save(scope,authenticated(),kind(),id(payload.entityId),integer(payload.revision,0,1_000_000),payload.draft);
      case "publish": onlyKeys(payload,["kind","entityId","revision"]); return config.publish(scope,authenticated(),kind(),id(payload.entityId),integer(payload.revision,1,1_000_000));
      case "archive": onlyKeys(payload,["kind","entityId","revision"]); await config.archive(scope,authenticated(),kind(),id(payload.entityId),integer(payload.revision,1,1_000_000)); return null;
      case "history": onlyKeys(payload,["kind","entityId","after"]); return config.history(scope,authenticated(),kind(),id(payload.entityId),cursor());
      case "survey": onlyKeys(payload,["token"]); return surveys.access(scope,text(payload.token,43,43),actor);
      case "submit": onlyKeys(payload,["token","answers"]); return surveys.submit(scope,text(payload.token,43,43),payload.answers,actor);
      case "nps": onlyKeys(payload,["versionId","fromDay","toDay"]); return surveys.nps(scope,authenticated(),id(payload.versionId),text(payload.fromDay,10,10),text(payload.toDay,10,10));
      case "responses": onlyKeys(payload,["versionId","after"]); return surveys.responses(scope,authenticated(),id(payload.versionId),cursor());
      case "withdraw": onlyKeys(payload,["invitationId"]); await surveys.withdraw(scope,authenticated(),id(payload.invitationId)); return null;
      case "closeRecovery": onlyKeys(payload,["customerId","reason"]); await surveys.closeRecovery(scope,authenticated(),id(payload.customerId),text(payload.reason,500,3)); return null;
      case "referral": onlyKeys(payload,["programId","after"]); return referrals.own(scope,authenticated(),id(payload.programId),cursor());
      case "code": onlyKeys(payload,["programId"]); return referrals.createCode(scope,authenticated(),id(payload.programId));
      case "capture": onlyKeys(payload,["code","previousProof"]); return referrals.capture(scope,text(payload.code,43,43),payload.previousProof === undefined ? undefined : text(payload.previousProof,43,43));
      case "bind": onlyKeys(payload,["proof"]); return referrals.bind(scope,authenticated(),text(payload.proof,43,43));
      default: throw new FeedbackError("invalid-input", "Unsupported feedback action.");
    }
  };
}
