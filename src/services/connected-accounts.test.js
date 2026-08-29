import assert from "node:assert/strict";
import test from "node:test";

import {
  CONNECTED_ACCOUNTS_KEY,
  ConnectedAccountError,
  getThreadsCredentialForAccount,
  resolveConnectedAccount,
  resolveCredentialRef,
} from "./connected-accounts.js";

import {
  DEFAULT_WORKSPACE_ID,
  LEGACY_THREADS_AUTH_REF,
} from "./workspace-foundation.js";

const TIMESTAMP =
  "2026-08-29T00:00:00.000Z";

function account(
  overrides = {}
) {
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

function createEnv(
  initialValues = {}
) {
  const values = new Map(
    Object.entries(initialValues).map(
      ([key, value]) => [
        key,
        JSON.stringify(value),
      ]
    )
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
          return type === "json"
            ? JSON.parse(value)
            : value;
        },
        async put(key, value) {
          writes.push({ key, value });
          values.set(key, value);
        },
      },
    },
  };
}

async function expectCode(
  operation,
  code
) {
  await assert.rejects(
    operation,
    (error) =>
      error instanceof ConnectedAccountError &&
      error.code === code
  );
}

test("legacy Default Workspace resolution is synthetic and read-only", async () => {
  const { env, values, writes } =
    createEnv({
      threads_auth: {
        access_token: "legacy-token",
        user_id: "legacy-user",
      },
    });

  const omitted =
    await resolveConnectedAccount(env);
  const nulls =
    await resolveConnectedAccount(
      env,
      {
        workspaceId: null,
        connectedAccountId: null,
      }
    );
  const explicit =
    await resolveConnectedAccount(
      env,
      {
        workspaceId: DEFAULT_WORKSPACE_ID,
        connectedAccountId: "threads-primary",
      }
    );

  for (const resolved of [
    omitted,
    nulls,
    explicit,
  ]) {
    assert.equal(
      resolved.id,
      "threads-primary"
    );
    assert.equal(
      resolved.workspaceId,
      DEFAULT_WORKSPACE_ID
    );
    assert.equal(
      resolved.platform,
      "THREADS"
    );
    assert.equal(
      resolveCredentialRef(resolved),
      LEGACY_THREADS_AUTH_REF
    );
  }

  const resolved =
    await getThreadsCredentialForAccount(env);
  assert.equal(
    resolved.account.id,
    "threads-primary"
  );
  assert.deepEqual(
    resolved.credential,
    {
      access_token: "legacy-token",
      user_id: "legacy-user",
    }
  );
  assert.deepEqual(writes, []);
  assert.equal(
    values.has(
      CONNECTED_ACCOUNTS_KEY
    ),
    false
  );
});

test("legacy credential absence fails closed", async () => {
  const { env } = createEnv();

  await expectCode(
    () => getThreadsCredentialForAccount(env),
    "connected_account_credential_missing"
  );
});

test("non-default Workspaces never receive implicit threads-primary", async () => {
  const { env } = createEnv();

  await expectCode(
    () => resolveConnectedAccount(env, {
      workspaceId: "workspace-a",
    }),
    "connected_account_not_found"
  );
  await expectCode(
    () => resolveConnectedAccount(env, {
      workspaceId: "workspace-a",
      connectedAccountId: "threads-primary",
    }),
    "connected_account_not_found"
  );
});

test("persisted account resolution is Workspace-isolated", async () => {
  const persisted = account();
  const { env } = createEnv({
    [CONNECTED_ACCOUNTS_KEY]: {
      version: 1,
      updatedAt: TIMESTAMP,
      records: [persisted],
    },
  });

  assert.deepEqual(
    await resolveConnectedAccount(env, {
      workspaceId: "workspace-a",
      connectedAccountId: persisted.id,
    }),
    persisted
  );

  await expectCode(
    () => resolveConnectedAccount(env, {
      workspaceId: "workspace-b",
      connectedAccountId: persisted.id,
    }),
    "connected_account_not_found"
  );
});

