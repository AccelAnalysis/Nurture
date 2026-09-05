import { onSchedule } from "firebase-functions/v2/scheduler";
import { sendGridApiKey } from "../communications/config.js";
import { acquisitionRuntime } from "./composition.js";

/**
 * Durable bounded worker. The runtime rechecks the platform/organization/
 * automation pause before provider admission; an absent platform control record
 * is intentionally interpreted as paused by the Firestore store.
 */
export const drainAcquisitionJobs = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "UTC",
    retryCount: 0,
    secrets: [sendGridApiKey],
  },
  async () => {
    await acquisitionRuntime.drain({
      workerId: `scheduler:${process.env.K_REVISION ?? "local"}`,
      limit: 100,
    });
  },
);
