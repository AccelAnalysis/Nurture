/** Availability only. Every privileged request still requires trusted server authorization. */
export const releaseBackendReady = import.meta.env.VITE_RELEASE1_BACKEND_READY === "true";
/** Demo identities are only possible in the local Vite development build. */
export const localDemoEnabled = import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO === "true";
export const backendUnavailableMessage = "Account setup and purchases are not available yet. You can explore the public Experience while this application is being prepared.";
