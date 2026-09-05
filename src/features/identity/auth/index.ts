export { AuthProvider, useAuth } from "../../../context/AuthContext";
export { authService } from "../../../services/authService";
export { signInAccount } from "./accountService";
export type { CustomerProfile, CustomerProfileChanges, IdentitySession, LeadCaptureInput, LeadRecord } from "../model/contracts";
export { captureInitialLead, registerAccount } from "../registration";
export { customerScopeSource } from "../customer";
export type { CustomerScopeRequest, CustomerScopeResult, CustomerScopeSource } from "../customer";

// Feature owners should import authentication through this boundary rather than
// creating a second Firebase Auth client or coupling unrelated shells to the
// implementation location of AuthProvider.
