import assert from "node:assert/strict";
import {
  batchUploadMedia,
  mergeMediaMetadata,
  mergeVideoMediaMetadata,
} from "./media-batch.js";

const input = {
  tags: ["사용자 기존 태그"],
  description: "사용자 기존 설명",
  experienceTags: ["출근길", "비 오는 날"],
  experienceNote: "비 오는 날 출퇴근할 때 사용.",
};
const vision = {
  tags: ["관찰 태그"],
  topics: ["관찰 주제"],
  altText: "관찰 alt",
  description: "관찰 설명",
  sceneType: "거리",
  usableAngles: ["전면"],
  peoplePresent: false,
  textPresent: false,
  brandVisible: false,
};

const image = mergeMediaMetadata(input, vision);
assert.deepEqual(image.experienceTags, input.experienceTags);
assert.equal(image.experienceNote, input.experienceNote);

const video = mergeVideoMediaMetadata(input, vision, {
  sourceDurationSeconds: 12,
  clipStartSeconds: 1,
  clipDurationSeconds: 6,
});
assert.deepEqual(video.experienceTags, input.experienceTags);
assert.equal(video.experienceNote, input.experienceNote);
assert.deepEqual(video.tags, vision.tags);
assert.equal(video.description, vision.description);

class MemoryKv {
  constructor(values) {
    this.values = new Map(
      Object.entries(values).map(
        ([key, value]) => [key, JSON.stringify(value)]
      )
    );
  }

  async get(key, type) {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }

  async put(key, value) {
    this.values.set(key, value);
  }
}

const kv = new MemoryKv({
  content_media_library: {
    version: 1,
    records: [{
      id: "foreign-media",
      workspaceId: "workspace-b",
      mediaKind: "image",
      sourceType: "general",
      objectKey: "media/general/foreign.jpg",
      active: true,
    }],
  },
  content_pool: {
    version: 1,
    items: [{
      id: "foreign-pool",
      workspaceId: "workspace-b",
      type: "general",
      mediaIds: ["foreign-media"],
      maxUses: 1,
      usedCount: 0,
      cooldownDays: 0,
      active: true,
    }],
  },
});
const storedObjects = new Map();
const env = {
  THREADS_KV: kv,
  OPENAI_API_KEY: "test-key",
  IMAGES: {
    input() {
      return {
        transform() {
          return {
            output() {
              return {
                response() {
                  return new Response(new Uint8Array([1, 2, 3]));
                },
              };
            },
          };
        },
      };
    },
  },
  THREADS_MEDIA: {
    async put(key, body) {
      storedObjects.set(key, body);
      return { size: body.byteLength };
    },
    async get(key) { return storedObjects.get(key) || null; },
    async head(key) { return storedObjects.get(key) || null; },
    async delete(key) { storedObjects.delete(key); },
  },
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({
  output: [{
    type: "message",
    content: [{
      type: "output_text",
      text: JSON.stringify({
        tags: ["fixture"],
        topics: ["fixture"],
        altText: "Fixture image",
        description: "Fixture description",
        sceneType: null,
        usableAngles: [],
        peoplePresent: null,
        textPresent: null,
        brandVisible: null,
      }),
    }],
  }],
}), { status: 200, headers: { "content-type": "application/json" } });

try {
  const file = new Blob(["fixture"], { type: "image/jpeg" });
  Object.defineProperty(file, "name", { value: "fixture.jpg" });
  const batch = await batchUploadMedia(env, {
    files: [file],
    defaults: { sourceType: "general" },
  }, "workspace-a");
  assert.equal(batch.results[0].status, "success");
  assert.equal(batch.results[0].media.workspaceId, "workspace-a");
  assert.equal(batch.results[0].contentPoolItem.workspaceId, "workspace-a");
  assert.equal((await kv.get("content_media_library", "json")).records.some((item) => item.id === "foreign-media"), true);
  assert.equal((await kv.get("content_pool", "json")).items.some((item) => item.id === "foreign-pool"), true);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("media batch experience metadata fixture passed");