test("persisted Threads accounts use only their explicit credential reference", async () => {
  const persisted = account();
  const { env } = createEnv({
    [CONNECTED_ACCOUNTS_KEY]: {
      version: 1,
      updatedAt: TIMESTAMP,
      records: [persisted],
    },
    threads_auth: {
      access_token: "must-not-fallback",
    },
    [persisted.authRef]: {
      access_token: "workspace-a-token",
    },
  });

  const resolved =
    await getThreadsCredentialForAccount(env, {
      workspaceId: "workspace-a",
      connectedAccountId: persisted.id,
    });

  assert.equal(
    resolved.credential.access_token,
    "workspace-a-token"
  );
});

test("persisted account credential failures are fail-closed", async () => {
  const missingAuthRef =
    account({
      id: "threads-no-auth-ref",
      authRef: null,
    });
  const missingCredential =
    account({
      id: "threads-missing-credential",
      authRef: "connected_account_auth:threads-missing-credential",
    });
  const inactive =
    account({
      id: "threads-inactive",
      active: false,
    });
  const unsupported =
    account({
      id: "youtube-workspace-a",
      platform: "YOUTUBE",
      authRef: "connected_account_auth:youtube-workspace-a",
    });
  const { env } = createEnv({
    [CONNECTED_ACCOUNTS_KEY]: {
      version: 1,
      updatedAt: TIMESTAMP,
      records: [
        missingAuthRef,
        missingCredential,
        inactive,
        unsupported,
      ],
    },
    threads_auth: {
      access_token: "must-not-fallback",
    },
  });

  await expectCode(
    () => getThreadsCredentialForAccount(env, {
      workspaceId: "workspace-a",
      connectedAccountId: missingAuthRef.id,
    }),
    "connected_account_auth_unconfigured"
  );
  await expectCode(
    () => getThreadsCredentialForAccount(env, {
      workspaceId: "workspace-a",
      connectedAccountId: missingCredential.id,
    }),
    "connected_account_credential_missing"
  );
  await expectCode(
    () => getThreadsCredentialForAccount(env, {
      workspaceId: "workspace-a",
      connectedAccountId: inactive.id,
    }),
    "connected_account_inactive"
  );
  await expectCode(
    () => getThreadsCredentialForAccount(env, {
      workspaceId: "workspace-a",
      connectedAccountId: unsupported.id,
    }),
    "connected_account_platform_unsupported"
  );
});

test("missing, malformed, and duplicate registry records fail closed", async () => {
  const valid = account({
    id: "duplicate-account",
    authRef: "connected_account_auth:duplicate-account",
  });
  const duplicate = {
    ...valid,
    displayName: "Duplicate account",
  };
  const malformed = {
    id: "malformed-account",
    workspaceId: "workspace-a",
    platform: "THREADS",
    active: true,
  };

  const { env } = createEnv({
    [CONNECTED_ACCOUNTS_KEY]: {
      version: 1,
      updatedAt: TIMESTAMP,
      records: [valid, duplicate, malformed],
    },
  });

  await expectCode(
    () => resolveConnectedAccount(env, {
      workspaceId: "workspace-a",
      connectedAccountId: "missing-account",
    }),
    "connected_account_not_found"
  );
  await expectCode(
    () => resolveConnectedAccount(env, {
      workspaceId: "workspace-a",
      connectedAccountId: "malformed-account",
    }),
    "connected_account_not_found"
  );
  await expectCode(
    () => resolveConnectedAccount(env, {
      workspaceId: "workspace-a",
      connectedAccountId: valid.id,
    }),
    "connected_account_ambiguous"
  );
});

test("workspace validation fails explicitly", async () => {
  const { env } = createEnv();

  await expectCode(
    () => resolveConnectedAccount(env, {
      workspaceId: " ",
    }),
    "connected_account_workspace_invalid"
  );
});
