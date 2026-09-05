import assert from "node:assert/strict";
import { handleAppActivityPage } from "./app-activity-page.js";
import { ADMIN_SESSION_KEY_PREFIX, USERS_KEY, WORKSPACES_KEY } from "../services/login-foundation.js";

const env = { THREADS_KV: { async get(key) { return key === "admin_session:session-1" ? "valid" : null; } } };
const response = await handleAppActivityPage(new Request("https://example.test/app/activity", { headers:{ cookie:"admin_session=session-1" } }), env);
const page = await response.text();
assert.equal(response.status, 200);
assert.match(page, /운영 활동/u);
assert.equal(page.includes("/api/activity?limit=30"), true);
assert.match(page, /id="activity-refresh"/u);
assert.match(page, /id="activity-status" class="app-activity-status" role="status" aria-live="polite"/u);
assert.match(page, /id="activity-list" class="app-activity-list"/u);
assert.match(page, /id="general-auto-summary"/u);
assert.match(page, /renderGeneralAutoSummary\(data\.generalAutoSummary\)/u);
assert.match(page, /최근 General AUTO .*회|General AUTO.*totalExecutions/u);
assert.match(page, /TEXT .*IMAGE .*VIDEO|videoCount/u);
assert.match(page, /IMAGE 사용률.*VIDEO 사용률|imageUsagePercent.*videoUsagePercent/u);
assert.match(page, /GENERAL_AUTO:'General AUTO'/u);
assert.match(page, /General AUTO 상세 진단/u);
assert.match(page, /Current Topic|생성 기반|미디어 기반|시도 횟수|Semantic similarity 점수|일치 게시물/u);
assert.match(page, /contentBasis\[activity\.contentBasis\]|mediaBasis\[activity\.mediaBasis\]/u);
assert.match(page, /PERSONA:'Persona'|CURRENT_TOPIC:'Current Topic'|NONE:'없음'|DAILY_IMAGE:'Daily Image'/u);
assert.match(page, /document\.createElement\('details'\)/u);
assert.match(page, /textContent=/u);
assert.doesNotMatch(page, /innerHTML|JSON\.stringify/u);
assert.match(page, /data\.partial/u);
assert.match(page, /아직 표시할 운영 활동이 없습니다/u);
assert.equal((await handleAppActivityPage(new Request("https://example.test/app/activity"), env)).status, 302);

const scopedValues = new Map([
  [USERS_KEY, JSON.stringify({ version:1, users:[{ id:"user-next", loginId:"next", displayName:"Next", active:true, createdAt:"2026-01-01", updatedAt:"2026-01-01" }] })],
  [WORKSPACES_KEY, JSON.stringify({ version:1, workspaces:[{ id:"workspace-next", ownerUserId:"user-next", name:"Next", active:true, createdAt:"2026-01-01", updatedAt:"2026-01-01" }] })],
  [`${ADMIN_SESSION_KEY_PREFIX}registered`, JSON.stringify({ version:1, userId:"user-next", selectedWorkspaceId:"workspace-next", createdAt:"2026-01-01", expiresAt:"2099-01-01" })],
]);
const scopedEnv = { THREADS_KV: { async get(key, type) { const value = scopedValues.get(key) ?? null; return type === "json" && value !== null ? JSON.parse(value) : value; } } };
assert.equal((await handleAppActivityPage(
  new Request("https://example.test/app/activity", { headers:{ cookie:"admin_session=registered" } }),
  scopedEnv,
)).status, 200);
console.log("app activity page fixture passed");
