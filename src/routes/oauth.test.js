import assert from "node:assert/strict";
import test from "node:test";

import {
  handleConnectPage,
  handleConnectedAccountOAuthStart,
  handleOAuthCallback,
  handleOAuthStart,
} from "./oauth.js";
import {
  ADMIN_SESSION_KEY_PREFIX,
  USERS_KEY,
  WORKSPACES_KEY,
} from "../services/login-foundation.js";
import { CONNECTED_ACCOUNTS_KEY } from "../services/connected-accounts.js";

const CREATED_AT = "2026-08-31T00:00:00.000Z";
const EXPIRES_AT = "2099-08-31T00:00:00.000Z";

async function assertLanding(response, destination) {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  const body = await response.text();
  assert.ok(body.includes(destination));
  assert.doesNotMatch(body, /<script|http-equiv|legacy-code|short-token|long-token|legacy-session/);
}

function createEnv({ selectedWorkspaceId = "workspace-next", failPut = null } = {}) {
  const values = new Map([
    [USERS_KEY, JSON.stringify({
      version: 1,
      users: [{
        id: "user-colleague",
        loginId: "colleague@example.test",
        displayName: "colleague@example.test",
        active: true,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      }],
    })],
    [WORKSPACES_KEY, JSON.stringify({
      version: 1,
      workspaces: [{
        id: "workspace-next",
        ownerUserId: "user-colleague",
        name: "Next Horizon",
        active: true,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      }],
    })],
    [`${ADMIN_SESSION_KEY_PREFIX}structured-session`, JSON.stringify({
      version: 1,
      userId: "user-colleague",
      selectedWorkspaceId,
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
    })],
    ["admin_session:legacy-session", "valid"],
  ]);
  const writes = [];
  return {
    values,
    writes,
    env: {
      THREADS_APP_ID: "app-id",
      THREADS_APP_SECRET: "app-secret",
      THREADS_KV: {
        async get(key, type) {
          const value = values.get(key);
          if (value === undefined) return null;
          return type === "json" ? JSON.parse(value) : value;
        },
        async put(key, value, options) {
          if (failPut?.(key, value)) throw new Error("write failed");
          writes.push({ key, value, options });
          values.set(key, value);
        },
        async delete(key) {
          values.delete(key);
        },
      },
    },
  };
}

function request(path, { sessionId = "structured-session", method = "GET", origin = "https://example.test", binding } = {}) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: { ...(sessionId ? { cookie: `admin_session=${sessionId}` } : binding ? { cookie: `__Host-threads_oauth=${binding}` } : {}), ...(origin === null ? {} : { origin }) },
  });
}

function oauthFetch() {
  let calls = 0;
  return async () => {
    calls += 1;
    if (calls === 1) {
      return Response.json({ access_token: "short-token", user_id: "short-user" });
    }
    return Response.json({
      access_token: "long-token",
      token_type: "bearer",
      expires_in: 5_184_000,
    });
  };
}

test("structured selected Workspace creates a pending account and server-bound OAuth state", async () => {
  const { env, values } = createEnv();
  const response = await handleConnectedAccountOAuthStart(
    request("/app/connected-accounts/threads/start", { method: "POST" }),
    env,
    {
      now: CREATED_AT,
      createState: () => "connection-state",
      createConnectedAccountId: () => "threads-next",
    },
  );

  assert.equal(response.status, 302);
  assert.match(response.headers.get("location"), /state=connection-state/u);
  const state = JSON.parse(values.get("oauth_state:connection-state"));
  assert.deepEqual(Object.keys(state).sort(), [
    "browserBinding", "connectedAccountId", "createdAt", "expiresAt", "sessionId",
    "type", "userId", "version", "workspaceId",
  ]);
  assert.equal(state.sessionId, "structured-session");
  assert.equal(state.workspaceId, "workspace-next");
  assert.equal(state.connectedAccountId, "threads-next");
  assert.doesNotMatch(JSON.stringify(state), /token|secret|authRef/iu);

  const registry = JSON.parse(values.get(CONNECTED_ACCOUNTS_KEY));
  assert.equal(registry.records.length, 1);
  assert.equal(registry.records[0].active, false);
  assert.equal(registry.records[0].authRef, "connected_account_auth:threads-next");
  assert.equal(values.has("threads_auth"), false);
  assert.equal(values.has("threads_short_lived_token"), false);
});

