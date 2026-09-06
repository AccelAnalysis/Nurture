import { db } from "../firebase.js";

export async function getOrganizationEmailReplyTo(organizationId: string) {
  const snapshot = await db.collection("organizations").doc(organizationId).collection("communicationSettings").doc("emailSender").get();
  if (!snapshot.exists) return undefined;
  const data = snapshot.data() ?? {};
  const replyTo = typeof data.replyTo === "string" ? data.replyTo.trim().toLowerCase() : "";
  return replyTo && /^[^\s@]+@[^\s@]+$/.test(replyTo) ? replyTo : undefined;
}
