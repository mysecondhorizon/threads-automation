import assert from "node:assert/strict";
import test from "node:test";
import { requirePlatformOperatorSession } from "./platform-operator-auth.js";
import { requireAdminSession } from "./auth.js";
import { createStructuredAdminSessionValue, USERS_KEY, ADMIN_SESSION_KEY_PREFIX } from "../services/login-foundation.js";
import { PLATFORM_OPERATOR_GRANTS_KEY } from "../services/platform-operators.js";

const request = (cookie = "admin_session=test-session") => new Request("https://example.test/operator", { headers: { cookie } });
const user = { id: "user-a", loginId: "owner", displayName: "Owner", active: true,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
function fixture() {
  const values = new Map([
    [USERS_KEY, { version: 1, users: [structuredClone(user)] }],
    [PLATFORM_OPERATOR_GRANTS_KEY, { version: 1, grants: [{ userId: user.id, active: true }] }],
    [ADMIN_SESSION_KEY_PREFIX + "test-session", createStructuredAdminSessionValue(user.id, null, { now: Date.now(), ttlSeconds: 3600 })],
  ]);
  const reads = [];
  const env = { THREADS_KV: {
    async get(key, type) { reads.push(key); const value = values.get(key); return value === undefined ? null : type === "json" ? structuredClone(value) : typeof value === "string" ? value : JSON.stringify(value); },
    async put() { assert.fail("No writes allowed"); }, async delete() { assert.fail("No deletes allowed"); },
  } };
  return { values, reads, env };
}
async function denied(env, status, req = request()) {
  const result = await requirePlatformOperatorSession(req, env);
  assert.equal(result.ok, false);
  assert.equal(result.response.status, status);
  assert.equal(result.response.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(await result.response.text(), /user-a|private|test-session|workspace|grant/);
}

test("active structured-session user with explicit grant yields only immutable operator identity", async () => {
  const { env } = fixture();
  const result = await requirePlatformOperatorSession(request(), env);
  assert.deepEqual(result, { ok: true, operator: { userId: "user-a" } });
  assert.throws(() => { result.operator.userId = "other"; }, TypeError);
});

test("ordinary login and workspace selection never imply operator authority", async () => {
  const { env, values } = fixture();
  values.delete(PLATFORM_OPERATOR_GRANTS_KEY);
  assert.equal((await requireAdminSession(request(), env)).ok, true);
  await denied(env, 403);
  values.get(ADMIN_SESSION_KEY_PREFIX + "test-session").selectedWorkspaceId = "default-workspace";
  values.get(USERS_KEY).users[0].role = "operator";
  await denied(env, 403, request("admin_session=test-session; role=operator; isAdmin=true"));
});

test("legacy admin compatibility preserved without inheriting new operator access", async () => {
  const { env, values } = fixture();
  values.set(ADMIN_SESSION_KEY_PREFIX + "test-session", "valid");
  assert.equal((await requireAdminSession(request(), env)).ok, true);
  await denied(env, 403);
});

test("missing, expired, forged or inactive user sessions are denied", async () => {
  for (const modify of [f => f.values.delete(ADMIN_SESSION_KEY_PREFIX + "test-session"),
    f => { f.values.get(ADMIN_SESSION_KEY_PREFIX + "test-session").expiresAt = "2000-01-01T00:00:00.000Z"; },
    f => { f.values.get(ADMIN_SESSION_KEY_PREFIX + "test-session").role = "operator"; },
    f => { f.values.get(USERS_KEY).users[0].active = false; },
    f => { f.values.get(USERS_KEY).users = []; }]) {
    const f = fixture(); modify(f); await denied(f.env, 401);
  }
  await denied(fixture().env, 401, request("admin_session=forged"));
});

test("ambiguous user records and malformed grant stores cannot elevate", async () => {
  const f = fixture();
  f.values.get(USERS_KEY).users.push({ id: " user-a ", active: false });
  await denied(f.env, 403);
  const g = fixture();
  g.values.get(PLATFORM_OPERATOR_GRANTS_KEY).grants.push({ userId: "user-a", active: false });
  await denied(g.env, 403);
});

test("each request rechecks grants and user activity without an authorization cache", async () => {
  const f = fixture();
  assert.equal((await requirePlatformOperatorSession(request(), f.env)).ok, true);
  f.values.get(PLATFORM_OPERATOR_GRANTS_KEY).grants[0].active = false;
  await denied(f.env, 403);
  f.values.get(PLATFORM_OPERATOR_GRANTS_KEY).grants[0].active = true;
  f.values.get(USERS_KEY).users[0].active = false;
  await denied(f.env, 401);
  assert.equal(f.reads.filter(k => k === PLATFORM_OPERATOR_GRANTS_KEY).length, 2);
});

test("session/user/grant storage errors produce generic unavailable, never success", async () => {
  for (const target of [ADMIN_SESSION_KEY_PREFIX + "test-session", USERS_KEY, PLATFORM_OPERATOR_GRANTS_KEY]) {
    const f = fixture(), original = f.env.THREADS_KV.get;
    f.env.THREADS_KV.get = async (key, type) => { if (key === target) throw new Error("private credential detail"); return original(key, type); };
    await denied(f.env, 503);
  }
});
