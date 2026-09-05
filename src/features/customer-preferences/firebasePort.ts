import { httpsCallable, type Functions } from "firebase/functions";
import type { CommunicationChannel, CommunicationPurpose } from "../../../shared/customer/contracts";
import type { CustomerControlPort, CustomerControlSnapshot, LifecycleCustomerPreferences } from "../../../shared/release3/customer-control";

export class FirebaseCustomerLifecycleControlPort implements CustomerControlPort {
  constructor(private readonly functions: Functions, private readonly dataMode: "live" | "test" | "development" = "live") {}

  async load(organizationId: string, customerId: string): Promise<CustomerControlSnapshot> {
    const callable = httpsCallable<{ organizationId: string; customerId: string; dataMode: string }, CustomerControlSnapshot>(this.functions, "r3GetCustomerLifecycleControl");
    return (await callable({ organizationId, customerId, dataMode: this.dataMode })).data;
  }

  async savePreferences(input: Pick<LifecycleCustomerPreferences, "organizationId" | "customerId" | "timezone" | "quietHours"> & { idempotencyKey: string }): Promise<LifecycleCustomerPreferences> {
    const callable = httpsCallable<typeof input & { dataMode: string }, LifecycleCustomerPreferences>(this.functions, "r3SetCustomerLifecyclePreferences");
    return (await callable({ ...input, dataMode: this.dataMode })).data;
  }

  async setConsent(input: { organizationId: string; customerId: string; channel: CommunicationChannel; purpose: CommunicationPurpose; decision: "granted" | "denied" | "withdrawn"; policyVersion: string; idempotencyKey: string }): Promise<void> {
    const callable = httpsCallable<typeof input & { dataMode: string; source: string }, unknown>(this.functions, "r2SetCustomerConsent");
    await callable({ ...input, dataMode: this.dataMode, source: "release3-customer-preferences" });
  }

  async requestCancellation(input: { organizationId: string; customerId: string; idempotencyKey: string }): Promise<{ requestId: string; status: "requested" }> {
    const callable = httpsCallable<typeof input & { dataMode: string }, { requestId: string; status: "requested" }>(this.functions, "r3RequestCancellation");
    return (await callable({ ...input, dataMode: this.dataMode })).data;
  }

  async loadSubscriptionManagementHandoff(input: { organizationId: string; customerId: string; returnPath: string }): Promise<{ href: string }> {
    const callable = httpsCallable<{ organizationId: string }, { url?: string; href?: string }>(this.functions, "createBillingPortalSession");
    const result = (await callable({ organizationId: input.organizationId })).data;
    const href = result.url ?? result.href;
    if (!href || !/^https:\/\//.test(href)) throw new Error("Secure subscription management is unavailable.");
    return { href };
  }
}
