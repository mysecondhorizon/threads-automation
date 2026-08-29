import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAdminLogin,
  handleAdminLoginPage,
  handleAdminLogout,
} from "./admin.js";
import {
  requireAdminSession,
  resolveCurrentUser,
} from "../middleware/auth.js";
import {
  ADMIN_SESSION_KEY_PREFIX,
  USERS_KEY,
  createUser,
  createWorkspace,
  setUserPassword,
} from "../services/login-foundation.js";
import { DEFAULT_WORKSPACE_ID } from "../services/workspace-foundation.js";

const NOW = "2026-08-30T00:00:00.000Z";
const FUTURE = "2099-08-30T00:00:00.000Z";

function createEnv(initialValues = {}) {
  const values = new Map(
    Object.entries(initialValues).map(([key, value]) => [
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    ]),
  );
  const deletes = [];
  return {
    values,
    deletes,
    env: {
      ADMIN_KEY: "legacy-admin-key",
      THREADS_KV: {
        async get(key, type) {
          const value = values.get(key);
          if (value === undefined) return null;
          return type === "json" ? JSON.parse(value) : value;
        },
        async put(key, value) {
          values.set(key, value);
        },
        async delete(key) {
          deletes.push(key);
          values.delete(key);
        },
      },
    },
  };
}

function loginRequest(fields) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return new Request("https://example.test/admin/login", {
    method: "POST",
    body: form,
  });
}

function sessionIdFromResponse(response) {
  return /admin_session=([^;]+)/u.exec(response.headers.get("set-cookie"))?.[1] ?? null;
}

async function createRegisteredUser(env, { workspaceCount = 1, active = true } = {}) {
  const user = await createUser(
    env,
    { loginId: "operator", displayName: "Operator", active },
    { now: NOW, createUserId: () => "user-operator" },
  );
  await setUserPassword(env, user.id, "correct-password", { now: NOW });
  for (let index = 0; index < workspaceCount; index += 1) {
    await createWorkspace(
      env,
      { ownerUserId: user.id, name: `Workspace ${index + 1}` },
      { now: NOW, createWorkspaceId: () => `workspace-${index + 1}` },
    );
  }
  return user;
}

test("legacy ADMIN_KEY login and legacy User compatibility remain intact", async () => {
  const { env, values } = createEnv();
  const response = await handleAdminLogin(loginRequest({ admin_key: "legacy-admin-key" }), env);
  const sessionId = sessionIdFromResponse(response);

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Strict/u);
  assert.equal(values.get(`${ADMIN_SESSION_KEY_PREFIX}${sessionId}`), "valid");
  assert.deepEqual(
    await resolveCurrentUser(new Request("https://example.test/app", {
      headers: { cookie: `admin_session=${sessionId}` },
    }), env),
    { id: "legacy-owner", displayName: "Legacy Operator", active: true },
  );
});

test("login page keeps the ADMIN_KEY path and exposes registered User credentials", async () => {
  const page = await handleAdminLoginPage().text();
  assert.match(page, /name="admin_key"/u);
  assert.match(page, /name="login_id"/u);
  assert.match(page, /name="password"/u);
  assert.doesNotMatch(page, /name="admin_key"[\s\S]{0,160}required/u);
});

test("registered User login creates a structured session and auto-selects exactly one Workspace", async () => {
  const { env, values } = createEnv();
  await createRegisteredUser(env);
  const response = await handleAdminLogin(loginRequest({
    loginId: "OPERATOR",
    password: "correct-password",
    userId: "legacy-owner",
  }), env);
  const sessionId = decodeURIComponent(sessionIdFromResponse(response));
  const session = JSON.parse(values.get(`${ADMIN_SESSION_KEY_PREFIX}${sessionId}`));

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(session.userId, "user-operator");
  assert.equal(session.selectedWorkspaceId, "workspace-1");
  assert.equal(Date.parse(session.expiresAt) - Date.parse(session.createdAt), 8 * 60 * 60 * 1000);
  assert.notEqual(session.userId, "legacy-owner");
});

test("registered User sessions never fall back to default Workspace", async () => {
  for (const workspaceCount of [0, 2]) {
    const { env, values } = createEnv();
    await createRegisteredUser(env, { workspaceCount });
    const response = await handleAdminLogin(loginRequest({
      login_id: "operator",
      password: "correct-password",
    }), env);
    const sessionId = decodeURIComponent(sessionIdFromResponse(response));
    const session = JSON.parse(values.get(`${ADMIN_SESSION_KEY_PREFIX}${sessionId}`));
    assert.equal(session.selectedWorkspaceId, null);
    assert.notEqual(session.selectedWorkspaceId, DEFAULT_WORKSPACE_ID);
  }
});

