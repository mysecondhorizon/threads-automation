import assert from "node:assert/strict";
import { handlePostPublish } from "./api-posts.js";
import { createPost, getPost } from "../services/posts.js";
import { OperatorPublishError } from "../services/publish-service.js";

function createEnv() {
  const values = new Map([["admin_session:session-1", "valid"]]);
  return {
    THREADS_KV: {
      async get(key, type) {
        const value = values.get(key) ?? null;
        return type === "json" && value !== null ? JSON.parse(value) : value;
      },
      async put(key, value) { values.set(key, value); },
      async delete(key) { values.delete(key); },
    },
  };
}

function request(path, authenticated = true) {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: authenticated ? { cookie: "admin_session=session-1" } : {},
  });
}

const env = createEnv();
const ready = await createPost(env, { body: "ready body", status: "READY" }, { idFactory: () => "ready" });
const draft = await createPost(env, { body: "draft body" }, { idFactory: () => "draft" });
const html = await createPost(env, { body: "<p>html</p>", status: "READY", format: "HTML" }, { idFactory: () => "html" });

const unauthorized = await handlePostPublish(request("/api/posts/ready/publish", false), env, "ready");
assert.equal(unauthorized.status, 401);
const missing = await handlePostPublish(request("/api/posts/missing/publish"), env, "missing");
assert.equal(missing.status, 404);
const draftResponse = await handlePostPublish(request("/api/posts/draft/publish"), env, "draft");
assert.equal(draftResponse.status, 409);
const htmlResponse = await handlePostPublish(request("/api/posts/html/publish"), env, "html");
assert.equal(htmlResponse.status, 400);

let resolvePublish;
let signalPublishStarted;
const publishStarted = new Promise((resolve) => { signalPublishStarted = resolve; });
let publishCalls = 0;
const blockingPublish = async () => {
  publishCalls += 1;
  signalPublishStarted();
  await new Promise((resolve) => { resolvePublish = resolve; });
  return { app: "THREADS", postId: "external-1" };
};
const first = handlePostPublish(request("/api/posts/ready/publish"), env, "ready", { publish: blockingPublish });
await publishStarted;
const duplicate = await handlePostPublish(request("/api/posts/ready/publish"), env, "ready", { publish: blockingPublish });
assert.equal(duplicate.status, 409);
resolvePublish();
const success = await first;
assert.equal(success.status, 200);
assert.equal(publishCalls, 1);
const successBody = await success.json();
assert.equal(successBody.post.status, "PUBLISHED");
assert.equal(successBody.post.publishedPostId, "external-1");
assert.ok(successBody.post.publishedAt);
assert.equal((await getPost(env, ready.id)).status, "PUBLISHED");
const republish = await handlePostPublish(request("/api/posts/ready/publish"), env, "ready", { publish: blockingPublish });
assert.equal(republish.status, 409);

const failing = await createPost(env, { body: "failure", status: "READY" }, { idFactory: () => "failure" });
const failureResponse = await handlePostPublish(request("/api/posts/failure/publish"), env, "failure", {
  publish: async () => { throw new OperatorPublishError("Threads publishing failed. Please try again later."); },
});
assert.equal(failureResponse.status, 400);
const failureBody = await failureResponse.json();
assert.equal(failureBody.ok, false);
assert.ok(!failureBody.error.includes("token"));
assert.equal((await getPost(env, failing.id)).status, "READY");
console.log("operator post publish API fixture passed");
