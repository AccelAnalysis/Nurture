import { useId, useRef, useState, type FormEvent } from "react";
import type { SurveyAnswers, SurveyDraft } from "../../../shared/feedback/contracts";
import { validateAnswers } from "../../../shared/feedback/validation";
import "./feedback.css";
export interface SurveyFormProps { survey: SurveyDraft; onSubmit(answers: SurveyAnswers): Promise<unknown>; preview?: boolean }
export function SurveyForm({survey,onSubmit,preview=false}: SurveyFormProps) {
  const prefix=useId(), errorRef=useRef<HTMLParagraphElement>(null), lock=useRef(false);
  const [answers,setAnswers]=useState<SurveyAnswers>({}),[pending,setPending]=useState(false),[error,setError]=useState<string|null>(null),[complete,setComplete]=useState(false);
  const set=(key:string,value:string|number)=>setAnswers(old=>({...old,[key]:value}));
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(lock.current)return;setError(null);
    try {
      const valid=validateAnswers(survey,answers);
      if(preview){setError("Preview only. No response has been recorded.");return;}
      lock.current=true;setPending(true);await onSubmit(valid);setComplete(true);
    } catch {setError("Your response was not saved. Check your answers, then try again. The invitation may have expired.");requestAnimationFrame(()=>errorRef.current?.focus());}
    finally{lock.current=false;setPending(false);}
  }
  if(complete)return <section className="feedback-panel" role="status"><h2>Thank you for your feedback</h2><p>Your response has been recorded.</p></section>;
  return <form className="feedback-form" onSubmit={submit} aria-busy={pending}>
    <h2>{survey.title}</h2>
    <p>{survey.privacy==="anonymous"?"Your answers are not linked to your customer profile in staff results. Operational invitation records are retained under the organization’s feedback policy.":"Your response is private to authorized staff and may be linked to your customer profile."}</p>
    <p>Feedback is optional. Leaving this survey does not affect access to your Experience.</p>
    {preview&&<p className="feedback-notice">Preview — no invitations or responses are created.</p>}
    {error&&<p role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
    {survey.questions.map(question=>{
      const fieldId=`${prefix}-${question.id}`, label=`${question.label}${question.required?" (required)":" (optional)"}`;
      if(question.type==="nps"||question.type==="rating"){
        const min=question.type==="nps"?0:question.min,max=question.type==="nps"?10:question.max;
        return <fieldset key={question.id} disabled={pending}><legend>{label}</legend><div className="feedback-scale">
          {Array.from({length:max-min+1},(_,i)=>i+min).map(score=><label key={score}><input type="radio" name={fieldId} value={score} checked={answers[question.id]===score} required={question.required} onChange={()=>set(question.id,score)}/><span>{score}</span></label>)}
        </div>{question.type==="nps"&&<p className="feedback-scale-labels"><span>0 — Not at all likely</span><span>10 — Extremely likely</span></p>}</fieldset>;
      }
      return <div className="feedback-field" key={question.id}><label htmlFor={fieldId}>{label}</label>{question.type==="text"?
        <textarea id={fieldId} value={answers[question.id]??""} maxLength={question.maxLength} required={question.required} disabled={pending} rows={4} onChange={e=>set(question.id,e.target.value)}/>:
        <select id={fieldId} value={answers[question.id]??""} required={question.required} disabled={pending} onChange={e=>set(question.id,e.target.value)}><option value="">Choose an answer</option>{question.options.map(option=><option key={option}>{option}</option>)}</select>}</div>;
    })}
    <button className="primary-action" type="submit" disabled={pending}>{pending?"Submitting…":preview?"Check preview":"Submit feedback"}</button>
  </form>;
}
