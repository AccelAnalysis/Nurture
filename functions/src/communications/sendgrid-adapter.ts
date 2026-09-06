import { createHash } from "node:crypto";
import {
  integrationFailure,
  integrationSuccess,
  type EmailIntegrationPort,
  type EmailSendRequest,
  type IntegrationMeta,
  type IntegrationRequestContext,
} from "../../../shared/platform/integrations.js";
import {
  communicationTemplateIds,
  communicationVariableKeys,
  type CommunicationTemplateId,
  type CommunicationVariableKey,
  type CommunicationVariableValues,
} from "../../../shared/communications/contracts.js";
import { renderEmailTemplate } from "../../../shared/communications/render.js";
import { getCommunicationTrustedOrigins, sendGridApiKey } from "./config.js";
import { getOrganizationEmailReplyTo } from "./email-branding.js";
import { getEmailSenderReadiness, getPublishedCommunicationTemplate } from "./store.js";

const templateIdSet = new Set<string>(communicationTemplateIds);
const variableKeySet = new Set<string>(communicationVariableKeys);

export function communicationTemplateReference(templateId: CommunicationTemplateId, version: number) {
  return `${templateId}@${version}`;
}

export function parseCommunicationTemplateReference(value: string) {
  const split = value.lastIndexOf("@");
  if (split < 1) throw new Error("A published Nurture template version is required.");
  const templateId = value.slice(0, split);
  const version = Number(value.slice(split + 1));
  if (!templateIdSet.has(templateId) || !Number.isInteger(version) || version < 1) throw new Error("Communication template reference is invalid.");
  return { templateId: templateId as CommunicationTemplateId, version };
}

function typedVariables(input: Record<string, string> | undefined): CommunicationVariableValues {
  const result: CommunicationVariableValues = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!variableKeySet.has(key)) throw new Error(`Unapproved communication variable: ${key}`);
    result[key as CommunicationVariableKey] = value;
  }
  return result;
}

function meta(context: IntegrationRequestContext, providerRequestId?: string): IntegrationMeta {
  return { integration: "email", provider: "sendgrid", correlationId: context.correlationId, providerRequestId, attempts: 1 };
}

function correlationToken(context: IntegrationRequestContext) {
  return createHash("sha256").update(context.idempotencyKey ?? context.correlationId).digest("hex");
}

export class SendGridEmailAdapter implements EmailIntegrationPort {
  async send(request: EmailSendRequest, context: IntegrationRequestContext) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (request.organizationId !== context.organizationId) {
        return integrationFailure({ code: "unauthorized", message: "Email request organization does not match trusted context.", retryable: false }, meta(context));
      }
      if (!request.templateId) {
        return integrationFailure({ code: "invalid-request", message: "Nurture email delivery requires a versioned template reference.", retryable: false }, meta(context));
      }
      if (request.subject) {
        return integrationFailure({ code: "invalid-request", message: "Feature code cannot bypass the Nurture renderer with an arbitrary subject.", retryable: false }, meta(context));
      }
      const reference = parseCommunicationTemplateReference(request.templateId);
      const [template, sender, replyTo] = await Promise.all([
        getPublishedCommunicationTemplate(request.organizationId, reference.templateId, reference.version),
        getEmailSenderReadiness(request.organizationId),
        getOrganizationEmailReplyTo(request.organizationId),
      ]);
      if (!template) return integrationFailure({ code: "not-found", message: "Published communication template version was not found.", retryable: false }, meta(context));
      if (template.purpose !== request.purpose) return integrationFailure({ code: "invalid-request", message: "Requested email purpose does not match the published template.", retryable: false }, meta(context));
      if (sender.status !== "ready" || !sender.fromAddress || !sender.fromName) {
        return integrationFailure({ code: "not-configured", message: sender.reason ?? "Organization email sender is not ready.", retryable: false }, meta(context));
      }
      const rendered = renderEmailTemplate({
        content: template.content,
        variables: typedVariables(request.variables),
        trustedOrigins: getCommunicationTrustedOrigins(),
        mode: "live",
      });
      const key = sendGridApiKey.value();
      if (!key.startsWith("SG.")) return integrationFailure({ code: "not-configured", message: "SendGrid API credentials are not configured.", retryable: false }, meta(context));

      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), Math.max(1_000, context.timeoutMs ?? 10_000));
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: request.to }],
            custom_args: { nurture_correlation: correlationToken(context) },
          }],
          from: { email: sender.fromAddress, name: sender.fromName },
          ...(replyTo ? { reply_to: { email: replyTo } } : {}),
          subject: rendered.subject,
          content: [
            { type: "text/plain", value: rendered.text },
            { type: "text/html", value: rendered.html },
          ],
        }),
      });
      clearTimeout(timeout);
      timeout = undefined;
      const providerRequestId = response.headers.get("x-message-id") ?? undefined;
      const responseMeta = meta(context, providerRequestId);
      if (response.status === 202) {
        return integrationSuccess({ messageId: providerRequestId ?? `accepted:${context.correlationId}`, acceptedAt: new Date().toISOString() }, responseMeta);
      }
      if (response.status === 429) {
        const retryAfterSeconds = Number(response.headers.get("retry-after"));
        return integrationFailure({
          code: "rate-limited",
          message: "SendGrid rate limited the request before acceptance.",
          retryable: true,
          providerCode: String(response.status),
          ...(Number.isFinite(retryAfterSeconds) ? { retryAfterMs: retryAfterSeconds * 1_000 } : {}),
        }, responseMeta);
      }
      if (response.status >= 500) {
        return integrationFailure({ code: "unavailable", message: "SendGrid returned a server error before Nurture observed acceptance.", retryable: true, providerCode: String(response.status) }, responseMeta);
      }
      return integrationFailure({ code: "provider-rejected", message: "SendGrid rejected the email request.", retryable: false, providerCode: String(response.status) }, responseMeta);
    } catch (error) {
      if (timeout) clearTimeout(timeout);
      const aborted = error instanceof Error && error.name === "AbortError";
      return integrationFailure({
        code: aborted ? "timeout" : "unavailable",
        message: aborted ? "SendGrid submission timed out with an unknown provider outcome." : "SendGrid submission failed with an unknown provider outcome.",
        retryable: false,
        safeDetails: { outcome: "unknown" },
      }, meta(context));
    }
  }

  async health() {
    const key = sendGridApiKey.value();
    return {
      integration: "email" as const,
      provider: "sendgrid",
      status: key.startsWith("SG.") ? "ready" as const : "not-configured" as const,
      checkedAt: new Date().toISOString(),
      message: key.startsWith("SG.") ? "SendGrid server credentials are configured; organization sender readiness is evaluated separately." : "SENDGRID_API_KEY is not configured.",
    };
  }
}

export function getSendGridEmailAdapter() {
  return new SendGridEmailAdapter();
}
