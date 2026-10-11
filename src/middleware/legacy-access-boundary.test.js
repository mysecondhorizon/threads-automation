import assert from "node:assert/strict";
import test from "node:test";
import { requireAdminApiSession, requireAdminSession, requireLegacyAdminSession } from "./auth.js";
import { ADMIN_SESSION_KEY_PREFIX, USERS_KEY, WORKSPACES_KEY, createStructuredAdminSessionValue } from "../services/login-foundation.js";
import { DEFAULT_WORKSPACE_ID } from "../services/workspace-foundation.js";
import { PLATFORM_OPERATOR_GRANTS_KEY } from "../services/platform-operators.js";
import { handleShortToken, handleTokenExchange, handleProfile } from "../routes/tokens.js";
import { handleAppsCollection, handleAppById } from "../routes/api-apps.js";
import { handleTopics } from "../routes/api-topics.js";
import { handleAdminHomePage, handleEndpointOverviewPage } from "../routes/admin-overview.js";
import { handleAppAppsPage } from "../routes/app-apps-page.js";
import { handleMediaManagementPage } from "../routes/media-management-page.js";
import { handleDashboard } from "../routes/dashboard.js";
import { handleAdminPostPage } from "../routes/admin.js";
import { handleAppWritePage } from "../routes/app-write-page.js";

const sessionKey = ADMIN_SESSION_KEY_PREFIX + "boundary-session";
const stamp = "2026-01-01T00:00:00.000Z";
function fixture(selection = null, { legacy = false, grant = false } = {}) {
  const values = new Map([
    [sessionKey, legacy ? "valid" : createStructuredAdminSessionValue("user-a", selection, { now: Date.now(), ttlSeconds: 3600 })],
    [USERS_KEY, { version: 1, users: [{ id: "user-a", loginId: "owner", displayName: "Owner", active: true, createdAt: stamp, updatedAt: stamp }] }],
    [WORKSPACES_KEY, { version: 1, workspaces: [
      { id: "owned", ownerUserId: "user-a", name: "Owned", active: true, createdAt: stamp, updatedAt: stamp },
      { id: "foreign", ownerUserId: "user-b", name: "Foreign", active: true, createdAt: stamp, updatedAt: stamp },
      { id: "inactive", ownerUserId: "user-a", name: "Inactive", active: false, createdAt: stamp, updatedAt: stamp },
    ] }],
    [PLATFORM_OPERATOR_GRANTS_KEY, { version: 1, grants: grant ? [{ userId: "user-a", active: true }] : [] }],
  ]);
  const calls = { reads: [], writes: 0, deletes: 0, lists: 0 };
  const env = { THREADS_KV: {
    async get(key, type) {
      calls.reads.push(key);
      assert.ok(values.has(key), `Unexpected data access: ${key}`);
      const value = values.get(key);
      return type === "json" ? structuredClone(value) : typeof value === "string" ? value : JSON.stringify(value);
    },
    async put() { calls.writes++; throw new Error("Unexpected write"); },
    async delete() { calls.deletes++; throw new Error("Unexpected delete"); },
    async list() { calls.lists++; throw new Error("Unexpected list"); },
  } };
  return { env, values, calls };
}
function request(path = "/api/apps", method = "GET", authenticated = true) {
  return new Request(`https://example.test${path}`, {
    method, headers: authenticated ? { cookie: "admin_session=boundary-session" } : {},
    ...(method === "POST" || method === "PATCH" ? { body: "{}" } : {}),
  });
}
function noEffects(calls) {
  assert.equal(calls.writes, 0);
  assert.equal(calls.deletes, 0);
  assert.equal(calls.lists, 0);
}

test("legacy-only API guard rejects every structured selection even with a platform grant", async () => {
  for (const selection of [null, DEFAULT_WORKSPACE_ID, "owned", "foreign", "inactive", "missing"]) {
    for (const grant of [false, true]) {
      const f = fixture(selection, { grant });
      const result = await requireAdminApiSession(request(), f.env);
      assert.equal(result.ok, false);
      assert.equal(result.response.status, 409);
      assert.deepEqual(f.calls.reads, [sessionKey, USERS_KEY]);
      noEffects(f.calls);
    }
  }
});

test("workspace-aware API guard requires an active owned non-default selection", async () => {
  for (const selection of [null, DEFAULT_WORKSPACE_ID, "foreign", "inactive", "missing"]) {
    const f = fixture(selection);
    const result = await requireAdminApiSession(request(), f.env, { allowSelectedWorkspace: true });
    assert.equal(result.ok, false, String(selection));
    assert.equal(result.response.status, 409);
    noEffects(f.calls);
  }
  const f = fixture("owned");
  const result = await requireAdminApiSession(request(), f.env, { allowSelectedWorkspace: true });
  assert.equal(result.ok, true);
  assert.equal(result.workspaceId, "owned");
  noEffects(f.calls);
});

test("legacy API access remains compatible and missing login remains unauthorized", async () => {
  const f = fixture(null, { legacy: true });
  assert.equal((await requireAdminApiSession(request(), f.env)).ok, true);
  const scoped = await requireAdminApiSession(request(), f.env, { allowSelectedWorkspace: true });
  assert.equal(scoped.ok, true);
  assert.equal(scoped.workspaceId, DEFAULT_WORKSPACE_ID);
  const absent = await requireAdminApiSession(request("/api/apps", "GET", false), f.env);
  assert.equal(absent.response.status, 401);
  noEffects(f.calls);
});

