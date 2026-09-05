import assert from "node:assert/strict";
import test from "node:test";
import { FICTIONAL_PREVIEW_VARIABLES, listDefaultCommunicationTemplates } from "../../../shared/communications/defaults.js";
import { CommunicationTemplateError, renderEmailTemplate, validateEmailTemplateContent } from "../../../shared/communications/render.js";

for (const template of listDefaultCommunicationTemplates()) {
  test(`default template ${template.id} validates and previews with fictional data`, () => {
    assert.deepEqual(validateEmailTemplateContent(template.content), []);
    const rendered = renderEmailTemplate({ content: template.content, variables: FICTIONAL_PREVIEW_VARIABLES, trustedOrigins: [], mode: "preview" });
    assert.ok(rendered.subject.length > 0);
    assert.ok(rendered.text.length > 0);
    assert.ok(!rendered.html.includes("<script"));
  });
}

test("missing variables block rendering", () => {
  const template = listDefaultCommunicationTemplates()[0];
  assert.throws(() => renderEmailTemplate({ content: template.content, variables: {}, trustedOrigins: [], mode: "preview" }), CommunicationTemplateError);
});

test("live rendering blocks an untrusted link origin", () => {
  const content = {
    name: "Link test",
    subject: "Hello {{customer.firstName}}",
    body: "Continue at {{application.publicUrl}}",
    variables: ["customer.firstName", "application.publicUrl"] as const,
  };
  assert.throws(() => renderEmailTemplate({
    content: { ...content, variables: [...content.variables] },
    variables: { "customer.firstName": "Taylor", "application.publicUrl": "https://attacker.example/path" },
    trustedOrigins: ["https://nurture.accelanalysis.com"],
    mode: "live",
  }), /not trusted/);
});

test("generated HTML escapes variable content", () => {
  const content = {
    name: "Escape test",
    subject: "Hello {{customer.firstName}}",
    body: "Hello {{customer.displayName}}. Visit https://nurture.accelanalysis.com/app",
    variables: ["customer.firstName", "customer.displayName"] as ("customer.firstName" | "customer.displayName")[],
  };
  const rendered = renderEmailTemplate({
    content,
    variables: { "customer.firstName": "Taylor", "customer.displayName": "<script>alert(1)</script>" },
    trustedOrigins: ["https://nurture.accelanalysis.com"],
    mode: "live",
  });
  assert.ok(rendered.html.includes("&lt;script&gt;"));
  assert.ok(!rendered.html.includes("<script>"));
  assert.ok(rendered.html.includes("<a href=\"https://nurture.accelanalysis.com/app\""));
});
