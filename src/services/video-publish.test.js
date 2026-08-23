import assert from "node:assert/strict";
import { config } from "../config.js";
import { logPostSuccess } from "./logger.js";
import { publishAutoPost } from "./auto-post/publisher.js";
import {
  publishImagePost,
  publishTextPost,
  publishVideoPost,
  ThreadsApiError,
} from "./threads.js";
import { selectGeneralAutoMediaFromRecords } from "./general-auto-media-selection.js";

function mediaRecord(overrides = {}) {
  return {
    id: "video-1",
    mediaKind: "video",
    sourceType: "general",
    productId: null,
    objectKey: "media/general/video-1.mp4",
    active: true,
    altText: "세로형 테스트 영상",
    description: "",
    tags: [],
    maxUses: null,
    usedCount: 0,
    lastUsedAt: null,
    cooldownDays: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createEnv({ media = mediaRecord(), contentType = "video/mp4" } = {}) {
  const values = new Map([
    ["content_media_library", { version: 1, updatedAt: null, records: media ? [media] : [] }],
  ]);
  return {
    values,
    THREADS_KV: {
      async get(key) {
        return values.get(key) ?? null;
      },
      async put(key, value) {
        values.set(key, JSON.parse(value));
      },
    },
    THREADS_MEDIA: {
      async get() {
        return { httpMetadata: { contentType } };
      },
      async put() {},
      async head() { return null; },
      async delete() {},
    },
  };
}

async function withFetch(responses, callback) {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    const data = responses.shift();
    if (!data) throw new Error("Unexpected fetch call");
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    return await callback(requests);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function bodyParams(request) {
  return new URLSearchParams(request.init.body);
}

async function expectVideoValidation(env, expectedStep) {
  await assert.rejects(
    () => publishVideoPost(env, "token", "user-1", "caption", "video-1"),
    (error) => error instanceof ThreadsApiError && error.step === expectedStep
  );
}

await withFetch([{ id: "container-1" }, { id: "post-1" }], async (requests) => {
  const env = createEnv();
  const result = await publishVideoPost(env, "token", "user-1", "  caption  ", "video-1");
  assert.equal(result.postId, "post-1");
  assert.equal(result.videoUrl, `${config.app.baseUrl}/media/video-1`);
  assert.equal(requests.length, 2);
  const create = bodyParams(requests[0]);
  assert.equal(create.get("media_type"), "VIDEO");
  assert.equal(create.get("video_url"), `${config.app.baseUrl}/media/video-1`);
  assert.equal(create.get("text"), "caption");
  assert.equal(create.get("alt_text"), "세로형 테스트 영상");
  assert.equal(bodyParams(requests[1]).get("creation_id"), "container-1");
});

await withFetch([{ id: "container-2" }, { id: "post-2" }], async (requests) => {
  const env = createEnv({ media: mediaRecord({ altText: "   " }) });
  await publishVideoPost(env, "token", "user-1", "caption", "video-1");
  assert.equal(bodyParams(requests[0]).has("alt_text"), false);
});

await expectVideoValidation(createEnv({ media: null }), "validate_video_media");
await expectVideoValidation(createEnv({ media: mediaRecord({ active: false }) }), "validate_video_media");
await expectVideoValidation(createEnv({ media: mediaRecord({ mediaKind: "image" }) }), "validate_video_media");
await expectVideoValidation(createEnv({ contentType: "image/jpeg" }), "validate_video_media");

await withFetch([{ id: "image-container" }, { id: "image-post" }], async (requests) => {
  const env = createEnv({
    media: mediaRecord({ mediaKind: "image", objectKey: "media/general/image-1.jpg" }),
    contentType: "image/jpeg",
  });
  await publishImagePost(env, "token", "user-1", "caption", "video-1");
  const create = bodyParams(requests[0]);
  assert.equal(create.get("media_type"), "IMAGE");
  assert.equal(create.get("image_url"), `${config.app.baseUrl}/media/video-1`);
  assert.equal(create.has("video_url"), false);
  assert.equal(create.has("alt_text"), false);
});

await withFetch([{ id: "text-post" }], async (requests) => {
  await publishTextPost("token", "user-1", "  text post  ");
  const create = bodyParams(requests[0]);
  assert.equal(create.get("media_type"), "TEXT");
  assert.equal(create.get("auto_publish_text"), "true");
  assert.equal(create.get("text"), "text post");
});

await withFetch([{ id: "user-1", username: "tester" }, { id: "container-3" }, { id: "post-3" }], async (requests) => {
  const env = createEnv();
  const result = await publishAutoPost(env, {
    accessToken: "token",
    text: "caption",
    mediaSelection: { mode: "VIDEO", mediaId: "video-1" },
    metadata: { source: "test" },
  });
  assert.equal(result.mediaSelection.mode, "VIDEO");
  assert.equal(result.publishResult.postId, "post-3");
  assert.equal(bodyParams(requests[1]).get("media_type"), "VIDEO");
  const postLog = [...env.values.entries()]
    .find(([key]) => key.startsWith("post_log:"))?.[1];
  assert.equal(postLog.metadata.publishMode, "VIDEO");
  assert.equal(postLog.metadata.mediaId, "video-1");
  assert.equal("contentPoolId" in postLog.metadata, false);
});

const logEnv = createEnv();
const videoLogKey = await logPostSuccess(logEnv, "tester", "post-video", "text", {
  publishMode: "VIDEO",
  mediaId: "video-1",
});
assert.equal(logEnv.values.get(videoLogKey).metadata.publishMode, "VIDEO");
assert.equal(logEnv.values.get(videoLogKey).metadata.mediaId, "video-1");
const textLogKey = await logPostSuccess(logEnv, "tester", "post-text", "text", {
  publishMode: "TEXT",
  mediaId: "video-1",
});
assert.equal(logEnv.values.get(textLogKey).metadata.publishMode, "TEXT");
assert.equal("mediaId" in logEnv.values.get(textLogKey).metadata, false);

const selectorResult = selectGeneralAutoMediaFromRecords({
  poolItems: [],
  mediaRecords: [mediaRecord()],
});
assert.equal(selectorResult.mode, "TEXT");
assert.notEqual(selectorResult.mode, "VIDEO");

console.log("video publish fixtures passed");