test("legacy page guard blocks personal sessions without breaking the shared login guard", async () => {
  for (const selection of [null, DEFAULT_WORKSPACE_ID, "owned"]) {
    const f = fixture(selection, { grant: true });
    assert.equal((await requireAdminSession(request("/admin"), f.env)).ok, true);
    const result = await requireLegacyAdminSession(request("/admin"), f.env);
    assert.equal(result.ok, false);
    assert.equal(result.response.status, 403);
    noEffects(f.calls);
  }
  const f = fixture(null, { legacy: true });
  assert.equal((await requireLegacyAdminSession(request("/admin"), f.env)).ok, true);
  const absent = await requireLegacyAdminSession(request("/admin", "GET", false), f.env);
  assert.equal(absent.response.status, 302);
  assert.equal(absent.response.headers.get("location"), "https://example.test/admin/login");
});

test("direct global handlers deny personal sessions before credentials, data, or side effects", async (t) => {
  let fetches = 0;
  t.mock.method(globalThis, "fetch", async () => { fetches++; throw new Error("Unexpected external call"); });
  let topicReads = 0;
  let topicRefreshes = 0;
  const topics = (req, env) => handleTopics(req, env, {
    async readInventory() { topicReads++; throw new Error("Unexpected inventory read"); },
    async refreshInventory() { topicRefreshes++; throw new Error("Unexpected inventory refresh"); },
  });
  const routes = [
    [handleShortToken, "/admin/token", "GET"],
    [handleTokenExchange, "/admin/exchange-token", "GET"],
    [handleProfile, "/admin/me", "GET"],
    [handleAppsCollection, "/api/apps", "GET"],
    [handleAppsCollection, "/api/apps", "POST"],
    ...["GET", "PATCH", "DELETE"].map(method => [(req, env) => handleAppById(req, env, "threads"), "/api/apps/threads", method]),
    [topics, "/api/topics", "GET"],
    [topics, "/api/topics/refresh", "POST"],
  ];
  for (const selection of [null, DEFAULT_WORKSPACE_ID, "owned"]) {
    for (const grant of [false, true]) {
      for (const [handler, path, method] of routes) {
        const f = fixture(selection, { grant });
        const response = await handler(request(path, method), f.env);
        assert.equal(response.status, 409, `${method} ${path}, selection=${selection}, grant=${grant}`);
        assert.deepEqual(f.calls.reads, [sessionKey, USERS_KEY]);
        noEffects(f.calls);
      }
    }
  }
  assert.equal(fetches, 0);
  assert.equal(topicReads, 0);
  assert.equal(topicRefreshes, 0);
});

const legacyPages = [
  [handleAdminHomePage, "/admin"],
  [handleEndpointOverviewPage, "/admin/endpoints"],
  [handleAppAppsPage, "/app/apps"],
  [handleMediaManagementPage, "/admin/media-page"],
  [handleAdminPostPage, "/admin/post"],
  [handleDashboard, "/admin/dashboard"],
];

test("legacy page handlers deny personal sessions before reading operational data", async () => {
  for (const selection of [null, DEFAULT_WORKSPACE_ID, "owned"]) {
    for (const [handler, path] of legacyPages) {
      const f = fixture(selection, { grant: true });
      const response = await handler(request(path), f.env);
      assert.equal(response.status, 403, `${path}, selection=${selection}`);
      assert.deepEqual(f.calls.reads, [sessionKey, USERS_KEY]);
      noEffects(f.calls);
    }
  }
});

test("legacy lightweight pages still render and unauthenticated pages redirect", async () => {
  for (const [handler, path] of legacyPages) {
    const f = fixture(null, { legacy: true });
    const absent = await handler(request(path, "GET", false), f.env);
    assert.equal(absent.status, 302, path);
    assert.equal(absent.headers.get("location"), "https://example.test/admin/login");
    assert.deepEqual(f.calls.reads, []);
    if (handler !== handleDashboard) {
      const response = await handler(request(path), f.env);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get("content-type"), /text\/html/);
      assert.match(await response.text(), /<html/i);
      assert.deepEqual(f.calls.reads, [sessionKey]);
    }
    noEffects(f.calls);
  }
});

test("personal write page preserves owned workspace access and explains unavailable shared features", async () => {
  const f = fixture("owned");
  const response = await handleAppWritePage(request("/app/write"), f.env);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /공용 앱 설정과 Topic 조회·새로고침은 현재 개인 계정에서 사용할 수 없습니다/);
  assert.match(body, /내 작업공간의 글 작성·저장 기능은 계속 사용할 수 있습니다/);
  assert.ok(f.calls.reads.every(key => [sessionKey, USERS_KEY, WORKSPACES_KEY].includes(key)));
  noEffects(f.calls);
  for (const selection of [null, DEFAULT_WORKSPACE_ID]) {
    const denied = fixture(selection);
    assert.equal((await handleAppWritePage(request("/app/write"), denied.env)).status, 409);
    noEffects(denied.calls);
  }
});
