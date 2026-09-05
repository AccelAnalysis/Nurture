import { createAcquisitionRuntime } from "../../../shared/acquisition/runtime.js";
import { createAcquisitionEmailDispatchAdapter } from "../communications/acquisition-dispatch.js";
import { currentCommunicationContextPort, acquisitionStatePort } from "./current-context.js";
import { acquisitionDefinitionPort } from "./definitions.js";
import { acquisitionRuntimeStore } from "./firestore-store.js";

/**
 * Release 2's authoritative runtime. Frequency admission and the provider
 * ambiguity barrier are atomic in AcquisitionRuntimeStore.markProviderSubmissionStarted,
 * so this composition does not add a second pre-provider reservation system.
 */
export const acquisitionRuntime = createAcquisitionRuntime({
  definitions: acquisitionDefinitionPort,
  store: acquisitionRuntimeStore,
  state: acquisitionStatePort,
  email: createAcquisitionEmailDispatchAdapter(currentCommunicationContextPort),
});
