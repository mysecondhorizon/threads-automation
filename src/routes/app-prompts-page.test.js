import assert from "node:assert/strict";
import { handleAppPromptsPage } from "./app-prompts-page.js";

const fields = [
  "identityWriting",
  "generalWritingPolicy",
  "contentAndFormatPreferences",
  "productWritingGuidance",
  "analyticsWritingGuidance",
];
const env = { THREADS_KV: { async get(key) { return key === "admin_session:session-1" ? "valid" : null; } } };
const response = await handleAppPromptsPage(new Request("https://x/app/prompts", { headers:{ cookie:"admin_session=session-1" } }), env);
const page = await response.text();

assert.equal(response.status, 200);
for (const field of fields) {
  assert.match(page, new RegExp(`name="${field}"`, "u"));
  assert.match(page, new RegExp(`id="prompt-${field}"`, "u"));
  assert.match(page, new RegExp(`prompt-${field}-heading`, "u"));
}
assert.match(page, /직접 AI 글 작성, 자동 게시, 제품 후기 글 작성/u);
assert.match(page, /시스템 검증·안전·사실 제약과 출력 규칙은 보호됩니다/u);
assert.match(page, /class="app-prompts-callout"/u);
assert.match(page, /class="app-prompts-section"/u);
assert.match(page, /class="app-prompts-form"/u);
assert.match(page, /class="app-prompts-button primary"/u);
assert.match(page, /class="app-prompts-button reset"/u);
assert.match(page, /id="prompt-status" class="app-prompts-feedback" role="status" aria-live="polite"/u);
assert.match(page, /type="submit">저장</u);
assert.match(page, /id="prompt-reset" type="button">기본값 복원/u);
assert.match(page, /min-height:136px/u);
assert.doesNotMatch(page, /app-media-edit-form|app-media-button/u);
assert.doesNotMatch(page, /validation\.js|json_schema|operator_prompt_profile/u);

console.log("app prompts page fixture passed");
