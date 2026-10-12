import assert from "node:assert/strict";
import test from "node:test";
import { handleOperatorConsole } from "./operator-console.js";
import { USERS_KEY, createStructuredAdminSessionValue } from "../services/login-foundation.js";
import { PLATFORM_OPERATOR_GRANTS_KEY } from "../services/platform-operators.js";

function fixture(selection = null) {
  const values = new Map([
    ["admin_session:console-session", createStructuredAdminSessionValue("operator-a", selection, { now: Date.now(), ttlSeconds: 3600 })],
    [USERS_KEY, { version: 1, users: [{ id: "operator-a", loginId: "private-login", displayName: "Private Name", active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" }] }],
    [PLATFORM_OPERATOR_GRANTS_KEY, { version: 1, grants: [{ userId: "operator-a", active: true }] }],
  ]);
  const reads = [];
  const env = { THREADS_APP_SECRET: "secret-sentinel", THREADS_KV: {
    async get(key, type) {
      reads.push(key);
      assert.ok(["admin_session:console-session", USERS_KEY, PLATFORM_OPERATOR_GRANTS_KEY].includes(key), `Unexpected read ${key}`);
      const value = values.get(key);
      return value === undefined ? null : type === "json" ? structuredClone(value) : typeof value === "string" ? value : JSON.stringify(value);
    },
    async put() { assert.fail("No writes"); }, async delete() { assert.fail("No deletes"); }, async list() { assert.fail("No listing"); },
  } };
  return { env, values, reads };
}
const request = (method = "GET", cookie = "admin_session=console-session") => new Request("https://example.test/operator", { method, headers: { cookie } });
async function check(response, status) {
  assert.equal(response.status, status);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  const body = await response.text();
  assert.doesNotMatch(body, /console-session|private-login|Private Name|secret-sentinel|<script|<form/);
  return body;
}

test("operator console requires explicit grant and does not read workspace or operational stores", async t => {
  t.mock.method(globalThis, "fetch", () => assert.fail("No external calls"));
  for (const selection of [null, "owned-workspace"]) {
    const f = fixture(selection);
    const body = await check(await handleOperatorConsole(request(), f.env), 200);
    assert.match(body, /operator-a/);
    assert.match(body, /기존 자동 실행 유지/);
    assert.match(body, /최근 게시 성공 여부나 외부 서비스 연결 상태는 이 화면에서 확인하지 않습니다/);
    assert.deepEqual(f.reads, ["admin_session:console-session", USERS_KEY, USERS_KEY, PLATFORM_OPERATOR_GRANTS_KEY]);
  }
});

test("missing login provides personal login link without revealing identity or configuration", async () => {
  const f = fixture();
  const body = await check(await handleOperatorConsole(request("GET", ""), f.env), 401);
  assert.match(body, /href="\/app\/login"/);
  assert.doesNotMatch(body, /operator-a|기존 자동 실행 유지/);
  assert.deepEqual(f.reads, []);
});

test("ordinary and legacy sessions cannot enter the operator console", async () => {
  for (const legacy of [false, true]) {
    const f = fixture();
    if (legacy) f.values.set("admin_session:console-session", "valid");
    else f.values.delete(PLATFORM_OPERATOR_GRANTS_KEY);
    const body = await check(await handleOperatorConsole(request(), f.env), 403);
    assert.doesNotMatch(body, /operator-a|기존 자동 실행 유지/);
  }
});

test("every request rechecks revoked grant, user and session", async () => {
  for (const mode of ["grant", "user", "session"]) {
    const f = fixture();
    await check(await handleOperatorConsole(request(), f.env), 200);
    if (mode === "grant") f.values.get(PLATFORM_OPERATOR_GRANTS_KEY).grants[0].active = false;
    if (mode === "user") f.values.get(USERS_KEY).users[0].active = false;
    if (mode === "session") f.values.get("admin_session:console-session").expiresAt = "2026-02-01";
    const body = await check(await handleOperatorConsole(request(), f.env), mode === "grant" ? 403 : 401);
    assert.doesNotMatch(body, /operator-a/);
  }
});

test("storage failures return generic unavailable without details", async () => {
  const f = fixture();
  f.env.THREADS_KV.get = async () => { throw Error("secret-sentinel"); };
  await check(await handleOperatorConsole(request(), f.env), 503);
});

test("non-GET requests cannot read or mutate anything", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
    const f = fixture();
    const response = await handleOperatorConsole(request(method), f.env);
    assert.equal(response.headers.get("allow"), "GET");
    await check(response, 405);
    assert.deepEqual(f.reads, []);
  }
});
