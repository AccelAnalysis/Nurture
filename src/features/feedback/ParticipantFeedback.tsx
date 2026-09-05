import { useEffect, useRef, useState } from "react";
import type { FeedbackApi } from "../../../shared/feedback/api";
import type { ParticipantReferralView, SurveyAccess } from "../../../shared/feedback/contracts";
import { SurveyForm } from "./SurveyForm";
import { referralShareUrl } from "./client";
import "./feedback.css";
export function SurveyPage({api,token,signInHref="/sign-in"}:{api:FeedbackApi;token:string|null;signInHref?:string}) {
  const [state,setState]=useState<SurveyAccess|null>(null),[error,setError]=useState(false);
  useEffect(()=>{let live=true;setState(null);setError(false);if(!token){setError(true);return;}
    api.survey(token).then(value=>{if(live)setState(value);},()=>{if(live)setError(true);});return()=>{live=false;};},[api,token]);
  if(error)return <section className="feedback-panel" role="alert"><h1>Survey unavailable</h1><p>This link may have expired or been withdrawn. No private account information is shown.</p></section>;
  if(!state)return <p role="status">Loading survey…</p>;
  if(state.state==="completed")return <section className="feedback-panel"><h1>Feedback already received</h1><p>Thank you. There is no need to submit again.</p></section>;
  if(state.state==="sign-in-required")return <section className="feedback-panel"><h1>Sign in to continue</h1><p>This survey requires the invited account.</p><a href={signInHref.startsWith("/")&&!signInHref.startsWith("//")?signInHref:"/sign-in"}>Sign in</a></section>;
  return <section className="feedback-panel"><h1>Share your feedback</h1><SurveyForm key={`${token}-${state.versionId}`} survey={state.survey} onSubmit={answers=>api.submit(token!,answers)}/></section>;
}
export function ReferralCenter({api,programId,publicOrigin}:{api:FeedbackApi;programId:string;publicOrigin:string}) {
  const [view,setView]=useState<ParticipantReferralView|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");const lock=useRef(false);
  useEffect(()=>{let live=true;setView(null);setError(null);api.referral(programId).then(v=>{if(live)setView(v);},()=>{if(live)setError("Referral information is unavailable.");});return()=>{live=false;};},[api,programId]);
  async function action(work:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError(null);try{await work();}catch{setError("This action could not be completed. Try again.");}finally{lock.current=false;setBusy(false);}}
  let url:string|null=null;try{if(view?.code)url=referralShareUrl(publicOrigin,view.code);}catch{/* Never render an unsafe URL. */}
  return <section className="feedback-panel" aria-busy={busy}><h1>{view?.title??"Referrals"}</h1>
    <p>Sharing is optional and never required to use your Experience.</p>{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {!view&&!error&&<p role="status">Loading referral information…</p>}
    {view&&<><p className="feedback-terms">{view.terms}</p>{!view.shareAvailable&&<p>{view.reason??"Sharing is unavailable."}</p>}
      {view.shareAvailable&&!url&&<button disabled={busy} onClick={()=>action(async()=>{await api.code(programId);setView(await api.referral(programId));})}>Create my referral link</button>}
      {url&&<div className="feedback-actions"><label className="feedback-field">Your referral link<input readOnly value={url} onFocus={e=>e.target.select()}/></label>
        <button disabled={busy} onClick={()=>action(async()=>{await navigator.clipboard.writeText(url!);setNotice("Referral link copied.");})}>Copy link</button>
        {typeof navigator!=="undefined"&&typeof navigator.share==="function"&&<button disabled={busy} onClick={()=>action(async()=>{try{await navigator.share({title:view.title,url:url!});setNotice("Share sheet opened.");}catch(e){if(!(e instanceof Error&&e.name==="AbortError"))throw e;}})}>Share</button>}
      </div>}
      <h2>Your referral activity</h2>{view.progress.length===0?<p>No referral activity yet. No rewards have been earned.</p>:<ul className="feedback-records">{view.progress.map((entry,index)=><li key={entry.referralId}><strong>Referral {index+1}</strong><span>{entry.status.replaceAll("-"," ")}</span>{entry.rewards.map((reward,i)=><p key={i}>{reward.units} test credits — {reward.state.replaceAll("-"," ")}. Test credits have no monetary value.</p>)}</li>)}</ul>}
      {view.cursor&&<button disabled={busy} onClick={()=>action(async()=>{const next=await api.referral(programId,view.cursor!);setView({...next,progress:[...view.progress,...next.progress]});})}>Load more activity</button>}
    </>}
  </section>;
}
