import assert from "node:assert/strict";
import { AutoPostEngineError } from "./errors.js";
import { publishGeneralAutoPost } from "./publisher.js";

function dependencies(overrides = {}) {
  const calls = [];
  return {
    calls,
    value: {
      async getApp(_env, id) {
        assert.equal(id, "threads-primary");
        return { id: "threads-primary", type: "THREADS", active: false };
      },
      async getJson(_env, key) { assert.equal(key, "threads_auth"); return { access_token: "token" }; },
      async getThreadsProfile(token) { assert.equal(token, "token"); return { id: "user-1", username: "auto" }; },
      async publishTextPost(token, userId, text) { calls.push({ mode: "TEXT", token, userId, text }); return { postId: "text-1" }; },
      async publishImagePost(env, token, userId, text, mediaId) { calls.push({ mode: "IMAGE", env, token, userId, text, mediaId }); return { postId: "image-1" }; },
      async logPostSuccess(_env, username, postId, text, metadata) { calls.push({ mode: "LOG", username, postId, text, metadata }); return "post_log:test"; },
      async updatePostLogFirstComment() {},
      async markMediaUsed(_env, mediaId) { calls.push({ mode: "MEDIA", mediaId }); },
      async markContentPoolItemUsed(_env, contentPoolId) { calls.push({ mode: "POOL", contentPoolId }); },
      ...overrides,
    },
  };
}

const text = dependencies();
const textResult = await publishGeneralAutoPost({}, {
  accessToken: "token", text: "same text", metadata: { source: "cron_auto_general" }, dependencies: text.value,
});
assert.equal(textResult.publishResult.postId, "text-1");
assert.deepEqual(text.calls.filter((call) => call.mode === "TEXT"), [{ mode: "TEXT", token: "token", userId: "user-1", text: "same text" }]);
assert.equal(text.calls.find((call) => call.mode === "LOG").metadata.publishMode, "TEXT");

const image = dependencies();
const imageResult = await publishGeneralAutoPost({ env: "image" }, {
  accessToken: "token", text: "caption", mediaSelection: { mode: "IMAGE", mediaId: "media-1", contentPoolId: "pool-1" }, dependencies: image.value,
});
assert.equal(imageResult.publishResult.postId, "image-1");
assert.equal(image.calls.filter((call) => call.mode === "IMAGE").length, 1);
assert.equal(image.calls.find((call) => call.mode === "LOG").metadata.mediaId, "media-1");
assert.deepEqual(image.calls.find((call) => call.mode === "MEDIA"), { mode: "MEDIA", mediaId: "media-1" });
assert.deepEqual(image.calls.find((call) => call.mode === "POOL"), { mode: "POOL", contentPoolId: "pool-1" });

let directPublishCalls = 0;
const missing = dependencies({ getApp: async () => null, publishTextPost: async () => { directPublishCalls += 1; return { postId: "no" }; } });
await assert.rejects(
  publishGeneralAutoPost({}, { accessToken: "token", text: "x", dependencies: missing.value }),
  (error) => error instanceof AutoPostEngineError && error.code === "APP_NOT_FOUND"
);
assert.equal(directPublishCalls, 0);

const failed = dependencies({ publishTextPost: async () => { directPublishCalls += 1; throw new Error("provider detail"); } });
await assert.rejects(
  publishGeneralAutoPost({}, { accessToken: "token", text: "x", dependencies: failed.value }),
  (error) => error instanceof AutoPostEngineError && error.code === "threads_publish_failed" && !error.message.includes("provider detail")
);
assert.equal(directPublishCalls, 1);

await assert.rejects(
  publishGeneralAutoPost({}, { accessToken: "token", text: "x", mediaSelection: { mode: "VIDEO", mediaId: "video-1" }, dependencies: dependencies().value }),
  (error) => error instanceof AutoPostEngineError && error.code === "FORMAT_NOT_SUPPORTED"
);
console.log("general auto publisher migration fixture passed");
