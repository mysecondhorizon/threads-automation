import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_SESSION_KEY_PREFIX,
  LEGACY_USER_ID,
  USERS_KEY,
  USER_AUTH_KEY_PREFIX,
  WORKSPACES_KEY,
  LoginFoundationError,
  createStructuredAdminSessionValue,
  createUser,
  createWorkspace,
  getParsedAdminSession,
  getUserById,
  getUserByLoginId,
  getWorkspaceForOwner,
  listUsers,
  listWorkspacesForOwner,
  normalizeLoginId,
  parseAdminSessionValue,
  resolveSelectedWorkspaceForSession,
  setUserPassword,
  verifyUserPassword,
} from "./login-foundation.js";

import {
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_OWNER_USER_ID,
} from "./workspace-foundation.js";

const NOW = "2026-08-30T00:00:00.000Z";
const FUTURE = "2099-08-30T00:00:00.000Z";

function createEnv(initialValues = {}) {
  const values = new Map(
    Object.entries(initialValues).map(([key, value]) => [
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    ]),
  );
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
        async put(key, value) {
          writes.push({ key, value });
          values.set(key, value);
        },
      },
    },
  };
}

async function expectCode(operation, code) {
  await assert.rejects(
    operation,
    (error) => error instanceof LoginFoundationError && error.code === code,
  );
}

