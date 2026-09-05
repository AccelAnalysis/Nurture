import { localDemoEnabled } from "../../app/release/readiness";
import { LifecycleAutomationUnavailableError, validateLifecycleDraft, type LifecycleAutomationConfiguration, type LifecycleAutomationPort, type LifecycleWorkspaceSnapshot } from "./contracts";
import { createLifecycleWorkspaceFixture } from "./fixtures";
function clone<T>(value:T):T{return JSON.parse(JSON.stringify(value)) as T;}
export class DemoLifecycleAutomationPort implements LifecycleAutomationPort{
 private readonly workspaces=new Map<string,LifecycleWorkspaceSnapshot>();
 private workspace(organizationId:string){const existing=this.workspaces.get(organizationId);if(existing)return existing;const created=createLifecycleWorkspaceFixture(organizationId);this.workspaces.set(organizationId,created);return created;}
 async getWorkspace(organizationId:string){return clone(this.workspace(organizationId));}
 async saveDraft(organizationId:string,draft:LifecycleAutomationConfiguration[],expectedRevision:number){const current=this.workspace(organizationId);if(current.draftRevision!==expectedRevision)throw new Error("Lifecycle draft changed since it was loaded. Reload before saving.");const issues=validateLifecycleDraft(current.catalog,current.templates,draft);if(issues.length)throw new Error(issues.map((issue)=>`${issue.automationId}: ${issue.message}`).join(" "));const next={...current,draft:clone(draft),draftRevision:current.draftRevision+1};this.workspaces.set(organizationId,next);return clone(next);}
 async publishDraft(organizationId:string,expectedRevision:number){const current=this.workspace(organizationId);if(current.draftRevision!==expectedRevision)throw new Error("Lifecycle draft changed since it was loaded. Reload before publishing.");const issues=validateLifecycleDraft(current.catalog,current.templates,current.draft);if(issues.length)throw new Error(issues.map((issue)=>`${issue.automationId}: ${issue.message}`).join(" "));const version=(current.published?.version??0)+1;const publishedAt=new Date().toISOString();const next={...current,published:{id:`${organizationId}-lifecycle-v${version}-${Date.now()}`,version,publishedAt,automations:clone(current.draft)}};this.workspaces.set(organizationId,next);return clone(next);}
}
export class UnavailableLifecycleAutomationPort implements LifecycleAutomationPort{private unavailable():never{throw new LifecycleAutomationUnavailableError("The authoritative acquisition runtime is not connected. Track A will not persist automation state in browser storage or report a false publish.");}async getWorkspace():Promise<LifecycleWorkspaceSnapshot>{return this.unavailable();}async saveDraft():Promise<LifecycleWorkspaceSnapshot>{return this.unavailable();}async publishDraft():Promise<LifecycleWorkspaceSnapshot>{return this.unavailable();}}
const demoLifecycleAutomationPort=new DemoLifecycleAutomationPort();
const unavailableLifecycleAutomationPort=new UnavailableLifecycleAutomationPort();
let authoritativeLifecycleAutomationPort:LifecycleAutomationPort|null=null;

/** Composition seam for the Release 2 finisher. E remains the authoritative validation/execution owner. */
export function installAuthoritativeLifecycleAutomationPort(port:LifecycleAutomationPort){
 if(authoritativeLifecycleAutomationPort&&authoritativeLifecycleAutomationPort!==port)throw new Error("An authoritative lifecycle automation adapter is already installed.");
 authoritativeLifecycleAutomationPort=port;
}
function activeLifecycleAutomationPort(){return localDemoEnabled?demoLifecycleAutomationPort:(authoritativeLifecycleAutomationPort??unavailableLifecycleAutomationPort);}
export const lifecycleAutomationPort:LifecycleAutomationPort={
 getWorkspace:(organizationId)=>activeLifecycleAutomationPort().getWorkspace(organizationId),
 saveDraft:(organizationId,draft,expectedRevision)=>activeLifecycleAutomationPort().saveDraft(organizationId,draft,expectedRevision),
 publishDraft:(organizationId,expectedRevision)=>activeLifecycleAutomationPort().publishDraft(organizationId,expectedRevision),
};