test("unknown, wrong-password, and inactive User logins fail generically", async () => {
  const { env, values } = createEnv();
  await createRegisteredUser(env);
  const inactive = await createUser(
    env,
    { loginId: "inactive", displayName: "Inactive", active: false },
    { now: NOW, createUserId: () => "user-inactive" },
  );
  await setUserPassword(env, inactive.id, "correct-password", { now: NOW });

  const responses = await Promise.all([
    handleAdminLogin(loginRequest({ login_id: "operator", password: "wrong-password" }), env),
    handleAdminLogin(loginRequest({ login_id: "missing", password: "correct-password" }), env),
    handleAdminLogin(loginRequest({ login_id: "inactive", password: "correct-password" }), env),
  ]);
  const bodies = await Promise.all(responses.map((response) => response.text()));

  for (const response of responses) {
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.deepEqual(new Set(bodies), new Set(["Authentication failed."]));
  assert.equal([...values.keys()].filter((key) => key.startsWith(ADMIN_SESSION_KEY_PREFIX)).length, 0);
});

test("current User resolution accepts only valid active session identities", async () => {
  const { env, values } = createEnv();
  const user = await createRegisteredUser(env);
  const request = new Request("https://example.test/app?userId=legacy-owner", {
    headers: { cookie: "admin_session=structured-session" },
  });
  values.set(`${ADMIN_SESSION_KEY_PREFIX}structured-session`, JSON.stringify({
    version: 1,
    userId: user.id,
    selectedWorkspaceId: "workspace-1",
    createdAt: NOW,
    expiresAt: FUTURE,
  }));
  assert.deepEqual(await resolveCurrentUser(request, env), {
    id: user.id,
    displayName: user.displayName,
    active: true,
  });
  assert.equal((await requireAdminSession(request, env)).ok, true);

  values.set(`${ADMIN_SESSION_KEY_PREFIX}structured-session`, "not-json");
  assert.equal(await resolveCurrentUser(request, env), null);
  assert.equal((await requireAdminSession(request, env)).ok, false);
  assert.equal(
    await resolveCurrentUser(new Request("https://example.test/app", {
      headers: { cookie: "admin_session=%" },
    }), env),
    null,
  );

  values.delete(USERS_KEY);
  values.set(`${ADMIN_SESSION_KEY_PREFIX}structured-session`, JSON.stringify({
    version: 1,
    userId: user.id,
    selectedWorkspaceId: null,
    createdAt: NOW,
    expiresAt: FUTURE,
  }));
  assert.equal(await resolveCurrentUser(request, env), null);

  values.set(USERS_KEY, JSON.stringify({ version: 1, users: [user] }));

  values.set(`${ADMIN_SESSION_KEY_PREFIX}structured-session`, JSON.stringify({
    version: 1,
    userId: user.id,
    selectedWorkspaceId: null,
    createdAt: NOW,
    expiresAt: NOW,
  }));
  assert.equal(await resolveCurrentUser(request, env), null);

  const users = JSON.parse(values.get(USERS_KEY));
  users.users[0].active = false;
  values.set(USERS_KEY, JSON.stringify(users));
  values.set(`${ADMIN_SESSION_KEY_PREFIX}structured-session`, JSON.stringify({
    version: 1,
    userId: user.id,
    selectedWorkspaceId: null,
    createdAt: NOW,
    expiresAt: FUTURE,
  }));
  assert.equal(await resolveCurrentUser(request, env), null);
});

test("POST logout deletes the session and always clears the cookie without GET mutation", async () => {
  const { env, values, deletes } = createEnv({
    "admin_session:session-1": "valid",
  });
  const post = await handleAdminLogout(new Request("https://example.test/admin/logout", {
    method: "POST",
    headers: { cookie: "admin_session=session-1" },
  }), env);

  assert.equal(post.status, 302);
  assert.equal(post.headers.get("location"), "/admin/login");
  assert.equal(post.headers.get("cache-control"), "no-store");
  assert.match(post.headers.get("set-cookie"), /Max-Age=0; HttpOnly; Secure; SameSite=Strict/u);
  assert.deepEqual(deletes, ["admin_session:session-1"]);
  assert.equal(values.has("admin_session:session-1"), false);

  const missing = await handleAdminLogout(new Request("https://example.test/admin/logout", {
    method: "POST",
  }), env);
  assert.equal(missing.status, 302);
  assert.match(missing.headers.get("set-cookie"), /Max-Age=0/u);

  const malformed = await handleAdminLogout(new Request("https://example.test/admin/logout", {
    method: "POST",
    headers: { cookie: "admin_session=%" },
  }), env);
  assert.equal(malformed.status, 302);
  assert.match(malformed.headers.get("set-cookie"), /Max-Age=0/u);

  const get = await handleAdminLogout(new Request("https://example.test/admin/logout"), env);
  assert.equal(get.status, 405);
  assert.deepEqual(deletes, ["admin_session:session-1"]);
});
