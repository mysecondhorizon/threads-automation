import assert from "node:assert/strict";
import { handleTopics } from "./api-topics.js";

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
