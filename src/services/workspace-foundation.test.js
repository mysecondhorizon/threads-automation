import assert from "node:assert/strict";
import test from "node:test";
import { listApps } from "./apps.js";
import {
  DEFAULT_WORKSPACE_ID,
  LEGACY_THREADS_AUTH_REF,
  getDefaultWorkspace,
  getLegacyCredentialRef,
  toLegacyConnectedAccount,
} from "./workspace-foundation.js";

function createEnv(initialValues = {}) {
  const values = new Map(Object.entries(initialValues));
  return {
    values,
    env: {
      THREADS_KV: {
        async get(key, type) {
          const value = values.get(key) ?? null;
          return type === "json" && value !== null ? JSON.parse(value) : value;
        },
        async put(key, value) {
          values.set(key, value);
        },
      },
    },
  };
}

test("default Workspace identity is stable without workspace storage", () => {
  const first = getDefaultWorkspace();
  const second = getDefaultWorkspace();

  assert.deepEqual(first, second);
  assert.equal(first.id, DEFAULT_WORKSPACE_ID);
  assert.equal(first.ownerUserId, "legacy-owner");
  assert.equal(first.active, true);
  assert.notEqual(first, second);
});

test("threads-primary derives as the default Workspace Connected Account", async () => {
  const { env, values } = createEnv();
  const [primaryApp] = await listApps(env);
  const account = toLegacyConnectedAccount(primaryApp);

  assert.deepEqual(account, {
    id: "threads-primary",
    workspaceId: DEFAULT_WORKSPACE_ID,
    platform: "THREADS",
    displayName: "Second Horizon Threads",
    active: true,
    createdAt: primaryApp.createdAt,
    updatedAt: primaryApp.updatedAt,
  });
  assert.equal(account.id === account.platform, false);
  assert.equal(getLegacyCredentialRef(account), LEGACY_THREADS_AUTH_REF);
  assert.deepEqual([...values.keys()], ["operator_apps:v1"]);
});

test("only the legacy primary Threads app maps to the existing credential key", () => {
  assert.equal(
    toLegacyConnectedAccount({ id: "threads-secondary", type: "THREADS" }),
    null,
  );
  assert.equal(
    toLegacyConnectedAccount({ id: "threads-primary", type: "WORDPRESS" }),
    null,
  );
  assert.equal(
    getLegacyCredentialRef({
      id: "threads-secondary",
      workspaceId: DEFAULT_WORKSPACE_ID,
      platform: "THREADS",
    }),
    null,
  );
});
