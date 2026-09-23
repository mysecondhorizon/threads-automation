import assert from "node:assert/strict";

import { handleDashboard } from "./dashboard.js";
import {
  ADMIN_SESSION_KEY_PREFIX,
  USERS_KEY,
  WORKSPACES_KEY,
} from "../services/login-foundation.js";

const CREATED_AT = "2026-09-23T00:00:00.000Z";
const EXPIRES_AT = "2099-09-23T00:00:00.000Z";

function request(sessionId) {
  return new Request("https://example.test/admin/dashboard", {
    headers: { cookie: `admin_session=${sessionId}` },
  });
}

function registeredEnv() {
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
      selectedWorkspaceId: "workspace-a",
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
    })],
    ["post_log:foreign", JSON.stringify({
      status: "published",
      post_id: "workspace-b-post",
      text: "WORKSPACE_B_PRIVATE_TEXT",
      metadata: { workspaceId: "workspace-b" },
      created_at: CREATED_AT,
    })],
    ["post_insight:workspace-b-post", JSON.stringify({ views: 987654 })],
  ]);
  let listCalls = 0;
  return {
    env: {
      THREADS_KV: {
        async get(key, type) {
          const value = values.get(key);
          if (value === undefined) return null;
          return type === "json" ? JSON.parse(value) : value;
        },
        async list() {
          listCalls += 1;
          throw new Error("dashboard data lookup must not run for a registered session");
        },
      },
    },
    getListCalls: () => listCalls,
  };
}

const registered = registeredEnv();
const blocked = await handleDashboard(request("registered"), registered.env);
assert.equal(blocked.status, 403);
assert.equal(blocked.headers.get("cache-control"), "no-store");
const blockedBody = await blocked.text();
assert.equal(blockedBody.includes("WORKSPACE_B_PRIVATE_TEXT"), false);
assert.equal(blockedBody.includes("987654"), false);
assert.equal(registered.getListCalls(), 0);

const legacyEnv = {
  THREADS_KV: {
    async get(key, type) {
      const value = key === `${ADMIN_SESSION_KEY_PREFIX}legacy` ? "valid" : null;
      return type === "json" && value ? JSON.parse(value) : value;
    },
    async list() {
      return { keys: [] };
    },
  },
};
const allowed = await handleDashboard(request("legacy"), legacyEnv);
assert.equal(allowed.status, 200);
assert.match(await allowed.text(), /Second Horizon Dashboard/);

console.log("legacy-only dashboard access fixtures passed");
