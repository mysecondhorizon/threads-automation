import assert from "node:assert/strict";
import { ThreadsPublisherError, threadsPublisher } from "./threads-publisher.js";

const calls = [];
const dependencies = {
  async getThreadsCredentialForAccount(_env, options) {
    assert.deepEqual(options, {});
    return { credential: { access_token: "token" } };
  },
  async getThreadsProfile(token) { assert.equal(token, "token"); return { id: "user-1", username: "operator" }; },
  async publishTextPost(token, userId, content) { calls.push({ token, userId, content }); return { postId: "threads-1" }; },
  async publishImagePost(env, token, userId, content, mediaId) { calls.push({ env, token, userId, content, mediaId }); return { postId: "threads-image-1" }; },
};
const published = await threadsPublisher.publish({ env: {}, content: "saved body", format: "TEXT", dependencies });
assert.equal(published.provider, "THREADS");
assert.equal(published.externalPostId, "threads-1");
assert.equal(published.logUsername, "operator");
assert.equal(published.publisherUserId, "user-1");
assert.deepEqual(calls, [{ token: "token", userId: "user-1", content: "saved body" }]);
await assert.rejects(
  threadsPublisher.publish({ env: {}, content: "<p>html</p>", format: "HTML", dependencies }),
  (error) => error instanceof ThreadsPublisherError && error.code === "FORMAT_NOT_SUPPORTED"
);
await assert.rejects(
  threadsPublisher.publish({ env: {}, content: "x", format: "TEXT", dependencies: { ...dependencies, getThreadsCredentialForAccount: async () => { throw new Error("missing credential"); } } }),
  (error) => error instanceof ThreadsPublisherError && error.code === "threads_auth_missing"
);
const imagePublished = await threadsPublisher.publish({
  env: { value: "env" }, content: "image caption", format: "TEXT",
  context: { mediaSelection: { mode: "IMAGE", mediaId: "image-1" } }, dependencies,
});
assert.equal(imagePublished.externalPostId, "threads-image-1");
assert.deepEqual(calls[1], { env: { value: "env" }, token: "token", userId: "user-1", content: "image caption", mediaId: "image-1" });
await assert.rejects(
  threadsPublisher.publish({ env: {}, content: "video", format: "TEXT", context: { mediaSelection: { mode: "VIDEO", mediaId: "video-1" } }, dependencies }),
  (error) => error instanceof ThreadsPublisherError && error.code === "FORMAT_NOT_SUPPORTED"
);

let resolvedOptions;
const scopedPublished = await threadsPublisher.publish({
  env: {},
  content: "scoped body",
  format: "TEXT",
  executionContext: {
    workspaceId: "workspace-a",
    connectedAccountId: "threads-account-a",
    connectedAccount: {
      authRef: "must-not-be-used",
      access_token: "must-not-be-used",
    },
  },
  dependencies: {
    ...dependencies,
    async getThreadsCredentialForAccount(_env, options) {
      resolvedOptions = options;
      return { credential: { access_token: "scoped-token" } };
    },
    async getThreadsProfile(token) {
      assert.equal(token, "scoped-token");
      return { id: "scoped-user", username: "scoped-operator" };
    },
  },
});
assert.deepEqual(resolvedOptions, {
  workspaceId: "workspace-a",
  connectedAccountId: "threads-account-a",
});
assert.equal("access_token" in scopedPublished, false);
assert.equal("authRef" in scopedPublished, false);
console.log("threads publisher adapter fixture passed");
