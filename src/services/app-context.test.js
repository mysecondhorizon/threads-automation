import assert from "node:assert/strict";
import test from "node:test";

import {
  AppContextError,
  isUnscopedAppAccessBlocked,
  resolveCurrentAppContext,
  resolveCurrentWorkspace,
  selectCurrentWorkspace,
} from "./app-context.js";
import {
  ADMIN_SESSION_KEY_PREFIX,
  USERS_KEY,
  WORKSPACES_KEY,
} from "./login-foundation.js";
import { DEFAULT_WORKSPACE_ID } from "./workspace-foundation.js";

const NOW = Date.parse("2099-08-30T00:00:00.000Z");
const FUTURE = "2099-08-30T08:00:00.000Z";

function user(id, displayName = "User") {
  return {
    id,
    loginId: id,
    displayName,
    active: true,
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  };
}

function workspace(id, ownerUserId, active = true) {
  return {
    id,
    ownerUserId,
    name: id,
    active,
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  };
}

function session(userId, selectedWorkspaceId) {
  return JSON.stringify({
    version: 1,
    userId,
    selectedWorkspaceId,
    createdAt: "2026-08-30T00:00:00.000Z",
    expiresAt: FUTURE,
  });
}

function createEnv(initialValues = {}) {
  const values = new Map(Object.entries(initialValues).map(([key, value]) => [
    key,
    typeof value === "string" ? value : JSON.stringify(value),
  ]));
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

function request(sessionId, extra = "") {
  return new Request(`https://example.test/app${extra}`, {
    headers: { cookie: `admin_session=${sessionId}` },
  });
}

function baseValues(selectedWorkspaceId = "workspace-a") {
  return {
    [USERS_KEY]: { version: 1, users: [user("user-a", "User A"), user("user-b", "User B")] },
    [WORKSPACES_KEY]: {
      version: 1,
      workspaces: [
        workspace("workspace-a", "user-a"),
        workspace("workspace-b", "user-b"),
        workspace("workspace-inactive", "user-a", false),
      ],
    },
    [`${ADMIN_SESSION_KEY_PREFIX}session-a`]: session("user-a", selectedWorkspaceId),
  };
}

test("legacy and selected registered Workspaces resolve to sanitized trusted context", async () => {
  const legacy = createEnv({ "admin_session:legacy": "valid" });
  assert.deepEqual(await resolveCurrentWorkspace(request("legacy"), legacy.env), {
    id: DEFAULT_WORKSPACE_ID,
    name: "Default Workspace",
    active: true,
  });

  const { env } = createEnv(baseValues());
  assert.deepEqual(await resolveCurrentWorkspace(request("session-a", "?workspaceId=workspace-b"), env), {
    id: "workspace-a",
    name: "workspace-a",
    active: true,
  });
  const context = await resolveCurrentAppContext(request("session-a"), env);
  assert.equal(context.user.displayName, "User A");
  assert.deepEqual(context.workspaces, [{ id: "workspace-a", name: "workspace-a", active: true }]);
  assert.equal(isUnscopedAppAccessBlocked(context), true);
});

test("null, foreign, inactive, and default Workspace selections fail closed for registered Users", async () => {
  for (const selectedWorkspaceId of [null, "workspace-b", "workspace-inactive", DEFAULT_WORKSPACE_ID]) {
    const { env } = createEnv(baseValues(selectedWorkspaceId));
    assert.equal(await resolveCurrentWorkspace(request("session-a"), env), null);
    const context = await resolveCurrentAppContext(request("session-a"), env);
    assert.equal(
      isUnscopedAppAccessBlocked(context),
      selectedWorkspaceId === "workspace-b" || selectedWorkspaceId === "workspace-inactive",
    );
  }
});

test("Workspace selection preserves the same session identity and bounded remaining lifetime", async () => {
  const { env, values, writes } = createEnv(baseValues(null));
  const selected = await selectCurrentWorkspace(request("session-a"), env, "workspace-a", {
    now: NOW,
  });
  const stored = JSON.parse(values.get(`${ADMIN_SESSION_KEY_PREFIX}session-a`));

  assert.deepEqual(selected, { id: "workspace-a", name: "workspace-a", active: true });
  assert.equal(stored.userId, "user-a");
  assert.equal(stored.createdAt, "2026-08-30T00:00:00.000Z");
  assert.equal(stored.expiresAt, FUTURE);
  assert.equal(stored.selectedWorkspaceId, "workspace-a");
  assert.equal(writes[0].key, `${ADMIN_SESSION_KEY_PREFIX}session-a`);
  assert.equal(writes[0].options.expirationTtl, 8 * 60 * 60);
});

test("registered Default Workspace sessions can select an owned non-default Workspace", async () => {
  const { env } = createEnv(baseValues(DEFAULT_WORKSPACE_ID));

  const selected = await selectCurrentWorkspace(request("session-a"), env, "workspace-a", {
    now: NOW,
  });

  assert.equal(selected.id, "workspace-a");
});

test("Workspace selection rejects foreign, inactive, default, legacy, and expired sessions", async () => {
  const { env } = createEnv(baseValues(null));
  for (const id of ["workspace-b", "workspace-inactive", DEFAULT_WORKSPACE_ID]) {
    await assert.rejects(
      () => selectCurrentWorkspace(request("session-a"), env, id, { now: NOW }),
      (error) => error instanceof AppContextError,
    );
  }

  const legacy = createEnv({ "admin_session:legacy": "valid" });
  await assert.rejects(
    () => selectCurrentWorkspace(request("legacy"), legacy.env, "workspace-a", { now: NOW }),
    (error) => error instanceof AppContextError,
  );

  const expired = createEnv(baseValues(null));
  expired.values.set(`${ADMIN_SESSION_KEY_PREFIX}session-a`, session("user-a", null).replace(FUTURE, "2026-08-30T00:00:00.000Z"));
  await assert.rejects(
    () => selectCurrentWorkspace(request("session-a"), expired.env, "workspace-a", { now: NOW }),
    (error) => error instanceof AppContextError,
  );
});
