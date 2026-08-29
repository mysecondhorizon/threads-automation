import assert from "node:assert/strict";
import { OperatorPublishError, publishOperatorPost } from "./publish-service.js";

const post = { id: "post-1", status: "READY", format: "TEXT", body: " saved body " };
const calls = [];
const dependencies = {
  async getApp(_env, id) {
    return id === "threads-primary" ? { id: "threads-primary", type: "THREADS", active: true } : null;
  },
  async getJson(_env, key) {
    assert.equal(key, "threads_auth");
    return { access_token: "token" };
  },
  async getThreadsProfile(token) {
    assert.equal(token, "token");
    return { id: "user-1", username: "operator" };
  },
  async publishTextPost(token, userId, text) {
    calls.push({ token, userId, text });
    return { postId: "threads-1" };
  },
  async logPostSuccess(_env, username, postId, text, metadata) {
    calls.push({ username, postId, text, metadata });
  },
};

assert.deepEqual(await publishOperatorPost({ env: {}, post, dependencies }), {
  app: "THREADS",
  postId: "threads-1",
});
assert.deepEqual(calls[0], { token: "token", userId: "user-1", text: "saved body" });
assert.equal(calls[1].metadata.source, "OPERATOR");

await assert.rejects(
  publishOperatorPost({ env: {}, post: { ...post, targetApp: "missing" }, dependencies }),
  (error) => error instanceof OperatorPublishError && error.code === "APP_NOT_FOUND"
);
await assert.rejects(
  publishOperatorPost({ env: {}, post: { ...post, format: "HTML" }, dependencies }),
  (error) => error instanceof OperatorPublishError && error.code === "html_threads_publish_unsupported"
);

for (const invalidPost of [
  { ...post, status: "DRAFT" },
  { ...post, status: "PUBLISHED" },
  { ...post, format: "HTML" },
]) {
  await assert.rejects(
    publishOperatorPost({ env: {}, post: invalidPost, dependencies }),
    (error) => error instanceof OperatorPublishError
  );
}

await assert.rejects(
  publishOperatorPost({ env: {}, post, dependencies: { ...dependencies, getJson: async () => null } }),
  (error) => error instanceof OperatorPublishError && error.code === "threads_auth_missing"
);
await assert.rejects(
  publishOperatorPost({ env: {}, post, dependencies: { ...dependencies, publishTextPost: async () => { throw new Error("secret raw response"); } } }),
  (error) => error instanceof OperatorPublishError && error.code === "threads_publish_failed" && !error.message.includes("secret")
);
console.log("publish service fixture passed");
