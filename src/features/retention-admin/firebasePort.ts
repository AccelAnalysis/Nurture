import { httpsCallable, type Functions } from "firebase/functions";
import type { AutomationDefinitionV3, RecoveryCommand, RecoveryCommandResult } from "../../../shared/release3/contracts";
import type { CustomerRetentionSnapshot, LifecycleStudioCatalog, LifecycleStudioPort } from "./model";

interface StudioRecord {
  draftDefinition?: AutomationDefinitionV3;
  publishedDefinition?: AutomationDefinitionV3;
}

export class FirebaseRelease3LifecycleStudioPort implements LifecycleStudioPort {
  constructor(private readonly functions: Functions) {}

  async loadCatalog(_organizationId: string): Promise<LifecycleStudioCatalog> {
    return {
      triggers: [],
      segmentFacts: [],
      actions: [
        { type: "email", label: "Email (held until approved outbound composition)" },
        { type: "in-app", label: "In-app treatment" },
        { type: "commercial-handoff", label: "Commercial handoff" },
      ],
      placementIds: [],
      messageTemplates: [],
      offerIds: [],
    };
  }

  async loadDefinitions(organizationId: string): Promise<AutomationDefinitionV3[]> {
    const callable = httpsCallable<{ organizationId: string }, { definitions: StudioRecord[] }>(this.functions, "r3GetLifecycleStudio");
    const result = (await callable({ organizationId })).data;
    return result.definitions
      .map((record) => record.draftDefinition ?? record.publishedDefinition)
      .filter((definition): definition is AutomationDefinitionV3 => Boolean(definition));
  }

  async saveDraft(definition: AutomationDefinitionV3): Promise<{ version: number }> {
    const callable = httpsCallable<{ organizationId: string; definition: AutomationDefinitionV3 }, { version: number }>(this.functions, "r3SaveAutomationDraft");
    return (await callable({ organizationId: definition.organizationId, definition })).data;
  }

  async dryRun(definition: AutomationDefinitionV3, customerId?: string): Promise<{ eligible: boolean; reasons: import("../../../shared/release3/contracts").Release3ReasonCode[] }> {
    if (!customerId) return { eligible: false, reasons: ["customer-missing"] };
    const callable = httpsCallable<{ organizationId: string; customerId: string; definition: AutomationDefinitionV3 }, { eligible: boolean; reasons: import("../../../shared/release3/contracts").Release3ReasonCode[] }>(this.functions, "r3DryRunAutomationDefinition");
    return (await callable({ organizationId: definition.organizationId, customerId, definition })).data;
  }

  async publish(organizationId: string, automationId: string, expectedDraftVersion: number): Promise<{ publishedVersion: number }> {
    const callable = httpsCallable<{ organizationId: string; automationId: string; expectedDraftVersion: number }, { publishedVersion: number }>(this.functions, "r3PublishAutomationDefinition");
    return (await callable({ organizationId, automationId, expectedDraftVersion })).data;
  }

  async loadCustomerSnapshot(_organizationId: string, _customerId: string): Promise<CustomerRetentionSnapshot> {
    throw new Error("Select an authorized customer from the lifecycle customer workspace before loading Release 3 treatment inspection.");
  }

  async executeRecovery(command: RecoveryCommand): Promise<RecoveryCommandResult> {
    const callable = httpsCallable<{ command: RecoveryCommand }, RecoveryCommandResult>(this.functions, "r3ExecuteRecoveryCommand");
    return (await callable({ command })).data;
  }
}
