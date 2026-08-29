import assert from "node:assert/strict";
import test from "node:test";

import {
  CONNECTED_ACCOUNTS_KEY,
  ConnectedAccountError,
} from "./connected-accounts.js";
import {
  resolveExecutionContext,
} from "./execution-context.js";
import {
  DEFAULT_WORKSPACE_ID,
} from "./workspace-foundation.js";

const TIMESTAMP = "2026-08-29T00:00:00.000Z";

function account(overrides = {}) {
  return {
    id: "threads-workspace-a",
    workspaceId: "workspace-a",
    platform: "THREADS",
    displayName: "Workspace A Threads",
    active: true,
    authRef: "connected_account_auth:threads-workspace-a",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function createEnv(initialValues = {}) {
  const values = new Map(
    Object.entries(initialValues).map(([key, value]) => [
      key,
      JSON.stringify(value),
    ])
  );
  const writes = [];

  return {
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

function expectedLegacyContext() {
  return {
    workspaceId: DEFAULT_WORKSPACE_ID,
    connectedAccountId: "threads-primary",
    connectedAccount: {
      id: "threads-primary",
      workspaceId: DEFAULT_WORKSPACE_ID,
      platform: "THREADS",
      displayName: "Second Horizon Threads",
      active: true,
    },
  };
}

async function expectCode(operation, code) {
  await assert.rejects(
    operation,
    (error) => error instanceof ConnectedAccountError && error.code === code
  );
}

test("Default Workspace execution context preserves legacy identity compatibility", async () => {
  const { env, writes } = createEnv();
  const contexts = await Promise.all([
    resolveExecutionContext(env),
    resolveExecutionContext(env, {
      workspaceId: null,
      connectedAccountId: null,
    }),
    resolveExecutionContext(env, {
      workspaceId: DEFAULT_WORKSPACE_ID,
      connectedAccountId: "threads-primary",
    }),
  ]);

  for (const context of contexts) {
    assert.deepEqual(context, expectedLegacyContext());
  }
  assert.deepEqual(writes, []);
});

test("execution context exposes only sanitized Connected Account identity fields", async () => {
  const persisted = account();
  const { env, writes } = createEnv({
    [CONNECTED_ACCOUNTS_KEY]: {
      version: 1,
      updatedAt: TIMESTAMP,
      records: [persisted],
    },
  });

  const legacy = await resolveExecutionContext(env);
  const scoped = await resolveExecutionContext(env, {
    workspaceId: persisted.workspaceId,
    connectedAccountId: persisted.id,
  });

  assert.deepEqual(scoped, {
    workspaceId: persisted.workspaceId,
    connectedAccountId: persisted.id,
    connectedAccount: {
      id: persisted.id,
      workspaceId: persisted.workspaceId,
      platform: persisted.platform,
      displayName: persisted.displayName,
      active: persisted.active,
    },
  });

  for (const context of [legacy, scoped]) {
    assert.deepEqual(Object.keys(context.connectedAccount).sort(), [
      "active",
      "displayName",
      "id",
      "platform",
      "workspaceId",
    ]);
    assert.equal("authRef" in context.connectedAccount, false);
    assert.equal("credential" in context.connectedAccount, false);
    assert.equal("access_token" in context.connectedAccount, false);
    assert.deepEqual(Object.getOwnPropertySymbols(context.connectedAccount), []);
  }
  assert.deepEqual(writes, []);
});

test("non-default execution context resolves only its active owned account", async () => {
  const persisted = account();
  const inactive = account({
    id: "threads-workspace-a-inactive",
    active: false,
    authRef: "connected_account_auth:threads-workspace-a-inactive",
  });
  const { env, writes } = createEnv({
    [CONNECTED_ACCOUNTS_KEY]: {
      version: 1,
      updatedAt: TIMESTAMP,
      records: [persisted, inactive],
    },
  });

  const context = await resolveExecutionContext(env, {
    workspaceId: "workspace-a",
    connectedAccountId: persisted.id,
  });
  assert.equal(context.workspaceId, "workspace-a");
  assert.equal(context.connectedAccountId, persisted.id);
  assert.equal(context.connectedAccount.id, persisted.id);

  await expectCode(
    () => resolveExecutionContext(env, {
      workspaceId: "workspace-b",
      connectedAccountId: persisted.id,
    }),
    "connected_account_not_found"
  );
  await expectCode(
    () => resolveExecutionContext(env, { workspaceId: "workspace-a" }),
    "connected_account_not_found"
  );
  await expectCode(
    () => resolveExecutionContext(env, {
      workspaceId: "workspace-a",
      connectedAccountId: "threads-primary",
    }),
    "connected_account_not_found"
  );
  await expectCode(
    () => resolveExecutionContext(env, {
      workspaceId: "workspace-a",
      connectedAccountId: inactive.id,
    }),
    "connected_account_inactive"
  );
  assert.deepEqual(writes, []);
});

test("execution context identity is immutable and read-only", async () => {
  const persisted = account();
  const { env, writes } = createEnv({
    [CONNECTED_ACCOUNTS_KEY]: {
      version: 1,
      updatedAt: TIMESTAMP,
      records: [persisted],
    },
  });
  const context = await resolveExecutionContext(env, {
    workspaceId: persisted.workspaceId,
    connectedAccountId: persisted.id,
  });

  assert.throws(() => {
    context.workspaceId = "workspace-b";
  }, TypeError);
  assert.throws(() => {
    context.connectedAccountId = "other-account";
  }, TypeError);
  assert.throws(() => {
    context.connectedAccount.id = "other-account";
  }, TypeError);
  assert.throws(() => {
    context.connectedAccount.workspaceId = "workspace-b";
  }, TypeError);

  assert.equal(context.workspaceId, persisted.workspaceId);
  assert.equal(context.connectedAccountId, persisted.id);
  assert.equal(context.connectedAccount.id, persisted.id);
  assert.equal(context.connectedAccount.workspaceId, persisted.workspaceId);
  assert.deepEqual(writes, []);
});
