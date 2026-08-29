import assert from "node:assert/strict";
import { createMedia, getMedia } from "./media.js";

function createEnv(initialStore = null) {
  let stored = initialStore;
  return {
    THREADS_KV: {
      async get(key) {
        if (key !== "content_media_library") return null;
        return stored;
      },
      async put(key, value) {
        if (key === "content_media_library") stored = JSON.parse(value);
      },
    },
  };
}

const env = createEnv();
const created = await createMedia(env, {
  sourceType: "general",
  mediaKind: "image",
  objectKey: "media/general/example.jpg",
  experienceTags: [" 출근길 ", "", "비 오는 날", "출근길"],
  experienceNote: "  비 오는 날 출퇴근할 때 사용.  ",
});
assert.deepEqual(created.experienceTags, ["출근길", "비 오는 날"]);
assert.equal(created.experienceNote, "비 오는 날 출퇴근할 때 사용.");

const empty = await createMedia(env, {
  sourceType: "general",
  mediaKind: "image",
  objectKey: "media/general/empty.jpg",
  experienceTags: ["", "  "],
  experienceNote: "  ",
});
assert.deepEqual(empty.experienceTags, []);
assert.equal(empty.experienceNote, null);

const legacyEnv = createEnv({
  version: 1,
  records: [{
    id: "legacy-media",
    sourceType: "general",
    mediaKind: "image",
    objectKey: "media/general/legacy.jpg",
    tags: ["legacy"],
  }],
});
const legacy = await getMedia(legacyEnv, "legacy-media");
assert.deepEqual(legacy.experienceTags, []);
assert.equal(legacy.experienceNote, null);
console.log("media experience metadata fixture passed");
