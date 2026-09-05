export { customerFoundationClient, createCommandId, createLeadLinkProof } from "./client";
export { LeadCaptureForm, type LeadCaptureFormProps } from "./LeadCaptureForm";
export { ensureScopedCustomer } from "./linkCustomer";
export { clearPendingLeadLink, loadPendingLeadLink, savePendingLeadLink, type PendingLeadLink } from "./leadLinkProofStore";
