import assert from "node:assert/strict";
import { ThreadsPublisherError, threadsPublisher } from "./threads-publisher.js";

const calls = [];
const dependencies = {
  async getJson(_env, key) { assert.equal(key, "threads_auth"); return { access_token: "token" }; },
  async getThreadsProfile(token) { assert.equal(token, "token"); return { id: "user-1", username: "operator" }; },
  async publishTextPost(token, userId, content) { calls.push({ token, userId, content }); return { postId: "threads-1" }; },
};
const published = await threadsPublisher.publish({ env: {}, content: "saved body", format: "TEXT", dependencies });
assert.equal(published.provider, "THREADS");
assert.equal(published.externalPostId, "threads-1");
assert.equal(published.logUsername, "operator");
assert.deepEqual(calls, [{ token: "token", userId: "user-1", content: "saved body" }]);
await assert.rejects(
  threadsPublisher.publish({ env: {}, content: "<p>html</p>", format: "HTML", dependencies }),
  (error) => error instanceof ThreadsPublisherError && error.code === "FORMAT_NOT_SUPPORTED"
);
await assert.rejects(
  threadsPublisher.publish({ env: {}, content: "x", format: "TEXT", dependencies: { ...dependencies, getJson: async () => null } }),
  (error) => error instanceof ThreadsPublisherError && error.code === "threads_auth_missing"
);
console.log("threads publisher adapter fixture passed");
