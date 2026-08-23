import assert from "node:assert/strict";
import { handlePostGenerate } from "./api-post-generate.js";

function env() {
  const values = new Map([["admin_session:session-1", "valid"]]);
  return {
    values,
    THREADS_KV: {
      async get(key) { return values.get(key) ?? null; },
      async put(key, value) { values.set(key, value); },
    },
  };
}

const topic = {
  id: "topic-1",
  subject: "새로운 기능",
  category: "apps_services",
  verifiedFacts: ["확인된 사실"],
  talkingPoints: ["일상 표현"],
  personaRelevance: "생활과 관련 있습니다.",
  allowedAngles: ["편리함"],
  forbiddenClaims: [],
  capturedAt: "2026-08-20T00:00:00.000Z",
  expiresAt: "2026-08-21T00:00:00.000Z",
};

function request(body, authenticated = true) {
  return new Request("https://example.test/api/posts/generate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authenticated ? { cookie: "admin_session=session-1" } : {}),
    },
    body: JSON.stringify(body),
  });
}

let receivedContext = null;
const services = {
  readInventory: async () => ({ topics: [topic] }),
  buildTopicContext: () => ({ topicId: "topic-1" }),
  buildContext: async () => ({ publishing: {} }),
  generatePost: async (_env, context) => {
    receivedContext = context;
    return { body: "AI가 만든 초안" };
  },
};

const unauthenticated = await handlePostGenerate(request({ topicId: "topic-1" }, false), env(), services);
assert.equal(unauthenticated.status, 401);

const generationEnv = env();
const generated = await handlePostGenerate(request({ topicId: "topic-1", format: "HTML" }), generationEnv, services);
assert.deepEqual((await generated.json()).draft, {
  title: null,
  body: "AI가 만든 초안",
  format: "HTML",
  sourceType: "AI",
  topicId: "topic-1",
});
assert.match(receivedContext.publishing.goal, /HTML/u);

const unknown = await handlePostGenerate(request({ topicId: "missing" }), env(), services);
assert.equal(unknown.status, 404);
const invalidFormat = await handlePostGenerate(request({ topicId: "topic-1", format: "MARKDOWN" }), env(), services);
assert.equal(invalidFormat.status, 400);
assert.equal(generationEnv.values.has("operator_posts:v1"), false);
console.log("post generation API fixture passed");
