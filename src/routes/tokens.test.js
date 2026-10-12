import assert from "node:assert/strict";
import test from "node:test";
import { handleProfile, handleShortToken, handleTokenExchange } from "./tokens.js";
import { ADMIN_SESSION_KEY_PREFIX, USERS_KEY, createStructuredAdminSessionValue } from "../services/login-foundation.js";

const shortCredential = crypto.randomUUID();
const longCredential = crypto.randomUUID();
function fixture() {
  const values = new Map([
    [ADMIN_SESSION_KEY_PREFIX + "test-session", "valid"],
    ["threads_short_lived_token", { access_token: shortCredential, user_id: "threads-user", sessionId: "test-session" }],
    ["threads_auth", { access_token: longCredential, user_id: "threads-user" }],
  ]);
  const reads = [], writes = [];
  const env = { THREADS_APP_SECRET: crypto.randomUUID(), THREADS_KV: {
    async get(key, type) {
      reads.push(key);
      const value = values.get(key);
      return value === undefined ? null : type === "json" ? structuredClone(value) : typeof value === "string" ? value : JSON.stringify(value);
    },
    async put(key, value) { writes.push(key); values.set(key, JSON.parse(value)); },
    async delete() { assert.fail("Unexpected deletion"); },
  } };
  return { env, values, reads, writes };
}
function request({ method = "POST", origin = "https://example.test", cookie = "admin_session=test-session", site } = {}) {
  const headers = { cookie };
  if (origin !== null) headers.origin = origin;
  if (site !== undefined) headers["sec-fetch-site"] = site;
  return new Request("https://example.test/tokens/action", { method, headers });
}
function noSensitiveEffects(f) {
  assert.equal(f.reads.includes("threads_short_lived_token"), false);
  assert.equal(f.reads.includes("threads_auth"), false);
  assert.deepEqual(f.writes, []);
}

test("token mutation methods and origins are denied before credentials or provider calls", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { assert.fail("Unexpected provider call"); });
  for (const handler of [handleTokenExchange, handleProfile]) {
    for (const [options, status] of [
      [{ method: "GET" }, 405], [{ method: "HEAD" }, 405], [{ method: "DELETE" }, 405],
      [{ origin: null }, 403], [{ origin: "null" }, 403], [{ origin: "https://evil.test" }, 403],
      [{ site: "same-site" }, 403], [{ site: "cross-site" }, 403],
    ]) {
      const f = fixture();
      assert.equal((await handler(request(options), f.env)).status, status);
      noSensitiveEffects(f);
    }
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("token routes reject absent and personal sessions before reading operational credentials", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { assert.fail("Unexpected provider call"); });
  for (const handler of [handleShortToken, handleTokenExchange, handleProfile]) {
    const absent = fixture();
    assert.equal((await handler(request({ cookie: "" }), absent.env)).status, 401);
    noSensitiveEffects(absent);
    const personal = fixture();
    personal.values.set(ADMIN_SESSION_KEY_PREFIX + "test-session", createStructuredAdminSessionValue("user-a", null, { now: Date.now(), ttlSeconds: 3600 }));
    personal.values.set(USERS_KEY, { version: 1, users: [{ id: "user-a", loginId: "person", displayName: "Person", active: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }] });
    assert.equal((await handler(request(), personal.env)).status, 409);
    noSensitiveEffects(personal);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("short token status reveals only receipt metadata to the matching session", async () => {
  const f = fixture();
  const response = await handleShortToken(request({ method: "GET" }), f.env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true, token_received: true });
  assert.deepEqual(f.writes, []);
});

test("short token ownership mismatch and old unbound tokens cannot be read or exchanged", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { assert.fail("Unexpected provider call"); });
  for (const sessionId of [undefined, "different-session"]) {
    const f = fixture();
    f.values.get("threads_short_lived_token").sessionId = sessionId;
    assert.equal((await handleShortToken(request(), f.env)).status, 404);
    assert.equal((await handleTokenExchange(request(), f.env)).status, 400);
    assert.deepEqual(f.writes, []);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("valid legacy same-origin exchange saves provider token without returning credentials", async t => {
  const f = fixture();
  const fetchMock = t.mock.method(globalThis, "fetch", async input => {
    const url = new URL(input);
    assert.equal(url.origin, "https://graph.threads.net");
    assert.equal(url.pathname, "/access_token");
    assert.equal(url.searchParams.get("access_token"), shortCredential);
    assert.equal(url.searchParams.get("client_secret"), f.env.THREADS_APP_SECRET);
    return Response.json({ access_token: longCredential, token_type: "bearer", expires_in: 3600 });
  });
  const response = await handleTokenExchange(request(), f.env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, long_lived_token_saved: true, user_id: "threads-user", expires_in: 3600 });
  assert.equal(f.values.get("threads_auth").access_token, longCredential);
  assert.equal(f.values.get("threads_auth").user_id, "threads-user");
  assert.deepEqual(f.writes, ["threads_auth"]);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("valid legacy same-origin profile request updates saved identity", async t => {
  const f = fixture();
  t.mock.method(globalThis, "fetch", async input => {
    const url = new URL(input);
    assert.equal(url.searchParams.get("access_token"), longCredential);
    assert.equal(url.pathname.endsWith("/me"), true);
    return Response.json({ id: "verified-user", username: "verified-name" });
  });
  const response = await handleProfile(request(), f.env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, profile: { id: "verified-user", username: "verified-name" } });
  assert.equal(f.values.get("threads_auth").user_id, "verified-user");
  assert.equal(f.values.get("threads_auth").access_token, longCredential);
  assert.deepEqual(f.writes, ["threads_auth"]);
});

test("provider error responses do not leak raw details or persist credentials", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: { message: shortCredential, details: longCredential } }, { status: 400 }));
  for (const handler of [handleTokenExchange, handleProfile]) {
    const f = fixture();
    const response = await handler(request(), f.env);
    assert.equal(response.status, 400);
    const body = await response.text();
    assert.equal(body.includes(shortCredential), false);
    assert.equal(body.includes(longCredential), false);
    assert.deepEqual(f.writes, []);
  }
});
