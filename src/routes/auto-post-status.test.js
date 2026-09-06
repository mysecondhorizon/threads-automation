import assert from "node:assert/strict";

import { handleAutoPostStatus } from "./auto-post-status.js";
import {
  ADMIN_SESSION_KEY_PREFIX,
  USERS_KEY,
  WORKSPACES_KEY,
} from "../services/login-foundation.js";

const CREATED_AT = "2026-09-06T00:00:00.000Z";
const EXPIRES_AT = "2099-09-06T00:00:00.000Z";

function createEnv(sessionId = "registered", selectedWorkspaceId = "workspace-a") {
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
      workspaces: [{
        id: "workspace-a",
        ownerUserId: "user-a",
        name: "Workspace A",
        active: true,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      }],
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

  return {
    THREADS_KV: {
      async get(key, type) {
        const value = values.get(key);
        if (value === undefined) return null;
        return type === "json" ? JSON.parse(value) : value;
      },
    },
    sessionId,
  };
}

function request(sessionId) {
  return new Request("https://example.test/admin/auto-post/status", {
    headers: { cookie: `admin_session=${sessionId}` },
  });
}

let receivedOptions = null;
const scoped = createEnv();
const scopedResponse = await handleAutoPostStatus(
  request(scoped.sessionId),
  scoped,
  {
    getStatus: async (_env, options) => {
      receivedOptions = options;
      return { isRunning:false, activeExecution:null, latestExecution:null, recentGeneralAutoExecutions:[] };
    },
  }
);
assert.equal(scopedResponse.status, 200);
assert.deepEqual(receivedOptions, { workspaceId:"workspace-a" });

receivedOptions = null;
const legacy = createEnv("legacy");
const legacyResponse = await handleAutoPostStatus(
  request(legacy.sessionId),
  legacy,
  {
    getStatus: async (_env, options) => {
      receivedOptions = options;
      return { isRunning:false, activeExecution:null, latestExecution:null, recentGeneralAutoExecutions:[] };
    },
  }
);
assert.equal(legacyResponse.status, 200);
assert.deepEqual(receivedOptions, { workspaceId:"default-workspace" });

console.log("workspace-aware auto post status route fixtures passed");