test("User registry normalizes unique login IDs and excludes auth material", async () => {
  const { env, values } = createEnv();
  const user = await createUser(
    env,
    {
      loginId: "  Operator@Example.Test  ",
      displayName: "Operator",
    },
    { now: NOW, createUserId: () => "user-operator" },
  );

  assert.deepEqual(user, {
    id: "user-operator",
    loginId: "operator@example.test",
    displayName: "Operator",
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  assert.equal(normalizeLoginId(" OPERATOR@EXAMPLE.TEST "), user.loginId);
  assert.deepEqual(await getUserById(env, user.id), user);
  assert.deepEqual(await getUserByLoginId(env, "operator@example.test"), user);
  assert.deepEqual(await listUsers(env, { activeOnly: true }), [user]);
  assert.equal(JSON.stringify(await env.THREADS_KV.get(USERS_KEY, "json")).includes("password"), false);

  await expectCode(
    () => createUser(env, { loginId: "OPERATOR@example.test", displayName: "Duplicate" }),
    "user_login_id_duplicate",
  );
  assert.equal(values.has(`${USER_AUTH_KEY_PREFIX}${user.id}`), false);
});

test("User registry represents inactive Users without treating them as active", async () => {
  const { env } = createEnv();
  const inactive = await createUser(
    env,
    { loginId: "inactive", displayName: "Inactive", active: false },
    { now: NOW, createUserId: () => "user-inactive" },
  );

  assert.equal(inactive.active, false);
  assert.deepEqual(await listUsers(env), [inactive]);
  assert.deepEqual(await listUsers(env, { activeOnly: true }), []);
});

test("Workspace registry isolates owners and keeps the synthetic default identity authoritative", async () => {
  const persistedDefault = {
    id: DEFAULT_WORKSPACE_ID,
    ownerUserId: "user-attacker",
    name: "Attempted override",
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const { env } = createEnv({
    [WORKSPACES_KEY]: {
      version: 1,
      workspaces: [persistedDefault],
    },
  });
  const workspaceA = await createWorkspace(
    env,
    { ownerUserId: "user-a", name: "Workspace A" },
    { now: NOW, createWorkspaceId: () => "workspace-a" },
  );
  const inactiveWorkspace = await createWorkspace(
    env,
    { ownerUserId: "user-a", name: "Inactive Workspace", active: false },
    { now: NOW, createWorkspaceId: () => "workspace-inactive" },
  );

  assert.deepEqual(await listWorkspacesForOwner(env, "user-a"), [workspaceA, inactiveWorkspace]);
  assert.deepEqual(await listWorkspacesForOwner(env, "user-a", { activeOnly: true }), [workspaceA]);
  assert.equal(await getWorkspaceForOwner(env, "workspace-a", "user-b"), null);
  assert.deepEqual(
    await getWorkspaceForOwner(env, DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_OWNER_USER_ID),
    {
      id: DEFAULT_WORKSPACE_ID,
      ownerUserId: DEFAULT_WORKSPACE_OWNER_USER_ID,
      name: "Default Workspace",
      active: true,
      createdAt: "1970-01-01T00:00:00.000Z",
      updatedAt: "1970-01-01T00:00:00.000Z",
    },
  );
  assert.equal(await getWorkspaceForOwner(env, DEFAULT_WORKSPACE_ID, "user-attacker"), null);
  await expectCode(
    () => createWorkspace(env, { ownerUserId: "user-a", name: "No override" }, {
      createWorkspaceId: () => DEFAULT_WORKSPACE_ID,
    }),
    "workspace_default_synthetic",
  );
});

test("Password auth uses isolated salted PBKDF2 records and fails closed", async () => {
  const { env, values } = createEnv();
  const first = await setUserPassword(env, "user-a", "correct horse battery staple", { now: NOW });
  const second = await setUserPassword(env, "user-b", "correct horse battery staple", { now: NOW });

  assert.equal(first.algorithm, "PBKDF2-SHA-256");
  assert.equal(first.iterations, 310_000);
  assert.equal(first.derivedKeyLength, 32);
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  assert.equal(await verifyUserPassword(env, "user-a", "correct horse battery staple"), true);
  assert.equal(await verifyUserPassword(env, "user-a", "wrong password"), false);
  assert.equal(values.get(`${USER_AUTH_KEY_PREFIX}user-a`).includes("correct horse battery staple"), false);

  values.set(`${USER_AUTH_KEY_PREFIX}user-a`, JSON.stringify({ version: 1, hash: "bad" }));
  assert.equal(await verifyUserPassword(env, "user-a", "correct horse battery staple"), false);
});

test("legacy and structured sessions parse strictly without granting default Workspace to new Users", async () => {
  const { env } = createEnv({
    [`${ADMIN_SESSION_KEY_PREFIX}legacy-session`]: "valid",
    [`${ADMIN_SESSION_KEY_PREFIX}structured-session`]: {
      version: 1,
      userId: "user-a",
      selectedWorkspaceId: null,
      createdAt: NOW,
      expiresAt: FUTURE,
    },
  });
  const legacy = await getParsedAdminSession(env, "legacy-session", { now: Date.parse(NOW) });
  const structured = await getParsedAdminSession(env, "structured-session", { now: Date.parse(NOW) });

  assert.deepEqual(legacy, {
    version: 0,
    userId: LEGACY_USER_ID,
    selectedWorkspaceId: DEFAULT_WORKSPACE_ID,
    legacy: true,
  });
  assert.deepEqual(structured, {
    version: 1,
    userId: "user-a",
    selectedWorkspaceId: null,
    createdAt: NOW,
    expiresAt: FUTURE,
    legacy: false,
  });
  assert.equal(
    (await resolveSelectedWorkspaceForSession(env, legacy)).id,
    DEFAULT_WORKSPACE_ID,
  );
  assert.equal(await resolveSelectedWorkspaceForSession(env, structured), null);
  assert.equal(
    parseAdminSessionValue(JSON.stringify({
      version: 1,
      userId: "user-a",
      selectedWorkspaceId: DEFAULT_WORKSPACE_ID,
      createdAt: NOW,
      expiresAt: FUTURE,
      unexpected: true,
    }), { now: Date.parse(NOW) }),
    null,
  );
  assert.equal(
    parseAdminSessionValue(JSON.stringify({
      version: 1,
      userId: "user-a",
      selectedWorkspaceId: null,
      createdAt: FUTURE,
      expiresAt: NOW,
    }), { now: Date.parse(NOW) }),
    null,
  );
});

test("only a validated active owned Workspace resolves from a structured session", async () => {
  const { env } = createEnv();
  await createUser(
    env,
    { loginId: "user-a", displayName: "User A" },
    { now: NOW, createUserId: () => "user-a" },
  );
  await createWorkspace(
    env,
    { ownerUserId: "user-a", name: "Workspace A" },
    { now: NOW, createWorkspaceId: () => "workspace-a" },
  );

  const session = parseAdminSessionValue(JSON.stringify({
    version: 1,
    userId: "user-a",
    selectedWorkspaceId: "workspace-a",
    createdAt: NOW,
    expiresAt: FUTURE,
  }), { now: Date.parse(NOW) });
  assert.equal((await resolveSelectedWorkspaceForSession(env, session)).id, "workspace-a");

  const crossOwnerSession = parseAdminSessionValue(JSON.stringify({
    version: 1,
    userId: "user-a",
    selectedWorkspaceId: DEFAULT_WORKSPACE_ID,
    createdAt: NOW,
    expiresAt: FUTURE,
  }), { now: Date.parse(NOW) });
  assert.equal(await resolveSelectedWorkspaceForSession(env, crossOwnerSession), null);
});

test("structured session creation preserves nullable Workspace selection and expiry", () => {
  assert.deepEqual(
    createStructuredAdminSessionValue("user-a", null, {
      now: NOW,
      ttlSeconds: 60 * 60 * 8,
    }),
    {
      version: 1,
      userId: "user-a",
      selectedWorkspaceId: null,
      createdAt: NOW,
      expiresAt: "2026-08-30T08:00:00.000Z",
    },
  );
});
