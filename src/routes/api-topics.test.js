import assert from "node:assert/strict";
import test from "node:test";
import { handleTopics } from "./api-topics.js";
import { handleAppWritePage } from "./app-write-page.js";

function env(authenticated = true) {
  return {
    THREADS_KV: {
      async get(key) {
        return authenticated && key === "admin_session:session-1" ? "valid" : null;
      },
    },
  };
}

const inventory = {
  capturedAt: "2026-08-20T00:00:00.000Z",
  topics: [{
    id: "topic-1",
    subject: "새로운 기능",
    personaRelevance: "일상에서 가볍게 이야기할 수 있는 변화",
    talkingPoints: ["짧은 이야기"],
    capturedAt: "2026-08-20T00:00:00.000Z",
  }],
};

const unauthenticated = await handleTopics(new Request("https://example.test/api/topics"), env(false));
assert.equal(unauthenticated.status, 401);

const listed = await handleTopics(new Request("https://example.test/api/topics", {
  headers: { cookie: "admin_session=session-1" },
}), env(), {
  readInventory: async () => inventory,
});
assert.deepEqual((await listed.json()).topics, [{
  id: "topic-1",
  title: "새로운 기능",
  summary: "일상에서 가볍게 이야기할 수 있는 변화",
  updatedAt: "2026-08-20T00:00:00.000Z",
}]);

let refreshed = 0;
const refreshedResponse = await handleTopics(new Request("https://example.test/api/topics/refresh", { method: "POST", headers: { cookie: "admin_session=session-1" } }), env(), {
  refreshInventory: async () => { refreshed += 1; return inventory; },
  readInventory: async () => inventory,
});
assert.equal(refreshedResponse.status, 200);
assert.equal(refreshed, 1);
console.log("topics API fixture passed");

function personal(selectedWorkspaceId = "default-workspace") {
  const user = { id: "owner", loginId: "owner", displayName: "Owner", active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" };
  const values = new Map([
    ["admin_session:personal", JSON.stringify({ version: 1, userId: "owner", selectedWorkspaceId, createdAt: "2026-01-01", expiresAt: "2099-01-01" })],
    ["operator_users:v1", JSON.stringify({ version: 1, users: [user] })],
    ["operator_workspaces:v1", JSON.stringify({ version: 1, workspaces: [{ id: "other-space", ownerUserId: "owner", name: "Other", active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" }] })],
    ["platform_operator_grants:v1", JSON.stringify({ version: 1, grants: [{ userId: "owner", active: true }] })],
  ]);
  return { values, user, env: { LEGACY_WORKSPACE_OWNER_USER_ID: "owner", THREADS_KV: {
    async get(key, type) { const v = values.get(key) ?? null; return type === "json" && v !== null ? JSON.parse(v) : v; },
  } } };
}
function personalRequest(method = "GET", origin = "https://example.test") {
  return new Request("https://example.test/api/topics" + (method === "POST" ? "/refresh" : ""), {
    method, headers: { cookie: "admin_session=personal", ...(origin === null ? {} : { origin }) },
  });
}

test("assigned default owner can read the existing inventory with only the topic projection", async () => {
  const { env } = personal();
  let reads = 0;
  const response = await handleTopics(personalRequest(), env, {
    readInventory: async () => { reads++; return { ...inventory, privateField: "PRIVATE_SENTINEL", topics: inventory.topics.map(t => ({ ...t, privateField: "PRIVATE_SENTINEL" })) }; },
    refreshInventory: async () => { throw Error("GET must not refresh"); },
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.topics[0].id, "topic-1");
  assert.deepEqual(Object.keys(result.topics[0]).sort(), ["id", "summary", "title", "updatedAt"]);
  assert.equal(JSON.stringify(result).includes("PRIVATE_SENTINEL"), false);
  assert.equal(reads, 1);
});

test("assigned default owner refresh requires same-origin and uses only the existing injected flow", async () => {
  const { env } = personal();
  let reads = 0, refreshes = 0;
  const deps = { readInventory: async () => { reads++; return inventory; }, refreshInventory: async () => { refreshes++; } };
  for (const origin of [null, "null", "https://foreign.test"]) {
    assert.equal((await handleTopics(personalRequest("POST", origin), env, deps)).status, 403);
  }
  assert.equal(reads, 0);
  assert.equal(refreshes, 0);
  assert.equal((await handleTopics(personalRequest("POST"), env, deps)).status, 200);
  assert.equal(reads, 1);
  assert.equal(refreshes, 1);
});

test("unassigned, null, other-workspace and revoked users cannot read or refresh the global inventory", async () => {
  const cases = [personal(null), personal("other-space"), personal(), personal(), personal()];
  delete cases[2].env.LEGACY_WORKSPACE_OWNER_USER_ID;
  cases[3].env.LEGACY_WORKSPACE_OWNER_USER_ID = "different-user";
  cases[4].values.set("operator_users:v1", JSON.stringify({ version: 1, users: [{ ...cases[4].user, active: false }] }));
  for (const { env } of cases) {
    let called = false;
    const deps = { readInventory: async () => { called = true; return inventory; }, refreshInventory: async () => { called = true; } };
    for (const method of ["GET", "POST"]) assert.notEqual((await handleTopics(personalRequest(method), env, deps)).status, 200);
    assert.equal(called, false);
  }
});

test("write page explains Topic availability only for the explicitly assigned default owner", async () => {
  const allowed = await (await handleAppWritePage(personalRequest(), personal().env)).text();
  assert.match(allowed, /기존 운영 공간의 Topic 조회·가져오기를 사용할 수 있습니다/u);
  const other = await (await handleAppWritePage(personalRequest(), personal("other-space").env)).text();
  assert.match(other, /Topic 조회·새로고침은 현재 개인 계정에서 사용할 수 없습니다/u);
});
