import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  LoginFoundationError,
  getUserByLoginId,
  listWorkspacesForOwner,
  verifyUserPassword,
} from "./login-foundation.js";
import {
  RegisteredUserProvisioningError,
  provisionRegisteredUser,
} from "./registered-user-provisioning.js";
import { DEFAULT_WORKSPACE_ID } from "./workspace-foundation.js";

function createEnv({ failPutKey = null } = {}) {
  const values = new Map();
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
          if (key === failPutKey) throw new Error("simulated KV failure");
          values.set(key, value);
        },
      },
    },
  };
}

const options = {
  now: "2026-08-30T00:00:00.000Z",
  createUserId: () => "user-provisioned",
  createWorkspaceId: () => "workspace-provisioned",
};

test("provisioning creates an active User, password credential, and owned non-default Workspace", async () => {
  const { env } = createEnv();
  const result = await provisionRegisteredUser(env, {
    loginId: "  Operator@Example.Test  ",
    password: "correct horse battery staple",
    workspaceName: "Main Brand",
  }, options);

  assert.deepEqual(result, {
    userId: "user-provisioned",
    loginId: "operator@example.test",
    displayName: "operator@example.test",
    workspaceId: "workspace-provisioned",
    workspaceName: "Main Brand",
  });
  assert.equal(await verifyUserPassword(env, result.userId, "correct horse battery staple"), true);
  assert.deepEqual(await listWorkspacesForOwner(env, result.userId), [{
    id: "workspace-provisioned",
    ownerUserId: "user-provisioned",
    name: "Main Brand",
    active: true,
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  }]);
  assert.notEqual(result.workspaceId, DEFAULT_WORKSPACE_ID);
  assert.equal(result.displayName, result.loginId);
  assert.deepEqual(Object.keys(result).sort(), [
    "displayName",
    "loginId",
    "userId",
    "workspaceId",
    "workspaceName",
  ]);
});

test("provisioning rejects duplicate login ids and invalid passwords before creating a User", async () => {
  const { env } = createEnv();
  await provisionRegisteredUser(env, {
    loginId: "operator@example.test",
    password: "correct horse battery staple",
    workspaceName: "Main Brand",
  }, options);

  await assert.rejects(
    () => provisionRegisteredUser(env, {
      loginId: " OPERATOR@example.test ",
      password: "another password",
      workspaceName: "Another Brand",
    }, {
      ...options,
      createUserId: () => "user-second",
      createWorkspaceId: () => "workspace-second",
    }),
    (error) => error instanceof LoginFoundationError && error.code === "user_login_id_duplicate",
  );

  const invalid = createEnv();
  await assert.rejects(
    () => provisionRegisteredUser(invalid.env, {
      loginId: "invalid@example.test",
      password: "",
      workspaceName: "Invalid Brand",
    }, options),
    (error) => error instanceof LoginFoundationError && error.code === "password_invalid",
  );
  assert.equal(await getUserByLoginId(invalid.env, "invalid@example.test"), null);
});

test("provisioning reports a safe partial failure when Workspace creation cannot be persisted", async () => {
  const { env } = createEnv({ failPutKey: "operator_workspaces:v1" });

  await assert.rejects(
    () => provisionRegisteredUser(env, {
      loginId: "partial@example.test",
      password: "correct horse battery staple",
      workspaceName: "Partial Brand",
    }, options),
    (error) => {
      assert.equal(error instanceof RegisteredUserProvisioningError, true);
      assert.equal(error.partial, true);
      assert.deepEqual(error.details, {
        userId: "user-provisioned",
        loginId: "partial@example.test",
        displayName: "partial@example.test",
        stage: "Workspace creation",
      });
      return true;
    },
  );

  assert.equal(await verifyUserPassword(env, "user-provisioned", "correct horse battery staple"), true);
});

test("maintenance invocation derives displayName from loginId instead of accepting it", async () => {
  const script = await readFile(
    new URL("../../maintenance-provision-registered-user.js", import.meta.url),
    "utf8",
  );

  assert.match(script, /readOption\("--login-id"\)/u);
  assert.match(script, /readOption\("--workspace-name"\)/u);
  assert.doesNotMatch(script, /--display-name/u);
});
