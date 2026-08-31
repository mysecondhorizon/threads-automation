import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAppHome,
  handleAppWorkspaceSelection,
  renderAppWorkspaceUnavailable,
} from "./app-shell.js";
import { requireAdminApiSession } from "../middleware/auth.js";
import {
  ADMIN_SESSION_KEY_PREFIX,
  USERS_KEY,
  WORKSPACES_KEY,
} from "../services/login-foundation.js";
import { resolveCurrentAppContext } from "../services/app-context.js";

const CREATED_AT = "2026-08-30T00:00:00.000Z";
const EXPIRES_AT = "2099-08-30T00:00:00.000Z";

function createEnv(selectedWorkspaceId = "workspace-a") {
  const values = new Map([
    [USERS_KEY, JSON.stringify({
      version: 1,
      users: [{
        id: "user-a",
        loginId: "user-a",
        displayName: "User A",
        active: true,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      }],
    })],
    [WORKSPACES_KEY, JSON.stringify({
      version: 1,
      workspaces: [
        { id: "workspace-a", ownerUserId: "user-a", name: "Workspace A", active: true, createdAt: CREATED_AT, updatedAt: CREATED_AT },
        { id: "workspace-b", ownerUserId: "user-a", name: "Workspace B", active: true, createdAt: CREATED_AT, updatedAt: CREATED_AT },
        { id: "workspace-foreign", ownerUserId: "user-b", name: "Foreign", active: true, createdAt: CREATED_AT, updatedAt: CREATED_AT },
        { id: "workspace-inactive", ownerUserId: "user-a", name: "Inactive", active: false, createdAt: CREATED_AT, updatedAt: CREATED_AT },
      ],
    })],
    [`${ADMIN_SESSION_KEY_PREFIX}registered`, JSON.stringify({
      version: 1,
      userId: "user-a",
      selectedWorkspaceId,
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
    })],
    ["admin_session:legacy", "valid"],
  ]);
  const writes = [];
  return {
    values,
    writes,
    env: {
      THREADS_KV: {
        async get(key, type) {
          const value = values.get(key);
          if (value === undefined) return null;
          return type === "json" ? JSON.parse(value) : value;
        },
        async put(key, value, options) {
          writes.push({ key, value, options });
          values.set(key, value);
        },
      },
    },
  };
}

function request(path, sessionId = "registered", method = "GET", body) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: { cookie: `admin_session=${sessionId}` },
    body,
  });
}

test("registered Workspace app home shows trusted User and owned active Workspaces", async () => {
  const { env } = createEnv("workspace-a");
  const response = await handleAppHome(request("/app"), env);
  const page = await response.text();

  assert.equal(response.status, 200);
  assert.match(page, /User A/u);
  assert.match(page, /Workspace A/u);
  assert.match(page, /Workspace B/u);
  assert.doesNotMatch(page, /workspace-foreign/u);
  assert.doesNotMatch(page, /workspace-inactive/u);
  assert.match(page, /Current Workspace/u);
  assert.match(page, /action="\/app\/connected-accounts\/threads\/start"/u);
  assert.match(page, /action="\/app\/logout"/u);
});

test("app home safely represents null selection and no active Workspace states", async () => {
  const nullSelection = createEnv(null);
  const nullPage = await (await handleAppHome(request("/app"), nullSelection.env)).text();
  assert.match(nullPage, /Select a workspace to establish your app context/u);

  const empty = createEnv(null);
  empty.values.set(WORKSPACES_KEY, JSON.stringify({ version: 1, workspaces: [] }));
  const emptyPage = await (await handleAppHome(request("/app"), empty.env)).text();
  assert.match(emptyPage, /No workspace available/u);
});

test("Workspace selection route preserves session and GET cannot mutate", async () => {
  const { env, values, writes } = createEnv(null);
  const form = new FormData();
  form.set("workspaceId", "workspace-b");
  const post = await handleAppWorkspaceSelection(request("/app/workspace", "registered", "POST", form), env);
  const session = JSON.parse(values.get(`${ADMIN_SESSION_KEY_PREFIX}registered`));

  assert.equal(post.status, 302);
  assert.equal(post.headers.get("cache-control"), "no-store");
  assert.equal(session.userId, "user-a");
  assert.equal(session.createdAt, CREATED_AT);
  assert.equal(session.expiresAt, EXPIRES_AT);
  assert.equal(session.selectedWorkspaceId, "workspace-b");
  assert.equal(writes.length, 1);

  const get = await handleAppWorkspaceSelection(request("/app/workspace"), env);
  assert.equal(get.status, 405);
  assert.equal(writes.length, 1);
});

test("selected non-default Workspace blocks unscoped app views and APIs while home remains available", async () => {
  const { env } = createEnv("workspace-a");
  const home = await handleAppHome(request("/app"), env);
  const context = await resolveCurrentAppContext(request("/app"), env);
  const unavailable = renderAppWorkspaceUnavailable(context, "/app/products");
  const api = await requireAdminApiSession(request("/api/products"), env);

  assert.equal(home.status, 200);
  assert.equal(unavailable.status, 409);
  assert.match(await unavailable.text(), /Workspace data access is not available yet/u);
  assert.equal(api.ok, false);
  assert.equal(api.response.status, 409);
});

test("legacy and registered Default Workspace API behavior remains available", async () => {
  const legacy = createEnv("workspace-a");
  assert.equal((await requireAdminApiSession(request("/api/products", "legacy"), legacy.env)).ok, true);

  const registeredDefault = createEnv("default-workspace");
  assert.equal((await requireAdminApiSession(request("/api/products"), registeredDefault.env)).ok, true);
});

test("app home shows only safe Threads connection feedback", async () => {
  const { env } = createEnv("workspace-a");
  const successPage = await (await handleAppHome(
    request("/app?threadsConnection=success"),
    env,
  )).text();
  assert.match(successPage, /Threads account connection completed/u);
  assert.doesNotMatch(successPage, /access_token|authRef|threads_auth/iu);
});
