import { httpsCallable, type Functions } from "firebase/functions";
import type {
  LifecycleAutomationConfiguration,
  LifecycleAutomationPort,
  LifecycleWorkspaceSnapshot,
} from "./contracts";

export class FirebaseLifecycleAutomationPort implements LifecycleAutomationPort {
  constructor(private readonly functions: Functions) {}

  async getWorkspace(organizationId: string): Promise<LifecycleWorkspaceSnapshot> {
    const callable = httpsCallable<{ organizationId: string }, LifecycleWorkspaceSnapshot>(this.functions, "getLifecycleAutomationWorkspace");
    return (await callable({ organizationId })).data;
  }

  async saveDraft(
    organizationId: string,
    draft: LifecycleAutomationConfiguration[],
    expectedRevision: number,
  ): Promise<LifecycleWorkspaceSnapshot> {
    const callable = httpsCallable<{
      organizationId: string;
      draft: LifecycleAutomationConfiguration[];
      expectedRevision: number;
    }, LifecycleWorkspaceSnapshot>(this.functions, "saveLifecycleAutomationDraft");
    return (await callable({ organizationId, draft, expectedRevision })).data;
  }

  async publishDraft(organizationId: string, expectedRevision: number): Promise<LifecycleWorkspaceSnapshot> {
    const callable = httpsCallable<{
      organizationId: string;
      expectedRevision: number;
    }, LifecycleWorkspaceSnapshot>(this.functions, "publishLifecycleAutomationDraft");
    return (await callable({ organizationId, expectedRevision })).data;
  }
}