test("connection start rejects legacy or unavailable Workspace sessions without writes", async () => {
  const legacy = createEnv();
  const legacyResponse = await handleConnectedAccountOAuthStart(
    request("/app/connected-accounts/threads/start", { sessionId: "legacy-session", method: "POST" }),
    legacy.env,
  );
  assert.equal(legacyResponse.status, 403);
  assert.equal(legacy.writes.length, 0);

  const unavailable = createEnv({ selectedWorkspaceId: null });
  const unavailableResponse = await handleConnectedAccountOAuthStart(
    request("/app/connected-accounts/threads/start", { method: "POST" }),
    unavailable.env,
  );
  assert.equal(unavailableResponse.status, 403);
  assert.equal(unavailable.writes.length, 0);

  const getOnly = createEnv();
  const getResponse = await handleConnectedAccountOAuthStart(
    request("/app/connected-accounts/threads/start"),
    getOnly.env,
  );
  assert.equal(getResponse.status, 405);
  assert.equal(getOnly.writes.length, 0);
});

test("connected account callback writes only account credential then activates verified account", async () => {
  const { env, values } = createEnv();
  await handleConnectedAccountOAuthStart(
    request("/app/connected-accounts/threads/start", { method: "POST" }),
    env,
    {
      now: CREATED_AT,
      createState: () => "connection-state",
      createConnectedAccountId: () => "threads-next",
    },
  );

  const response = await handleOAuthCallback(
    request("/oauth/callback?code=code-value&state=connection-state"),
    new URL("https://example.test/oauth/callback?code=code-value&state=connection-state"),
    env,
    {
      now: "2026-08-31T00:01:00.000Z",
      fetchImpl: oauthFetch(),
      getThreadsProfileImpl: async (accessToken) => {
        assert.equal(accessToken, "long-token");
        return { id: "threads-user", username: "next-horizon" };
      },
    },
  );

  assert.equal(response.status, 200);
  await assertLanding(response, "/app?threadsConnection=success");
  assert.equal(values.has("oauth_state:connection-state"), false);
  assert.equal(values.has("threads_auth"), false);
  assert.equal(values.has("threads_short_lived_token"), false);
  const credential = JSON.parse(values.get("connected_account_auth:threads-next"));
  assert.equal(credential.access_token, "long-token");
  assert.equal(credential.username, "next-horizon");
  const registry = JSON.parse(values.get(CONNECTED_ACCOUNTS_KEY));
  assert.equal(registry.records[0].workspaceId, "workspace-next");
  assert.equal(registry.records[0].active, true);
  assert.equal(registry.records[0].displayName, "next-horizon");
  assert.equal(registry.records[0].authRef, "connected_account_auth:threads-next");
});

test("callback fails closed for session/workspace mismatch and writes no credential", async () => {
  const { env, values } = createEnv();
  await handleConnectedAccountOAuthStart(
    request("/app/connected-accounts/threads/start", { method: "POST" }),
    env,
    { now: CREATED_AT, createState: () => "connection-state", createConnectedAccountId: () => "threads-next" },
  );
  const response = await handleOAuthCallback(
    request("/oauth/callback?code=code-value&state=connection-state", { sessionId: "legacy-session" }),
    new URL("https://example.test/oauth/callback?code=code-value&state=connection-state"),
    env,
    { fetchImpl: async () => assert.fail("must not exchange") },
  );
  await assertLanding(response, "/app?threadsConnection=failed");
  assert.equal(values.has("connected_account_auth:threads-next"), false);
  assert.equal(JSON.parse(values.get(CONNECTED_ACCOUNTS_KEY)).records[0].active, false);
});

test("credential write failure leaves the pending account inactive", async () => {
  const setup = createEnv();
  await handleConnectedAccountOAuthStart(
    request("/app/connected-accounts/threads/start", { method: "POST" }),
    setup.env,
    { now: CREATED_AT, createState: () => "connection-state", createConnectedAccountId: () => "threads-next" },
  );
  const values = setup.values;
  const originalPut = setup.env.THREADS_KV.put;
  setup.env.THREADS_KV.put = async (key, value, options) => {
    if (key === "connected_account_auth:threads-next") throw new Error("credential write failed");
    return originalPut(key, value, options);
  };

  const response = await handleOAuthCallback(
    request("/oauth/callback?code=code-value&state=connection-state"),
    new URL("https://example.test/oauth/callback?code=code-value&state=connection-state"),
    setup.env,
    {
      now: "2026-08-31T00:01:00.000Z",
      fetchImpl: oauthFetch(),
      getThreadsProfileImpl: async () => ({ id: "threads-user", username: "next-horizon" }),
    },
  );
  await assertLanding(response, "/app?threadsConnection=failed");
  assert.equal(values.has("connected_account_auth:threads-next"), false);
  assert.equal(JSON.parse(values.get(CONNECTED_ACCOUNTS_KEY)).records[0].active, false);
});

