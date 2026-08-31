import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_SESSION_KEY_PREFIX,
  USER_AUTH_KEY_PREFIX,
  USERS_KEY,
  WORKSPACES_KEY,
  createUser,
  createWorkspace,
  setUserPassword,
} from "../services/login-foundation.js";
import {
  handleAdminPasswordReset,
  handleAdminPasswordResetPage,
} from "./admin-password-reset.js";

const NOW = "2026-08-31T00:00:00.000Z";
const EXPIRES = "2099-08-31T00:00:00.000Z";

function createEnv(session = "legacy") {
  const values = new Map();
  if (session === "legacy") values.set(`${ADMIN_SESSION_KEY_PREFIX}legacy`, "valid");
  if (session === "registered") {
    values.set(`${ADMIN_SESSION_KEY_PREFIX}registered`, JSON.stringify({
      version: 1,
      userId: "user-registered",
      selectedWorkspaceId: null,
      createdAt: NOW,
      expiresAt: EXPIRES,
    }));
    values.set(USERS_KEY, JSON.stringify({
      version: 1,
      users: [{
        id: "user-registered",
        loginId: "registered@example.test",
        displayName: "registered@example.test",
        active: true,
        createdAt: NOW,
        updatedAt: NOW,
      }],
    }));
  }
  return {
    values,
    env: {
      THREADS_KV: {
        async get(key, type) {
          const value = values.get(key);
          if (value === undefined) return null;
          return type === "json" ? JSON.parse(value) : value;
        },
        async put(key, value) {
          values.set(key, value);
        },
      },
    },
  };
}

function request(method = "POST", body = undefined, session = "legacy") {
  return new Request("https://example.test/admin/maintenance/password-reset", {
    method,
    headers: {
      ...(session === "none" ? {} : { cookie: `admin_session=${session}` }),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function formRequest(fields, session = "legacy") {
  return new Request("https://example.test/admin/maintenance/password-reset", {
    method: "POST",
    headers: {
      ...(session === "none" ? {} : { cookie: `admin_session=${session}` }),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields),
  });
}

function validInput(overrides = {}) {
  return {
    loginId: "operator@example.test",
    password: "replacement-password",
    confirm: "RESET_USER_PASSWORD",
    ...overrides,
  };
}

async function addExistingUser(env) {
  const user = await createUser(env, {
    loginId: "operator@example.test",
    displayName: "operator@example.test",
  }, {
    now: NOW,
    createUserId: () => "user-operator",
  });
  await setUserPassword(env, user.id, "original-password", { now: NOW });
  const workspace = await createWorkspace(env, {
    ownerUserId: user.id,
    name: "Next Horizon",
  }, {
    now: NOW,
    createWorkspaceId: () => "workspace-next",
  });
  return { user, workspace };
}

test("legacy admin resets an existing user password without changing user or Workspace records", async () => {
  const { env, values } = createEnv();
  const { user, workspace } = await addExistingUser(env);
  const usersBefore = values.get(USERS_KEY);
  const workspacesBefore = values.get(WORKSPACES_KEY);

  const response = await handleAdminPasswordReset(request("POST", validInput()), env);
  const payload = await response.json();
  const auth = JSON.parse(values.get(`${USER_AUTH_KEY_PREFIX}${user.id}`));

  assert.equal(response.status, 200);
  assert.deepEqual(payload, { ok: true });
  assert.equal(auth.iterations, 100_000);
  assert.equal(values.get(USERS_KEY), usersBefore);
  assert.equal(values.get(WORKSPACES_KEY), workspacesBefore);
  assert.equal(JSON.stringify(payload).includes("replacement-password"), false);
  assert.equal(JSON.stringify(payload).includes("hash"), false);
  assert.equal(JSON.stringify(payload).includes("salt"), false);
  assert.equal(JSON.stringify(payload).includes(user.id), false);
  assert.equal(workspace.ownerUserId, user.id);
});

test("password reset page is legacy-admin-only and posts a password form without prefilled secrets", async () => {
  const { env, values } = createEnv();
  const { user } = await addExistingUser(env);
  const page = await handleAdminPasswordResetPage(request("GET", undefined), env);
  const body = await page.text();

  assert.equal(page.status, 200);
  assert.match(body, /method="post" action="\/admin\/maintenance\/password-reset"/u);
  assert.match(body, /name="userId"/u);
  assert.match(body, /name="loginId"/u);
  assert.match(body, /type="password" name="password"/u);
  assert.match(body, /name="confirm"/u);
  assert.doesNotMatch(body, /value="[^"]+"[^>]*name="password"/u);

  const post = await handleAdminPasswordReset(formRequest(validInput()), env);
  assert.equal(post.status, 200);
  assert.equal(JSON.parse(values.get(`${USER_AUTH_KEY_PREFIX}${user.id}`)).iterations, 100_000);

  assert.equal((await handleAdminPasswordResetPage(request("GET", undefined, "none"), env)).status, 401);
  assert.equal((await handleAdminPasswordResetPage(request("GET", undefined, "registered"), createEnv("registered").env)).status, 403);
});

test("password reset rejects non-legacy, unauthenticated, unknown, invalid, and non-POST requests", async () => {
  const { env } = createEnv();
  await addExistingUser(env);
  const unauthenticated = await handleAdminPasswordReset(request("POST", validInput(), "none"), env);
  const registered = await handleAdminPasswordReset(request("POST", validInput(), "registered"), createEnv("registered").env);
  const unknown = await handleAdminPasswordReset(request("POST", validInput({ loginId: "missing@example.test" })), env);
  const wrongConfirm = await handleAdminPasswordReset(request("POST", validInput({ confirm: "wrong" })), env);
  const get = await handleAdminPasswordReset(request("GET", undefined), env);

  assert.equal(unauthenticated.status, 401);
  assert.equal(registered.status, 403);
  assert.equal(unknown.status, 404);
  assert.equal(wrongConfirm.status, 400);
  assert.equal(get.status, 405);
});
