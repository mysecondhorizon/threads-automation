import assert from "node:assert/strict";
import test from "node:test";
import { AiServiceError, generateThreadsDrafts } from "./ai.js";

const draft = { style: "plain", text: "A synthetic everyday observation.", firstComment: "", contentType: "작은 발견형",
  topic: "everyday", emotion: "calm", hookStyle: "observation", endingStyle: "open", questionUsed: false,
  productId: null, productConnected: false, affiliateLinkUsed: false, affiliateDisclosureRequired: false };
const json = JSON.stringify({ drafts: [draft, draft, draft] });
const message = (text = json, changes = {}) => ({ type: "message", role: "assistant", status: "completed",
  content: [{ type: "output_text", text }], ...changes });
const envelope = (changes = {}) => ({ status: "completed", output: [message()], usage: { input_tokens: 123,
  output_tokens: 45, output_tokens_details: { reasoning_tokens: 10 } }, ...changes });
const args = { topic: "offline fixture", tone: "plain" };

async function invoke(data, { status = 200, raw = false, network = false, verify } = {}) {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/responses");
    verify?.(JSON.parse(options.body));
    if (network) throw new Error("private network body");
    return raw ? new Response(data, { status }) : Response.json(data, { status });
  };
  try { return await generateThreadsDrafts({ OPENAI_API_KEY: "offline-test-only", OPENAI_MODEL: "unchanged-model" }, args); }
  finally { globalThis.fetch = original; assert.equal(calls, 1, "No retry or live request"); }
}

async function rejects(data, category, options) {
  await assert.rejects(invoke(data, options), error => {
    assert.ok(error instanceof AiServiceError);
    assert.equal(error.details.category, category);
    assert.doesNotMatch(JSON.stringify(error), /private|offline-test-only|synthetic everyday|outputText|drafts/);
    assert.ok(JSON.stringify(error.details).length < 600);
    return true;
  });
}

test("completed legacy message and final_answer preserve drafts and request contract", async () => {
  const result = await invoke(envelope(), { verify(body) {
    assert.equal(body.model, "unchanged-model");
    assert.equal(body.store, false);
    assert.equal(body.reasoning.effort, "low");
    assert.equal(body.text.format.strict, true);
    assert.equal(body.text.format.schema.properties.drafts.minItems, 3);
    assert.equal(body.text.format.schema.properties.drafts.maxItems, 3);
  } });
  assert.equal(result.length, 3);
  assert.equal(result[0].text, draft.text);
  assert.deepEqual(await invoke(envelope({ output: [message(json, { phase: "final_answer" })] })), result);
});

test("commentary is not concatenated with the unambiguous final JSON", async () => {
  const result = await invoke(envelope({ output: [message("private commentary", { phase: "commentary" }), message(json, { phase: "final_answer" })] }));
  assert.equal(result.length, 3);
});

test("incomplete response never accepts even valid JSON; safe reason and usage retained", async () => {
  await assert.rejects(invoke(envelope({ status: "incomplete", incomplete_details: { reason: "max_output_tokens", private: "private" } })), error => {
    assert.equal(error.details.category, "incomplete_response");
    assert.equal(error.details.incompleteReason, "max_output_tokens");
    assert.equal(error.details.outputTokens, 45);
    assert.equal(error.details.reasoningTokens, 10);
    assert.doesNotMatch(JSON.stringify(error), /private|outputText/);
    return true;
  });
  await rejects(envelope({ status: "incomplete", incomplete_details: { reason: "private unknown reason" } }), "incomplete_response");
});

test("noncompleted, missing status and malformed output fail closed", async () => {
  for (const status of [undefined, "failed", "cancelled", "queued", "in_progress", "private"])
    await rejects(envelope({ status }), "response_not_completed");
  for (const data of [null, [], envelope({ output: null }), envelope({ error: { message: "private" } }), envelope({ incomplete_details: {} })])
    await rejects(data, "malformed_response");
});

test("incomplete messages and refusals cannot be hidden by a later valid final", async () => {
  await rejects(envelope({ output: [message(json, { status: "incomplete" }), message()] }), "incomplete_message");
  await rejects(envelope({ output: [message(json, { phase: "commentary", content: [{ type: "refusal", refusal: "private" }] }), message()] }), "refusal");
});

test("ambiguous messages and unexpected content shape are rejected", async () => {
  await rejects(envelope({ output: [message(), message()] }), "ambiguous_output");
  await rejects(envelope({ output: [] }), "missing_output");
  await rejects(envelope({ output: [message("private", { phase: "commentary" })] }), "missing_output");
  for (const change of [{ role: "user" }, { status: undefined }, { content: {} }, { phase: "private" },
    { content: [{ type: "output_text", text: json }, { type: "output_text", text: json }] }])
    await rejects(envelope({ output: [message(json, change)] }), "malformed_response");
});

test("one-draft truncated structure is never repaired or logged as raw text", async () => {
  const truncated = '{"drafts":[' + JSON.stringify(draft);
  await rejects(envelope({ output: [message(truncated)] }), "invalid_json");
  await rejects(envelope({ output: [message('```json\n' + json + '\n```')] }), "invalid_json");
});

test("JSON null, wrong draft counts and draft validation errors remain typed and private", async () => {
  for (const text of ["null", "[]", JSON.stringify({ drafts: [draft] })])
    await rejects(envelope({ output: [message(text)] }), "invalid_draft_list");
  await rejects(envelope({ output: [message(JSON.stringify({ drafts: [{ ...draft, style: "", secret: "private" }, draft, draft] }))] }), "invalid_draft");
});

test("network, non-JSON HTTP errors and malformed successful bodies have distinct categories", async () => {
  await rejects(null, "network", { network: true });
  await rejects("private provider HTML", "http", { status: 429, raw: true });
  await rejects("private provider HTML", "malformed_response", { raw: true });
});

test("diagnostic counts and provider metadata cannot leak untrusted fields", async () => {
  await assert.rejects(invoke(envelope({ status: "incomplete", model: "private", usage: { input_tokens: -1, output_tokens: "private",
    output_tokens_details: { reasoning_tokens: 1e12 } }, incomplete_details: { reason: "private" } })), error => {
    assert.equal(error.details.inputTokens, null);
    assert.equal(error.details.outputTokens, null);
    assert.equal(error.details.reasoningTokens, null);
    assert.equal(error.details.incompleteReason, null);
    assert.doesNotMatch(JSON.stringify(error), /private/);
    return true;
  });
});
