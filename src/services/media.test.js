import assert from "node:assert/strict";

import {
  DEFAULT_WORKSPACE_ID,
} from "./workspace-foundation.js";

import {
  createMedia,
  getMedia,
  getPublicMediaById,
  listMedia,
  removeMedia,
  updateMedia,
} from "./media.js";

const MEDIA_KEY = "content_media_library";

class MemoryKv {
  constructor(entries = {}) {
    this.values = new Map(
      Object.entries(entries).map(
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

function media(overrides = {}) {
  return {
    id: "media-default",
    mediaKind: "image",
    sourceType: "general",
    objectKey: "media/general/default.jpg",
    altText: "Default media",
    description: "Default description",
    tags: ["default"],
    experienceTags: [],
    experienceNote: null,
    maxUses: null,
    usedCount: 0,
    lastUsedAt: null,
    cooldownDays: 0,
    active: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function createEnv(records) {
  const kv = new MemoryKv({
    [MEDIA_KEY]: {
      version: 1,
      updatedAt: "2026-08-01T00:00:00.000Z",
      records,
    },
  });
  return { env: { THREADS_KV: kv }, kv };
}

async function rawRecords(kv) {
  return (await kv.get(MEDIA_KEY, "json")).records;
}

const legacy = media({
  id: "legacy-media",
  objectKey: "media/general/legacy.jpg",
});
const workspaceB = media({
  id: "workspace-b-media",
  objectKey: "media/general/workspace-b.jpg",
  workspaceId: "workspace-b",
});
const { env, kv } = createEnv([legacy, workspaceB]);

assert.deepEqual(await listMedia(env), await listMedia(env, {}, null));
assert.deepEqual(
  await listMedia(env),
  await listMedia(env, {}, DEFAULT_WORKSPACE_ID)
);
assert.deepEqual(
  (await listMedia(env)).map((item) => item.id),
  [legacy.id]
);
assert.deepEqual(
  (await listMedia(env, {}, "workspace-b")).map((item) => item.id),
  [workspaceB.id]
);

const updatedLegacy = await updateMedia(env, legacy.id, {
  description: "Updated legacy media",
});
assert.equal(updatedLegacy.id, legacy.id);
assert.equal(updatedLegacy.workspaceId, DEFAULT_WORKSPACE_ID);
assert.equal(
  (await rawRecords(kv)).find((item) => item.id === legacy.id).workspaceId,
  DEFAULT_WORKSPACE_ID
);
assert.deepEqual(
  (await rawRecords(kv)).find((item) => item.id === workspaceB.id),
  workspaceB
);

const createdInA = await createMedia(
  env,
  {
    objectKey: "media/general/workspace-a.jpg",
    workspaceId: "workspace-b",
    experienceTags: ["commute"],
    experienceNote: "Used during a commute.",
  },
  "workspace-a"
);
assert.equal(createdInA.workspaceId, "workspace-a");
assert.deepEqual(createdInA.experienceTags, ["commute"]);
assert.equal(createdInA.experienceNote, "Used during a commute.");
assert.equal(await getMedia(env, workspaceB.id, "workspace-a"), null);
assert.equal((await getPublicMediaById(env, workspaceB.id)).id, workspaceB.id);
await assert.rejects(
  updateMedia(env, workspaceB.id, { description: "Foreign update" }, "workspace-a"),
  /not found/u
);
assert.equal(await removeMedia(env, workspaceB.id, "workspace-a"), false);
assert.equal(
  (await getMedia(env, workspaceB.id, "workspace-b")).description,
  "Default description"
);
await assert.rejects(
  createMedia(env, { objectKey: workspaceB.objectKey }, "workspace-a"),
  /already registered/u
);

const capacityRecords = Array.from(
  { length: 500 },
  (_, index) => media({
    id: `capacity-a-${index}`,
    objectKey: `media/general/capacity-a-${index}.jpg`,
    workspaceId: "workspace-capacity-a",
  })
);
const capacityForeign = media({
  id: "capacity-foreign",
  objectKey: "media/general/capacity-foreign.jpg",
  workspaceId: "workspace-capacity-b",
});
const { env: capacityEnv, kv: capacityKv } = createEnv([
  ...capacityRecords,
  capacityForeign,
]);
await assert.rejects(
  createMedia(
    capacityEnv,
    { objectKey: "media/general/capacity-overflow.jpg" },
    "workspace-capacity-a"
  ),
  /record limit/u
);
assert.equal((await listMedia(capacityEnv, {}, "workspace-capacity-a")).length, 500);
assert.ok((await rawRecords(capacityKv)).some((item) => item.id === capacityForeign.id));

await assert.rejects(listMedia(env, {}, ""), /Workspace id is invalid/u);

console.log("workspace-aware media fixtures passed");
