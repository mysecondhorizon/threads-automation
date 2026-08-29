import assert from "node:assert/strict";

import {
  handlePublicMedia,
} from "./media-public.js";

function media(id, objectKey, workspaceId) {
  return {
    id,
    ...(workspaceId ? { workspaceId } : {}),
    mediaKind: "image",
    sourceType: "general",
    objectKey,
    active: true,
  };
}

function createEnv(records) {
  return {
    THREADS_KV: {
      async get(key, type) {
        if (key !== "content_media_library") return null;
        return type === "json"
          ? { version: 1, records }
          : null;
      },
    },
    THREADS_MEDIA: {
      async get(objectKey) {
        return {
          body: new Blob([objectKey]).stream(),
          size: objectKey.length,
          httpMetadata: { contentType: "image/jpeg" },
          uploaded: new Date("2026-08-01T00:00:00.000Z"),
        };
      },
      async head() { return null; },
      async put() {},
      async delete() {},
    },
  };
}

const defaultMedia = media("default-media", "media/general/default.jpg");
const nonDefaultMedia = media(
  "workspace-media",
  "media/general/workspace.jpg",
  "workspace-a"
);
const env = createEnv([defaultMedia, nonDefaultMedia]);

for (const item of [defaultMedia, nonDefaultMedia]) {
  const response = await handlePublicMedia(
    new Request(`https://example.test/media/${item.id}`),
    env,
    new URL(`https://example.test/media/${item.id}`)
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), item.objectKey);
}

console.log("public media workspace fixture passed");
