import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_SESSION_KEY_PREFIX,
  USERS_KEY,
  WORKSPACES_KEY,
} from "../services/login-foundation.js";
import { WorkspaceCloneError } from "../services/workspace-clone.js";
import {
  handleAdminWorkspaceClone,
  handleAdminWorkspaceClonePreflight,
  handleAdminWorkspaceCloneReconcile,
} from "./admin-workspace-clone.js";

const NOW = "2026-08-30T00:00:00.000Z";
const EXPIRES = "2099-08-30T00:00:00.000Z";

function workspace({
  id = "workspace-registered",
  ownerUserId = "user-registered",
  active = true,
} = {}) {
  return {
    id,
    ownerUserId,
    name: `Workspace ${id}`,
    active,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createEnv(session = "legacy", { selectedWorkspaceId = "workspace-registered", workspaces } = {}) {
  const values = new Map();
  if (session === "legacy") values.set(`${ADMIN_SESSION_KEY_PREFIX}legacy`, "valid");
  if (session === "registered") {
    values.set(`${ADMIN_SESSION_KEY_PREFIX}registered`, JSON.stringify({
      version: 1,
      userId: "user-registered",
      selectedWorkspaceId,
      createdAt: NOW,
      expiresAt: EXPIRES,
    }));
    values.set(USERS_KEY, JSON.stringify({
      version: 1,
      users: [{
        id: "user-registered",
        loginId: "registered",
        displayName: "Registered User",
        active: true,
        createdAt: NOW,
        updatedAt: NOW,
      }],
    }));
    values.set(WORKSPACES_KEY, JSON.stringify({
      version: 1,
      workspaces: workspaces ?? [workspace()],
    }));
  }
  return {
    THREADS_KV: {
      async get(key, type) {
        const value = values.get(key);
        if (value === undefined) return null;
        return type === "json" ? JSON.parse(value) : value;
      },
    },
  };
}

function request(method = "POST", body = undefined, session = "legacy") {
  return new Request("https://example.test/admin/maintenance/workspace-clone", {
    method,
    headers: {
      ...(session === "none" ? {} : { cookie: `admin_session=${session}` }),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function validInput(overrides = {}) {
  return {
    sourceWorkspaceId: "default-workspace",
    destinationWorkspaceId: "workspace-next",
    confirm: "CLONE_WORKSPACE",
    ...overrides,
  };
}

test("workspace clone route rejects unauthenticated and registered sessions without calling the clone core", async () => {
  let calls = 0;
  const clone = async () => { calls += 1; };

  const unauthenticated = await handleAdminWorkspaceClone(request("POST", validInput(), "none"), createEnv("none"), { clone });
  const registered = await handleAdminWorkspaceClone(request("POST", validInput(), "registered"), createEnv("registered"), { clone });

  assert.equal(unauthenticated.status, 401);
  assert.equal(registered.status, 400);
  assert.equal(calls, 0);
});

test("registered session clones from Default Workspace into its owned active selection", async () => {
  let received = null;
  const result = await handleAdminWorkspaceClone(
    request("POST", { confirm: "CLONE_WORKSPACE" }, "registered"),
    createEnv("registered"),
    {
      clone: async (env, input) => {
        received = { env, input };
        return {
          ...input,
          operationId: "workspace_clone_safe",
          created: {},
        };
      },
    },
  );

  assert.equal(result.status, 200);
  assert.deepEqual(received.input, {
    sourceWorkspaceId: "default-workspace",
    destinationWorkspaceId: "workspace-registered",
  });
});

test("registered session runner rejects missing, default, foreign, inactive, and missing Workspace selections", async () => {
  let calls = 0;
  const clone = async () => { calls += 1; };
  const body = { confirm: "CLONE_WORKSPACE" };
  const cases = [
    [null, []],
    ["default-workspace", []],
    ["workspace-foreign", [workspace({ id: "workspace-foreign", ownerUserId: "user-other" })]],
    ["workspace-inactive", [workspace({ id: "workspace-inactive", active: false })]],
    ["workspace-missing", []],
  ];

  for (const [selectedWorkspaceId, workspaces] of cases) {
    const response = await handleAdminWorkspaceClone(
      request("POST", body, "registered"),
      createEnv("registered", { selectedWorkspaceId, workspaces }),
      { clone },
    );
    assert.equal(response.status, 400);
  }
  assert.equal(calls, 0);
});

test("registered session runner rejects caller workspace ids and wrong confirmation without calling clone core", async () => {
  let calls = 0;
  const clone = async () => { calls += 1; };
  const env = createEnv("registered");
  const suppliedDestination = await handleAdminWorkspaceClone(
    request("POST", {
      confirm: "CLONE_WORKSPACE",
      destinationWorkspaceId: "workspace-attacker",
    }, "registered"),
    env,
    { clone },
  );
  const wrongConfirmation = await handleAdminWorkspaceClone(
    request("POST", { confirm: "wrong" }, "registered"),
    env,
    { clone },
  );

  assert.equal(suppliedDestination.status, 400);
  assert.equal(wrongConfirmation.status, 400);
  assert.equal(calls, 0);
});

test("registered session preflight returns only selected Workspace occupancy without clone invocation", async () => {
  let cloneCalls = 0;
  const response = await handleAdminWorkspaceClonePreflight(
    request("GET", undefined, "registered"),
    createEnv("registered"),
    {
      inspect: async (_env, workspaceId) => {
        assert.equal(workspaceId, "workspace-registered");
        return {
          promptProfile: { empty: false },
          products: { empty: false, count: 2, records: ["secret"] },
          media: { empty: true, count: 0, records: ["secret"] },
          contentPool: { empty: false, count: 1, records: ["secret"] },
          destinationEmpty: false,
        };
      },
      compare: async () => ({
        promptProfile: { sourceExists: true, destinationExists: true, equivalent: true, raw: "secret" },
        products: { sourceCount: 2, destinationCount: 2, equivalentCount: 2, destinationOnlyCount: 0, sourceOnlyCount: 0, records: ["secret"] },
        media: { sourceCount: 1, destinationCount: 0, equivalentCount: 0, destinationOnlyCount: 0, sourceOnlyCount: 1, records: ["secret"] },
        contentPool: { sourceCount: 1, destinationCount: 1, equivalentCount: 0, destinationOnlyCount: 1, sourceOnlyCount: 1, records: ["secret"] },
      }),
      clone: async () => { cloneCalls += 1; },
    },
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(payload, {
    ok: true,
    destination: { workspaceId: "workspace-registered", name: "Workspace workspace-registered" },
    stores: {
      promptProfile: { empty: false },
      products: { empty: false, count: 2 },
      media: { empty: true, count: 0 },
      contentPool: { empty: false, count: 1 },
    },
    destinationEmpty: false,
    comparison: {
      promptProfile: { sourceExists: true, destinationExists: true, equivalent: true },
      products: { sourceCount: 2, destinationCount: 2, equivalentCount: 2, destinationOnlyCount: 0, sourceOnlyCount: 0 },
      media: { sourceCount: 1, destinationCount: 0, equivalentCount: 0, destinationOnlyCount: 0, sourceOnlyCount: 1 },
      contentPool: { sourceCount: 1, destinationCount: 1, equivalentCount: 0, destinationOnlyCount: 1, sourceOnlyCount: 1 },
    },
  });
  assert.equal(JSON.stringify(payload).includes("secret"), false);
  assert.equal(cloneCalls, 0);
});

test("registered session preflight rejects legacy, missing, default, foreign, inactive, and missing Workspace selections", async () => {
  const legacy = await handleAdminWorkspaceClonePreflight(request("GET"), createEnv());
  assert.equal(legacy.status, 403);

  const cases = [
    [null, []],
    ["default-workspace", []],
    ["workspace-foreign", [workspace({ id: "workspace-foreign", ownerUserId: "user-other" })]],
    ["workspace-inactive", [workspace({ id: "workspace-inactive", active: false })]],
    ["workspace-missing", []],
  ];
  for (const [selectedWorkspaceId, workspaces] of cases) {
    const response = await handleAdminWorkspaceClonePreflight(
      request("GET", undefined, "registered"),
      createEnv("registered", { selectedWorkspaceId, workspaces }),
    );
    assert.equal(response.status, 400);
  }
});

test("registered session reconciliation uses only the selected Workspace and returns sanitized counts", async () => {
  let received = null;
  const response = await handleAdminWorkspaceCloneReconcile(
    request("POST", { confirm: "RECONCILE_WORKSPACE" }, "registered"),
    createEnv("registered"),
    {
      reconcile: async (_env, input) => {
        received = input;
        return { created: { products: 0, media: 0, contentPool: 1, promptProfile: 0, raw: "secret" } };
      },
    },
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(received, {
    sourceWorkspaceId: "default-workspace",
    destinationWorkspaceId: "workspace-registered",
  });
  assert.deepEqual(payload, {
    ok: true,
    created: { products: 0, media: 0, contentPool: 1, promptProfile: 0 },
  });
  assert.equal(JSON.stringify(payload).includes("secret"), false);
});

test("reconciliation rejects caller Workspace ids and wrong confirmation without invoking service", async () => {
  let calls = 0;
  const reconcile = async () => { calls += 1; };
  const env = createEnv("registered");
  const suppliedDestination = await handleAdminWorkspaceCloneReconcile(
    request("POST", { confirm: "RECONCILE_WORKSPACE", destinationWorkspaceId: "workspace-attacker" }, "registered"),
    env,
    { reconcile },
  );
  const wrongConfirmation = await handleAdminWorkspaceCloneReconcile(
    request("POST", { confirm: "wrong" }, "registered"),
    env,
    { reconcile },
  );
  assert.equal(suppliedDestination.status, 400);
  assert.equal(wrongConfirmation.status, 400);
  assert.equal(calls, 0);
});

test("workspace clone route is POST-only and rejects invalid confirmation or required ids without mutation", async () => {
  let calls = 0;
  const clone = async () => { calls += 1; };
  const env = createEnv();

  const get = await handleAdminWorkspaceClone(request("GET", undefined), env, { clone });
  const wrongConfirmation = await handleAdminWorkspaceClone(request("POST", validInput({ confirm: "wrong" })), env, { clone });
  const missingSource = await handleAdminWorkspaceClone(request("POST", validInput({ sourceWorkspaceId: "" })), env, { clone });
  const missingDestination = await handleAdminWorkspaceClone(request("POST", validInput({ destinationWorkspaceId: null })), env, { clone });
  const extraInput = await handleAdminWorkspaceClone(request("POST", validInput({ userId: "untrusted" })), env, { clone });

  assert.equal(get.status, 405);
  assert.equal(wrongConfirmation.status, 400);
  assert.equal(missingSource.status, 400);
  assert.equal(missingDestination.status, 400);
  assert.equal(extraInput.status, 400);
  assert.equal(calls, 0);
});

test("legacy admin session passes exact ids to the clone core and receives only sanitized result data", async () => {
  let received = null;
  const response = await handleAdminWorkspaceClone(request("POST", validInput()), createEnv(), {
    clone: async (env, input) => {
      received = { env, input };
      return {
        sourceWorkspaceId: input.sourceWorkspaceId,
        destinationWorkspaceId: input.destinationWorkspaceId,
        operationId: "workspace_clone_safe",
        created: {
          promptProfilePersisted: true,
          productIds: ["product-safe"],
          mediaIds: ["media-safe"],
          contentPoolIds: ["pool-safe"],
          objectKeys: ["media/clone/safe"],
          authRef: "threads_auth",
          credential: "secret",
        },
      };
    },
  });
  const payload = await response.json();

  assert.deepEqual(received.input, {
    sourceWorkspaceId: "default-workspace",
    destinationWorkspaceId: "workspace-next",
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(payload.created, {
    promptProfilePersisted: true,
    productIds: ["product-safe"],
    mediaIds: ["media-safe"],
    contentPoolIds: ["pool-safe"],
    objectKeys: ["media/clone/safe"],
  });
  assert.equal(JSON.stringify(payload).includes("threads_auth"), false);
  assert.equal(JSON.stringify(payload).includes("secret"), false);
  assert.equal(JSON.stringify(payload).includes("session"), false);
});

test("workspace clone route sanitizes preflight and partial clone errors", async () => {
  const preflight = await handleAdminWorkspaceClone(request("POST", validInput()), createEnv(), {
    clone: async () => {
      throw new WorkspaceCloneError("raw detail", {
        code: "workspace_clone_destination_not_empty",
        stage: "preflight",
      });
    },
  });
  const partial = await handleAdminWorkspaceClone(request("POST", validInput()), createEnv(), {
    clone: async () => {
      throw new WorkspaceCloneError("raw detail", {
        code: "workspace_clone_partial",
        stage: "r2_copy",
        created: {
          promptProfilePersisted: true,
          productIds: ["product-safe"],
          mediaIds: ["media-safe"],
          contentPoolIds: ["pool-safe"],
          objectKeys: ["media/clone/safe"],
          authRef: "threads_auth",
        },
      });
    },
  });

  assert.deepEqual(await preflight.json(), {
    ok: false,
    error: "Workspace clone failed",
    code: "workspace_clone_destination_not_empty",
    stage: "preflight",
  });
  const partialPayload = await partial.json();
  assert.equal(partial.status, 500);
  assert.equal(partialPayload.stage, "r2_copy");
  assert.deepEqual(partialPayload.created.objectKeys, ["media/clone/safe"]);
  assert.equal(JSON.stringify(partialPayload).includes("threads_auth"), false);
  assert.equal(JSON.stringify(partialPayload).includes("raw detail"), false);
});
