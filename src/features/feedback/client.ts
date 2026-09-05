import { httpsCallable, type Functions } from "firebase/functions";
import type { FeedbackApi } from "../../../shared/feedback/api";
/** Reuses the application's existing Firebase Functions instance. applicationKey is only a server-validated mapping hint. */
export function createFeedbackClient(functions: Functions, applicationKey: string): FeedbackApi {
  const callable = httpsCallable(functions, "feedbackCommand");
  const call = async <T>(action: string, payload: Record<string,unknown>): Promise<T> => {
    const clean = Object.fromEntries(Object.entries(payload).filter(([,value]) => value !== undefined));
    const result = await callable({applicationKey,action,payload:clean}); return result.data as T;
  };
  return {
    list:(kind,after)=>call("list",{kind,after}), save:(kind,entityId,revision,draft)=>call("save",{kind,entityId,revision,draft}),
    publish:(kind,entityId,revision)=>call("publish",{kind,entityId,revision}), archive:(kind,entityId,revision)=>call("archive",{kind,entityId,revision}),
    history:(kind,entityId,after)=>call("history",{kind,entityId,after}),survey:token=>call("survey",{token}),submit:(token,answers)=>call("submit",{token,answers}),
    nps:(versionId,fromDay,toDay)=>call("nps",{versionId,fromDay,toDay}), responses:(versionId,after)=>call("responses",{versionId,after}),
    withdraw:invitationId=>call("withdraw",{invitationId}),closeRecovery:(customerId,reason)=>call("closeRecovery",{customerId,reason}),
    referral:(programId,after)=>call("referral",{programId,after}),code:programId=>call("code",{programId}),capture:(code,previousProof)=>call("capture",{code,previousProof}),bind:proof=>call("bind",{proof}),
  };
}
/** Fragment values are never analytics properties or storage keys. */
export function feedbackFragment(fragment: string, key: "invitation" | "referral"): string | null {
  const value = new URLSearchParams(fragment.replace(/^#/,"")).get(key);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
export function referralShareUrl(publicOrigin: string, code: string): string {
  const origin = new URL(publicOrigin);
  if (origin.protocol !== "https:" || origin.username || origin.password || !/^[A-Za-z0-9_-]{43}$/.test(code)) throw Error("Referral link is unavailable.");
  const url = new URL("/",origin); url.hash=`referral=${code}`; return url.toString();
}