test("activation failure leaves the account inactive and never falls back to legacy credentials", async () => {
  const setup = createEnv();
  await handleConnectedAccountOAuthStart(
    request("/app/connected-accounts/threads/start", { method: "POST" }),
    setup.env,
    { now: CREATED_AT, createState: () => "connection-state", createConnectedAccountId: () => "threads-next" },
  );
  const values = setup.values;
  const originalPut = setup.env.THREADS_KV.put;
  setup.env.THREADS_KV.put = async (key, value, options) => {
    if (key === CONNECTED_ACCOUNTS_KEY && JSON.parse(value).records[0]?.active) {
      throw new Error("activation write failed");
    }
    return originalPut(key, value, options);
  };

  const response = await handleOAuthCallback(
    request("/oauth/callback?code=code-value&state=connection-state"),
    new URL("https://example.test/oauth/callback?code=code-value&state=connection-state"),
    setup.env,
    {
      now: "2026-08-31T00:01:00.000Z",
      fetchImpl: oauthFetch(),
      getThreadsProfileImpl: async () => ({ id: "threads-user", username: "next-horizon" }),
    },
  );
  await assertLanding(response, "/app?threadsConnection=failed");
  assert.equal(JSON.parse(values.get(CONNECTED_ACCOUNTS_KEY)).records[0].active, false);
  assert.equal(values.has("connected_account_auth:threads-next"), true);
  assert.equal(values.has("threads_auth"), false);
});

test("expired state and existing account credential fail closed without external OAuth calls", async () => {
  const expired = createEnv();
  await handleConnectedAccountOAuthStart(
    request("/app/connected-accounts/threads/start", { method: "POST" }),
    expired.env,
    { now: CREATED_AT, createState: () => "connection-state", createConnectedAccountId: () => "threads-next" },
  );
  const expiredResponse = await handleOAuthCallback(
    request("/oauth/callback?code=code-value&state=connection-state"),
    new URL("https://example.test/oauth/callback?code=code-value&state=connection-state"),
    expired.env,
    { now: "2026-08-31T00:11:00.000Z", fetchImpl: async () => assert.fail("must not exchange") },
  );
  await assertLanding(expiredResponse, "/app?threadsConnection=failed");

  const existing = createEnv();
  await handleConnectedAccountOAuthStart(
    request("/app/connected-accounts/threads/start", { method: "POST" }),
    existing.env,
    { now: CREATED_AT, createState: () => "connection-state", createConnectedAccountId: () => "threads-next" },
  );
  existing.values.set("connected_account_auth:threads-next", "already-present");
  const existingResponse = await handleOAuthCallback(
    request("/oauth/callback?code=code-value&state=connection-state"),
    new URL("https://example.test/oauth/callback?code=code-value&state=connection-state"),
    existing.env,
    { fetchImpl: async () => assert.fail("must not exchange") },
  );
  await assertLanding(existingResponse, "/app?threadsConnection=failed");
  assert.equal(existing.values.get("connected_account_auth:threads-next"), "already-present");
});

test("legacy OAuth start requires a legacy session and same-origin POST without unauthenticated writes", async () => {
  for (const options of [{ method: "GET" }, { method: "POST", sessionId: null }, { method: "POST" }, { method: "POST", sessionId: "legacy-session", origin: null }, { method: "POST", sessionId: "legacy-session", origin: "https://foreign.test" }]) {
    const { env, writes } = createEnv();
    const response = await handleOAuthStart(request("/oauth/start", options), env);
    assert.notEqual(response.status, 200);
    assert.equal(writes.length, 0);
    assert.doesNotMatch(response.headers.get("location") || "", /threads.net/);
  }
});

test("authenticated connect page uses POST forms and rejects personal login", async () => {
  const { env } = createEnv();
  assert.equal((await handleConnectPage(request("/connect"), env)).status, 403);
  assert.equal((await handleConnectPage(request("/connect", { sessionId: null }), env)).status, 302);
  const response = await handleConnectPage(request("/connect", { sessionId: "legacy-session" }), env);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.text()).match(/method="post"/g).length, 3);
});

async function startLegacy(setup) {
  const response = await handleOAuthStart(request("/oauth/start", { sessionId: "legacy-session", method: "POST" }), setup.env, { now: CREATED_AT, createState: () => "legacy-state" });
  assert.match(response.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Lax/);
  assert.doesNotMatch(response.headers.get("set-cookie"), /legacy-session/);
  return JSON.parse(setup.values.get("oauth_state:legacy-state")).browserBinding;
}

