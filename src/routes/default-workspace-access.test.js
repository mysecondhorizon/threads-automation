import assert from "node:assert/strict";
import test from "node:test";
import { requireAdminApiSession, requireLegacyAdminSession } from "../middleware/auth.js";
import { resolveCurrentAppContext, selectCurrentWorkspace } from "../services/app-context.js";
import { createPasswordAuthRecord } from "../services/login-foundation.js";
import { handleAppLogin } from "./app-auth.js";
import { handleAppHome } from "./app-shell.js";
import { handleAppPromptsPage } from "./app-prompts-page.js";
import { handleAppProductsPage } from "./app-products-page.js";
import { handleAppDailyPage } from "./app-media-page.js";
import { handleAppSchedulesPage } from "./app-schedules-page.js";
import { handleAppActivityPage } from "./app-activity-page.js";
import { handleOperatorPrompts } from "./api-prompts.js";
import { handlePostPublish } from "./api-posts.js";

const timestamp = "2026-01-01T00:00:00.000Z";
function fixture(selectedWorkspaceId = "default-workspace") {
  const user = { id: "personal-owner", loginId: "owner", displayName: "Owner", active: true, createdAt: timestamp, updatedAt: timestamp };
  const data = new Map([
    ["operator_users:v1", JSON.stringify({ version: 1, users: [user] })],
    ["operator_workspaces:v1", JSON.stringify({ version: 1, workspaces: [] })],
    ["admin_session:test", JSON.stringify({ version: 1, userId: user.id, selectedWorkspaceId, createdAt: timestamp, expiresAt: "2099-01-01T00:00:00.000Z" })],
    ["admin_session:legacy", "valid"],
  ]);
  const reads = [], writes = [];
  const env = { LEGACY_WORKSPACE_OWNER_USER_ID: user.id, THREADS_KV: {
    async get(key, type) { reads.push(key); const v = data.get(key) ?? null; return type === "json" && v !== null ? JSON.parse(v) : v; },
    async put(key, value) { writes.push(key); data.set(key, value); },
  } };
  return { env, data, reads, writes, user };
}
const request = (path = "/app", method = "GET", body) => new Request("https://example.test" + path, { method, headers: { cookie: "admin_session=test" }, body });

test("assigned default owner resolves context, app pages and workspace API without reading credentials", async () => {
  const { env, reads, writes, data } = fixture();
  data.set("operator_prompt_profile:v1", JSON.stringify({ version: 1, updatedAt: timestamp, profile: { generalWritingPolicy: "EXISTING_DEFAULT_POLICY" } }));
  assert.equal((await resolveCurrentAppContext(request(), env)).currentWorkspace.id, "default-workspace");
  const auth = await requireAdminApiSession(request("/api/prompts"), env, { allowSelectedWorkspace: true });
  assert.equal(auth.ok, true);
  assert.equal(auth.workspaceId, "default-workspace");
  for (const handler of [handleAppPromptsPage, handleAppProductsPage, handleAppDailyPage, handleAppSchedulesPage, handleAppActivityPage]) {
    assert.equal((await handler(request(), env)).status, 200);
  }
  const home = await (await handleAppHome(request(), env)).text();
  assert.match(home, /Default Workspace/u);
  assert.doesNotMatch(home, /Connect Threads account/u);
  const prompts = await handleOperatorPrompts(request("/api/prompts"), env);
  assert.equal(prompts.status, 200);
  assert.equal((await prompts.json()).prompts.generalWritingPolicy, "EXISTING_DEFAULT_POLICY");
  assert.equal(reads.includes("threads_auth"), false);
  assert.deepEqual(writes, []);
});

test("assigned owner prompt edits address the existing key and leave other workspace data intact", async () => {
  const { env, data, writes } = fixture();
  const otherKey = "operator_prompt_profile:v1:other-workspace";
  data.set(otherKey, "unrelated-workspace-sentinel");
  const response = await handleOperatorPrompts(request("/api/prompts", "PATCH", JSON.stringify({ generalWritingPolicy: "SYNTHETIC_UPDATED_POLICY" })), env);
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(data.get("operator_prompt_profile:v1")).profile.generalWritingPolicy, "SYNTHETIC_UPDATED_POLICY");
  assert.equal(data.get(otherKey), "unrelated-workspace-sentinel");
  assert.deepEqual(writes, ["operator_prompt_profile:v1"]);
});

test("binding removal denies existing selected sessions, pages, reads and publishing before side effects", async () => {
  const { env, writes, data } = fixture();
  data.set("platform_operator_grants:v1", JSON.stringify({ version: 1, grants: [{ userId: "personal-owner", active: true }] }));
  delete env.LEGACY_WORKSPACE_OWNER_USER_ID;
  assert.equal((await resolveCurrentAppContext(request(), env)).currentWorkspace, null);
  for (const handler of [handleAppPromptsPage, handleAppProductsPage, handleAppDailyPage, handleAppSchedulesPage, handleAppActivityPage]) {
    assert.equal((await handler(request(), env)).status, 409);
  }
  assert.equal((await handleOperatorPrompts(request("/api/prompts"), env)).status, 409);
  let called = false;
  const response = await handlePostPublish(request("/api/posts/example/publish", "POST"), env, "example", { publish: async () => { called = true; throw Error("must not publish"); } });
  assert.equal(response.status, 409);
  assert.equal(called, false);
  assert.deepEqual(writes, []);
});

test("assigned owner retains personal identity and cannot access global legacy maintenance", async () => {
  const { env } = fixture();
  assert.equal((await requireAdminApiSession(request("/admin/token"), env)).ok, false);
  assert.equal((await requireLegacyAdminSession(request("/connect"), env)).response.status, 403);
  assert.equal((await resolveCurrentAppContext(request(), env)).legacy, false);
  const legacy = new Request("https://example.test/admin", { headers: { cookie: "admin_session=legacy" } });
  assert.equal((await requireLegacyAdminSession(legacy, env)).ok, true);
});

test("old null session offers the single-workspace selector and can explicitly select default", async () => {
  const { env, writes } = fixture(null);
  assert.equal((await requireAdminApiSession(request(), env, { allowSelectedWorkspace: true })).ok, false);
  assert.match(await (await handleAppHome(request(), env)).text(), /action="\/app\/workspace"/u);
  await selectCurrentWorkspace(request(), env, "default-workspace");
  assert.equal((await resolveCurrentAppContext(request(), env)).currentWorkspace.id, "default-workspace");
  assert.deepEqual(writes, ["admin_session:test"]);
});

test("fresh personal login automatically selects its sole assigned default workspace", async () => {
  const { env, data } = fixture();
  data.set("operator_user_auth:personal-owner", JSON.stringify(await createPasswordAuthRecord("synthetic-test-password")));
  const response = await handleAppLogin(new Request("https://example.test/app/login", { method: "POST", body: new URLSearchParams({ login_id: "owner", password: "synthetic-test-password" }) }), env);
  assert.equal(response.status, 302);
  const sessionId = response.headers.get("set-cookie").match(/admin_session=([^;]+)/u)[1];
  const session = JSON.parse(data.get("admin_session:" + sessionId));
  assert.equal(session.userId, "personal-owner");
  assert.equal(session.selectedWorkspaceId, "default-workspace");
});
