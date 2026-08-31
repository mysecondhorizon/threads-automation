import assert from "node:assert/strict";
import test from "node:test";

import {
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

function request(path, { sessionId = "structured-session", method = "GET" } = {}) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: sessionId ? { cookie: `admin_session=${sessionId}` } : {},
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
    "connectedAccountId", "createdAt", "expiresAt", "sessionId",
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

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://example.test/app?threadsConnection=success");
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
  assert.equal(response.headers.get("location"), "https://example.test/app?threadsConnection=failed");
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
  assert.equal(response.headers.get("location"), "https://example.test/app?threadsConnection=failed");
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
  assert.equal(response.headers.get("location"), "https://example.test/app?threadsConnection=failed");
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
  assert.equal(expiredResponse.headers.get("location"), "https://example.test/app?threadsConnection=failed");

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
  assert.equal(existingResponse.headers.get("location"), "https://example.test/app?threadsConnection=failed");
  assert.equal(existing.values.get("connected_account_auth:threads-next"), "already-present");
});

test("legacy OAuth state still writes only the legacy short-lived token", async () => {
  const { env, values } = createEnv();
  await handleOAuthStart(env, { createState: () => "legacy-state" });
  const response = await handleOAuthCallback(
    request("/oauth/callback?code=legacy-code&state=legacy-state", { sessionId: null }),
    new URL("https://example.test/oauth/callback?code=legacy-code&state=legacy-state"),
    env,
    { fetchImpl: async () => Response.json({ access_token: "legacy-short", user_id: "legacy-user" }) },
  );
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(values.get("threads_short_lived_token")).access_token, "legacy-short");
  assert.equal(values.has("threads_auth"), false);
});
