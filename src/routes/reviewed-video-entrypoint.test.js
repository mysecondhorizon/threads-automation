import assert from "node:assert/strict";
import { config } from "../config.js";
import { handlePublishReviewedAutoPost } from "./auto-post-publish-reviewed.js";

function createEnv() {
  const values = new Map([
    ["admin_session:session-1", "valid"],
    ["threads_auth", { access_token: "token" }],
    ["content_media_library", {
      version: 1,
      updatedAt: null,
      records: [{
        id: "video-1",
        mediaKind: "video",
        sourceType: "general",
        productId: null,
        objectKey: "media/general/video-1.mp4",
        active: true,
        altText: "테스트 영상",
        description: "",
        tags: [],
        maxUses: null,
        usedCount: 0,
        lastUsedAt: null,
        cooldownDays: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }],
    }],
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
      async delete(key) {
        values.delete(key);
      },
    },
    THREADS_MEDIA: {
      async get() {
        return { httpMetadata: { contentType: "video/mp4" } };
      },
      async put() {},
      async head() { return null; },
      async delete() {},
    },
  };
}

function request(body, { authenticated = true } = {}) {
  return new Request("https://example.test/admin/auto-post/publish-reviewed", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authenticated ? { cookie: "admin_session=session-1" } : {}),
    },
    body: JSON.stringify(body),
  });
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

await withFetch([{ id: "user-1", username: "tester" }, { id: "text-post" }], async (requests) => {
  const response = await handlePublishReviewedAutoPost(
    request({ text: "검수된 텍스트 게시물입니다." }),
    createEnv()
  );
  assert.equal(response.status, 200);
  assert.equal(requests.length, 2);
  assert.equal(bodyParams(requests[1]).get("media_type"), "TEXT");
});

await withFetch([{ id: "user-1", username: "tester" }, { id: "video-container" }, { id: "video-post" }], async (requests) => {
  const response = await handlePublishReviewedAutoPost(
    request({
      text: "검수된 영상 게시물입니다.",
      mediaSelection: { mode: "VIDEO", mediaId: "  video-1  " },
    }),
    createEnv()
  );
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  assert.equal(requests.length, 3);
  const create = bodyParams(requests[1]);
  assert.equal(create.get("media_type"), "VIDEO");
  assert.equal(create.get("video_url"), `${config.app.baseUrl}/media/video-1`);
  assert.equal(bodyParams(requests[2]).get("creation_id"), "video-container");
});

for (const mediaSelection of [
  { mode: "VIDEO", mediaId: "   " },
  { mode: "IMAGE", mediaId: "video-1" },
  { mode: "TEXT", mediaId: "video-1" },
  null,
  [],
  "VIDEO",
]) {
  const response = await handlePublishReviewedAutoPost(
    request({ text: "검수된 영상 게시물입니다.", mediaSelection }),
    createEnv()
  );
  const result = await response.json();
  assert.equal(response.status, 400);
  assert.equal(result.code, "invalid_video_media_selection");
}

const unauthorized = await handlePublishReviewedAutoPost(
  request({ text: "검수된 텍스트 게시물입니다." }, { authenticated: false }),
  createEnv()
);
assert.equal(unauthorized.status, 401);

console.log("reviewed video entrypoint fixtures passed");
