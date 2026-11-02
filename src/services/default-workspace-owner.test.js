import assert from "node:assert/strict";
import test from "node:test";
import {
  USERS_KEY, WORKSPACES_KEY, getWorkspaceById, getWorkspaceForOwner,
  listWorkspacesForOwner,
} from "./login-foundation.js";
import { DEFAULT_WORKSPACE_ID, LEGACY_THREADS_AUTH_REF } from "./workspace-foundation.js";

const ownerId = "user-default-owner";
const timestamp = "2026-11-01T00:00:00.000Z";
const user = (overrides = {}) => ({
  id: ownerId, loginId: "default-owner", displayName: "Owner", active: true,
  createdAt: timestamp, updatedAt: timestamp, ...overrides,
});
function fixture() {
  const values = new Map([
    [USERS_KEY, { version: 1, users: [user(), user({ id: "other", loginId: "other" })] }],
    [WORKSPACES_KEY, { version: 1, workspaces: [{
      id: "owned-workspace", ownerUserId: ownerId, name: "Other workspace", active: true,
      createdAt: timestamp, updatedAt: timestamp,
    }] }],
  ]);
  const reads = [];
  let writes = 0;
  const env = {
    LEGACY_WORKSPACE_OWNER_USER_ID: ownerId,
    THREADS_KV: {
      async get(key) { reads.push(key); return structuredClone(values.get(key) ?? null); },
      async put() { writes++; throw Error("Unexpected write"); },
      async delete() { writes++; throw Error("Unexpected deletion"); },
      async list() { throw Error("Unexpected discovery"); },
    },
  };
  return { env, values, reads, get writes() { return writes; } };
}

test("explicit default owner can list and resolve existing scope without copying data", async () => {
  const f = fixture();
  const workspace = await getWorkspaceForOwner(f.env, DEFAULT_WORKSPACE_ID, ownerId);
  assert.equal(workspace.id, DEFAULT_WORKSPACE_ID);
  assert.equal(workspace.ownerUserId, ownerId);
  assert.deepEqual((await listWorkspacesForOwner(f.env, ownerId)).map(w => w.id), [DEFAULT_WORKSPACE_ID, "owned-workspace"]);
  assert.equal(await getWorkspaceForOwner(f.env, DEFAULT_WORKSPACE_ID, "other"), null);
  assert.deepEqual(await listWorkspacesForOwner(f.env, "other"), []);
  assert.equal(f.writes, 0);
  assert.ok(f.reads.every(key => [USERS_KEY, WORKSPACES_KEY].includes(key)));
  assert.ok(!f.reads.includes(LEGACY_THREADS_AUTH_REF));
});

test("missing, malformed and legacy bindings do not confer personal default ownership", async () => {
  for (const binding of [undefined, null, "", "wrong", ` ${ownerId}`, `${ownerId} `, "legacy-owner", {}, `${ownerId}\n`]) {
    const { env } = fixture();
    env.LEGACY_WORKSPACE_OWNER_USER_ID = binding;
    assert.equal(await getWorkspaceForOwner(env, DEFAULT_WORKSPACE_ID, ownerId), null);
    assert.deepEqual((await listWorkspacesForOwner(env, ownerId)).map(w => w.id), ["owned-workspace"]);
  }
});

test("legacy compatibility and internal runtime identity remain unchanged", async () => {
  const { env } = fixture();
  assert.equal((await getWorkspaceForOwner(env, DEFAULT_WORKSPACE_ID, "legacy-owner")).ownerUserId, "legacy-owner");
  assert.equal((await listWorkspacesForOwner(env, "legacy-owner"))[0].id, DEFAULT_WORKSPACE_ID);
  assert.equal((await getWorkspaceById(env, DEFAULT_WORKSPACE_ID)).ownerUserId, "legacy-owner");
});

test("binding removal and identity deactivation deny subsequent lookups", async () => {
  const { env, values } = fixture();
  assert.ok(await getWorkspaceForOwner(env, DEFAULT_WORKSPACE_ID, ownerId));
  delete env.LEGACY_WORKSPACE_OWNER_USER_ID;
  assert.equal(await getWorkspaceForOwner(env, DEFAULT_WORKSPACE_ID, ownerId), null);
  env.LEGACY_WORKSPACE_OWNER_USER_ID = ownerId;
  values.set(USERS_KEY, { version: 1, users: [user({ active: false })] });
  assert.equal(await getWorkspaceForOwner(env, DEFAULT_WORKSPACE_ID, ownerId), null);
});

test("malformed registries and ambiguous identities fail closed", async () => {
  for (const registry of [
    null, { version: 2, users: [user()] }, { version: 1, users: {} },
    { version: 1, users: [] }, { version: 1, users: [user({ active: false })] },
    { version: 1, users: [user(), user()] },
    { version: 1, users: [user(), user({ id: ` ${ownerId}` , loginId: "different" })] },
    { version: 1, users: [user(), user({ id: "other", loginId: " DEFAULT-OWNER " })] },
    { version: 1, users: [user({ id: ` ${ownerId}` })] },
    { version: 1, users: [user({ displayName: "" })] },
    { version: 1, users: [user(), { id: ownerId }] },
  ]) {
    const { env, values } = fixture();
    values.set(USERS_KEY, registry);
    assert.equal(await getWorkspaceForOwner(env, DEFAULT_WORKSPACE_ID, ownerId), null);
    assert.deepEqual((await listWorkspacesForOwner(env, ownerId)).map(w => w.id), ["owned-workspace"]);
  }
});

test("stored reserved workspace rows cannot duplicate or override synthetic ownership", async () => {
  const { env, values } = fixture();
  values.get(WORKSPACES_KEY).workspaces.push({
    id: DEFAULT_WORKSPACE_ID, ownerUserId: "other", name: "Forged", active: true,
    createdAt: timestamp, updatedAt: timestamp,
  });
  assert.equal((await listWorkspacesForOwner(env, ownerId)).filter(w => w.id === DEFAULT_WORKSPACE_ID).length, 1);
  assert.equal(await getWorkspaceForOwner(env, DEFAULT_WORKSPACE_ID, "other"), null);
});

test("storage errors propagate instead of allowing default ownership", async () => {
  const { env } = fixture();
  env.THREADS_KV.get = async () => { throw Error("Storage unavailable"); };
  await assert.rejects(() => getWorkspaceForOwner(env, DEFAULT_WORKSPACE_ID, ownerId), /Storage unavailable/u);
  await assert.rejects(() => listWorkspacesForOwner(env, ownerId), /Storage unavailable/u);
});
