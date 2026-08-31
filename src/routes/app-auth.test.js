import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAppLogin,
  handleAppLoginPage,
  handleAppLogout,
} from "./app-auth.js";
import { handleAppHome } from "./app-shell.js";
import {
  ADMIN_SESSION_KEY_PREFIX,
  createUser,
  createWorkspace,
  setUserPassword,
} from "../services/login-foundation.js";

const NOW = "2026-08-31T00:00:00.000Z";

function createEnv() {
  const values = new Map();
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

function request(path, { method = "GET", form = null, sessionId = null } = {}) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: sessionId ? { cookie: `admin_session=${sessionId}` } : {},
    body: form,
  });
}

function sessionIdFromResponse(response) {
  return decodeURIComponent(
    /admin_session=([^;]+)/u.exec(response.headers.get("set-cookie"))?.[1] ?? "",
  );
}

async function addRegisteredUser(env) {
  const user = await createUser(
    env,
    { loginId: "operator@example.test", displayName: "operator@example.test" },
    { now: NOW, createUserId: () => "user-operator" },
  );
  await setUserPassword(env, user.id, "correct-password", { now: NOW });
  await createWorkspace(
    env,
    { ownerUserId: user.id, name: "Next Horizon" },
    { now: NOW, createWorkspaceId: () => "workspace-next" },
  );
  return user;
}

function formData(fields) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

test("/app login page accepts only registered-user credentials", async () => {
  const page = await handleAppLoginPage().text();
  assert.match(page, /action="\/app\/login"/u);
  assert.match(page, /name="login_id"/u);
  assert.match(page, /name="password"/u);
  assert.doesNotMatch(page, /admin_key|ADMIN_KEY/u);
});

test("valid registered login creates a structured session and redirects to /app", async () => {
  const { env, values } = createEnv();
  const user = await addRegisteredUser(env);
  const response = await handleAppLogin(request("/app/login", {
    method: "POST",
    form: formData({ login_id: "OPERATOR@EXAMPLE.TEST", password: "correct-password" }),
  }), env);
  const sessionId = sessionIdFromResponse(response);
  const session = JSON.parse(values.get(`${ADMIN_SESSION_KEY_PREFIX}${sessionId}`));

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/app");
  assert.match(response.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Strict/u);
  assert.equal(session.userId, user.id);
  assert.equal(session.selectedWorkspaceId, "workspace-next");

  const app = await handleAppHome(request("/app", { sessionId }), env);
  assert.equal(app.status, 200);
});

test("invalid registered login and legacy ADMIN_KEY input fail generically", async () => {
  const { env, values } = createEnv();
  await addRegisteredUser(env);
  const responses = await Promise.all([
    handleAppLogin(request("/app/login", {
      method: "POST",
      form: formData({ login_id: "operator@example.test", password: "wrong" }),
    }), env),
    handleAppLogin(request("/app/login", {
      method: "POST",
      form: formData({ admin_key: "legacy-admin-key" }),
    }), env),
  ]);
  const bodies = await Promise.all(responses.map((response) => response.text()));
  assert.deepEqual(new Set(bodies), new Set(["Authentication failed."]));
  for (const response of responses) assert.equal(response.status, 401);
  assert.equal([...values.keys()].filter((key) => key.startsWith(ADMIN_SESSION_KEY_PREFIX)).length, 0);
});

test("/app logout deletes only the structured current session and clears its cookie", async () => {
  const { env, values, deletes } = createEnv();
  const user = await addRegisteredUser(env);
  values.set(`${ADMIN_SESSION_KEY_PREFIX}current-session`, JSON.stringify({
    version: 1,
    userId: user.id,
    selectedWorkspaceId: "workspace-next",
    createdAt: NOW,
    expiresAt: "2099-08-31T00:00:00.000Z",
  }));
  values.set(`${ADMIN_SESSION_KEY_PREFIX}other-session`, "valid");

  const response = await handleAppLogout(request("/app/logout", {
    method: "POST",
    sessionId: "current-session",
  }), env);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/app/login");
  assert.match(response.headers.get("set-cookie"), /Max-Age=0; HttpOnly; Secure; SameSite=Strict/u);
  assert.deepEqual(deletes, [`${ADMIN_SESSION_KEY_PREFIX}current-session`]);
  assert.equal(values.has(`${ADMIN_SESSION_KEY_PREFIX}current-session`), false);
  assert.equal(values.get(`${ADMIN_SESSION_KEY_PREFIX}other-session`), "valid");

  const afterLogout = await handleAppHome(request("/app", { sessionId: "current-session" }), env);
  assert.equal(afterLogout.status, 302);
  assert.equal(afterLogout.headers.get("location"), "https://example.test/app/login");
});

test("/app logout does not allow GET mutation", async () => {
  const { env, deletes } = createEnv();
  const response = await handleAppLogout(request("/app/logout"), env);
  assert.equal(response.status, 405);
  assert.deepEqual(deletes, []);
});
