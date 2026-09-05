import {
  communicationVariableKeys,
  type CommunicationExecutionMode,
  type CommunicationVariableKey,
  type CommunicationVariableValues,
  type EmailTemplateContent,
} from "./contracts.js";

const allowedVariableSet = new Set<string>(communicationVariableKeys);
const variablePattern = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;
const renderedUrlPattern = /https?:\/\/[^\s<>"']+/g;

export interface TemplateValidationIssue {
  field: "name" | "subject" | "body" | "variables";
  code: string;
  message: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
  links: string[];
}

export class CommunicationTemplateError extends Error {
  readonly issues: TemplateValidationIssue[];
  constructor(message: string, issues: TemplateValidationIssue[] = []) {
    super(message);
    this.name = "CommunicationTemplateError";
    this.issues = issues;
  }
}

export function extractTemplateVariables(content: Pick<EmailTemplateContent, "subject" | "body">): string[] {
  const found = new Set<string>();
  for (const value of [content.subject, content.body]) {
    variablePattern.lastIndex = 0;
    for (const match of value.matchAll(variablePattern)) found.add(match[1]);
  }
  return [...found];
}

export function validateEmailTemplateContent(content: EmailTemplateContent): TemplateValidationIssue[] {
  const issues: TemplateValidationIssue[] = [];
  const name = content.name.trim();
  const subject = content.subject.trim();
  if (!name || name.length > 80) issues.push({ field: "name", code: "invalid-length", message: "Template name must be 1–80 characters." });
  if (!subject || subject.length > 160) issues.push({ field: "subject", code: "invalid-length", message: "Subject must be 1–160 characters." });
  if (/[\r\n]/.test(content.subject)) issues.push({ field: "subject", code: "header-injection", message: "Subject cannot contain line breaks." });
  if (!content.body.trim() || content.body.length > 8_000) issues.push({ field: "body", code: "invalid-length", message: "Body must be 1–8,000 characters." });
  if (content.body.includes("\u0000")) issues.push({ field: "body", code: "invalid-character", message: "Body contains an unsupported character." });

  const declared = new Set<string>();
  if (content.variables.length > 13) issues.push({ field: "variables", code: "too-many", message: "At most 13 approved variables may be declared." });
  for (const variable of content.variables) {
    if (!allowedVariableSet.has(variable)) issues.push({ field: "variables", code: "not-allowlisted", message: `${variable} is not an approved variable.` });
    if (declared.has(variable)) issues.push({ field: "variables", code: "duplicate", message: `${variable} is declared more than once.` });
    declared.add(variable);
  }
  for (const used of extractTemplateVariables(content)) {
    if (!allowedVariableSet.has(used)) issues.push({ field: "variables", code: "not-allowlisted", message: `${used} is not an approved variable.` });
    else if (!declared.has(used)) issues.push({ field: "variables", code: "undeclared", message: `${used} must be explicitly declared by this template.` });
  }
  return issues;
}

function substitute(value: string, variables: CommunicationVariableValues) {
  variablePattern.lastIndex = 0;
  return value.replace(variablePattern, (_match, rawKey: string) => {
    const key = rawKey as CommunicationVariableKey;
    const replacement = variables[key];
    if (replacement === undefined || replacement === null || replacement.trim() === "") {
      throw new CommunicationTemplateError(`Missing required variable: ${rawKey}`);
    }
    return replacement;
  });
}

function cleanUrlToken(raw: string) {
  let value = raw;
  while (/[.,!?;:]$/.test(value)) value = value.slice(0, -1);
  return value;
}

export function validateRenderedLinks(text: string, trustedOrigins: readonly string[], mode: CommunicationExecutionMode): string[] {
  const allowed = new Set(trustedOrigins.map((origin) => new URL(origin).origin));
  const matches = text.match(renderedUrlPattern) ?? [];
  const links: string[] = [];
  for (const raw of matches) {
    const token = cleanUrlToken(raw);
    const parsed = new URL(token);
    if (parsed.protocol !== "https:") throw new CommunicationTemplateError(`Email link must use HTTPS: ${parsed.origin}`);
    const fictionalPreview = mode === "preview" && parsed.hostname.endsWith(".nurture.test");
    if (!fictionalPreview && !allowed.has(parsed.origin)) {
      throw new CommunicationTemplateError(`Email link origin is not trusted: ${parsed.origin}`);
    }
    links.push(parsed.toString());
  }
  return links;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function plainTextToHtml(text: string, validatedLinks: readonly string[]) {
  if (!validatedLinks.length) return `<div>${escapeHtml(text).replaceAll("\n", "<br>")}</div>`;
  const linkSet = new Set(validatedLinks);
  let cursor = 0;
  const pieces: string[] = [];
  renderedUrlPattern.lastIndex = 0;
  for (const match of text.matchAll(renderedUrlPattern)) {
    const index = match.index ?? 0;
    const raw = match[0];
    const clean = cleanUrlToken(raw);
    pieces.push(escapeHtml(text.slice(cursor, index)).replaceAll("\n", "<br>"));
    if (linkSet.has(new URL(clean).toString())) {
      const escaped = escapeHtml(clean);
      pieces.push(`<a href="${escaped}" rel="noopener noreferrer">${escaped}</a>`);
      pieces.push(escapeHtml(raw.slice(clean.length)));
    } else {
      pieces.push(escapeHtml(raw));
    }
    cursor = index + raw.length;
  }
  pieces.push(escapeHtml(text.slice(cursor)).replaceAll("\n", "<br>"));
  return `<div>${pieces.join("")}</div>`;
}

export function renderEmailTemplate(input: {
  content: EmailTemplateContent;
  variables: CommunicationVariableValues;
  trustedOrigins: readonly string[];
  mode: CommunicationExecutionMode;
}): RenderedEmail {
  const issues = validateEmailTemplateContent(input.content);
  if (issues.length) throw new CommunicationTemplateError("Template is invalid.", issues);
  const subject = substitute(input.content.subject, input.variables).trim();
  const text = substitute(input.content.body, input.variables);
  if (/[\r\n]/.test(subject)) throw new CommunicationTemplateError("Rendered subject cannot contain line breaks.");
  const links = validateRenderedLinks(text, input.trustedOrigins, input.mode);
  return { subject, text, html: plainTextToHtml(text, links), links };
}