const callbackPath = "/oauth/callback?code=legacy-code&state=legacy-state";
const callbackNow = "2026-08-31T00:01:00.000Z";
test("legacy callback uses browser proof with Strict cookie absent, saves no public token and prevents replay", async () => {
  const setup = createEnv();
  const binding = await startLegacy(setup);
  let calls = 0;
  const options = { now: callbackNow, fetchImpl: async () => { calls++; return Response.json({ access_token: "legacy-short", user_id: "legacy-user" }); } };
  const req = request(callbackPath, { sessionId: null, binding });
  const response = await handleOAuthCallback(req, new URL(req.url), setup.env, options);
  await assertLanding(response, "/connect?threadsConnection=success");
  assert.equal(response.headers.get("cache-control"), "no-store");

  const saved = JSON.parse(setup.values.get("threads_short_lived_token"));
  assert.equal(saved.access_token, "legacy-short");
  assert.equal(saved.sessionId, "legacy-session");
  assert.equal(setup.values.has("threads_auth"), false);
  await handleOAuthCallback(req, new URL(req.url), setup.env, options);
  assert.equal(calls, 1);
});

test("legacy callback rejects missing/wrong proof, wrong session, revoked session, expired and old state", async () => {
  for (const mode of ["missing", "wrong", "session", "revoked", "expired", "old"]) {
    const setup = createEnv();
    const binding = await startLegacy(setup);
    if (mode === "revoked") setup.values.delete("admin_session:legacy-session");
    if (mode === "old") setup.values.set("oauth_state:legacy-state", "valid");
    const req = request(callbackPath, { sessionId: mode === "session" ? "structured-session" : null, binding: mode === "missing" ? null : mode === "wrong" ? "wrong-proof" : binding });
    const response = await handleOAuthCallback(req, new URL(req.url), setup.env, { now: mode === "expired" ? "2026-08-31T00:11:00.000Z" : callbackNow, fetchImpl: async () => assert.fail("must not exchange") });
    await assertLanding(response, "threadsConnection=failed");
    assert.equal(setup.values.has("threads_short_lived_token"), false);
  }
});

test("structured OAuth accepts its browser proof and rejects cross-origin initiation", async () => {
  const setup = createEnv();
  const blocked = await handleConnectedAccountOAuthStart(request("/app/connected-accounts/threads/start", { method: "POST", origin: "https://foreign.test" }), setup.env);
  assert.equal(blocked.status, 403);
  assert.equal(setup.writes.length, 0);
  await handleConnectedAccountOAuthStart(request("/app/connected-accounts/threads/start", { method: "POST" }), setup.env, { now: CREATED_AT, createState: () => "structured-state", createConnectedAccountId: () => "threads-next" });
  const state = JSON.parse(setup.values.get("oauth_state:structured-state"));
  const req = request("/oauth/callback?code=test-code&state=structured-state", { sessionId: null, binding: state.browserBinding });
  const response = await handleOAuthCallback(req, new URL(req.url), setup.env, { now: callbackNow, fetchImpl: oauthFetch(), getThreadsProfileImpl: async () => ({ id: "threads-user", username: "next-horizon" }) });
  await assertLanding(response, "threadsConnection=success");
  assert.equal(setup.values.has("threads_auth"), false);
});

test("structured browser fallback revalidates session, user and workspace before any exchange", async () => {
  for (const mode of ["revoked", "expired", "inactive", "workspace", "wrong-proof"]) {
    const setup = createEnv();
    await handleConnectedAccountOAuthStart(request("/app/connected-accounts/threads/start", { method: "POST" }), setup.env,
      { now: CREATED_AT, createState: () => "bound-state", createConnectedAccountId: () => "threads-next" });
    const state = JSON.parse(setup.values.get("oauth_state:bound-state"));
    const sessionKey = ADMIN_SESSION_KEY_PREFIX + "structured-session";
    if (mode === "revoked") setup.values.delete(sessionKey);
    if (mode === "expired" || mode === "workspace") {
      const session = JSON.parse(setup.values.get(sessionKey));
      if (mode === "expired") session.expiresAt = "2026-09-01T00:00:00Z";
      else session.selectedWorkspaceId = "foreign";
      setup.values.set(sessionKey, JSON.stringify(session));
    }
    if (mode === "inactive") {
      const users = JSON.parse(setup.values.get(USERS_KEY));
      users.users[0].active = false;
      setup.values.set(USERS_KEY, JSON.stringify(users));
    }
    const before = setup.writes.length;
    const req = request("/oauth/callback?code=test-code&state=bound-state", { sessionId: null, binding: mode === "wrong-proof" ? "wrong" : state.browserBinding });
    const response = await handleOAuthCallback(req, new URL(req.url), setup.env,
      { now: callbackNow, fetchImpl: async () => assert.fail("No exchange on invalid callback") });
    await assertLanding(response, "threadsConnection=failed");
    assert.equal(setup.writes.length, before);
    assert.equal(setup.values.has("connected_account_auth:threads-next"), false);
  }
});
