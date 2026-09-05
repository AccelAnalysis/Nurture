import { functions } from "../../firebase";
import { FirebaseCustomerWorkspacePort } from "../../features/customer-workspace/firebasePort";
import { installAuthoritativeCustomerWorkspacePort } from "../../features/customer-workspace/port";
import { FirebaseLifecycleAutomationPort } from "../../features/lifecycle-admin/firebasePort";
import { installAuthoritativeLifecycleAutomationPort } from "../../features/lifecycle-admin/port";

let installed = false;

/**
 * Release 2 UI composition is independent from the broader Release 1 commercial
 * readiness flag. The callables themselves enforce identity, membership and
 * organization capability server-side and fail closed when backend deployment is
 * unavailable.
 */
export function installRelease2BackendPorts() {
  if (installed || !functions) return;
  installAuthoritativeCustomerWorkspacePort(new FirebaseCustomerWorkspacePort(functions));
  installAuthoritativeLifecycleAutomationPort(new FirebaseLifecycleAutomationPort(functions));
  installed = true;
}
