import assert from "node:assert/strict";

import {
  DEFAULT_WORKSPACE_ID,
} from "./workspace-foundation.js";

import {
  createContentPoolBatch,
  createContentPoolItem,
  getContentPoolItem,
  isContentPoolItemAvailable,
  listContentPool,
  removeContentPoolItem,
  updateContentPoolItem,
} from "./content-pool.js";

const MEDIA_KEY = "content_media_library";
const POOL_KEY = "content_pool";

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

function media(id, workspaceId) {
  return {
    id,
    ...(workspaceId ? { workspaceId } : {}),
    mediaKind: "image",
    sourceType: "general",
    objectKey: `media/general/${id}.jpg`,
    active: true,
  };
}

function poolItem(id, mediaId, overrides = {}) {
  return {
    id,
    type: "general",
    mediaIds: [mediaId],
    topics: [],
    allowedContentTypes: [],
    priority: 0,
    maxUses: 1,
    usedCount: 0,
    cooldownDays: 0,
    active: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function createEnv(records, items) {
  const kv = new MemoryKv({
    [MEDIA_KEY]: { version: 1, records },
    [POOL_KEY]: { version: 1, items },
  });
  return { env: { THREADS_KV: kv }, kv };
}

async function rawItems(kv) {
  return (await kv.get(POOL_KEY, "json")).items;
}

const legacyMedia = media("legacy-media");
const mediaA = media("media-a", "workspace-a");
const mediaB = media("media-b", "workspace-b");
const legacyItem = poolItem("legacy-pool", legacyMedia.id);
const workspaceBItem = poolItem("workspace-b-pool", mediaB.id, {
  workspaceId: "workspace-b",
});
const { env, kv } = createEnv(
  [legacyMedia, mediaA, mediaB],
  [legacyItem, workspaceBItem]
);

assert.deepEqual(await listContentPool(env), await listContentPool(env, {}, null));
assert.deepEqual(
  await listContentPool(env),
  await listContentPool(env, {}, DEFAULT_WORKSPACE_ID)
);
assert.deepEqual((await listContentPool(env)).map((item) => item.id), [legacyItem.id]);
assert.deepEqual(
  (await listContentPool(env, {}, "workspace-b")).map((item) => item.id),
  [workspaceBItem.id]
);

const updatedLegacy = await updateContentPoolItem(env, legacyItem.id, {
  topics: ["updated"],
});
assert.equal(updatedLegacy.id, legacyItem.id);
assert.equal(updatedLegacy.workspaceId, DEFAULT_WORKSPACE_ID);
assert.equal(updatedLegacy.maxUses, 1);
assert.equal(
  (await rawItems(kv)).find((item) => item.id === legacyItem.id).workspaceId,
  DEFAULT_WORKSPACE_ID
);
assert.deepEqual(
  (await rawItems(kv)).find((item) => item.id === workspaceBItem.id),
  workspaceBItem
);

const createdInA = await createContentPoolItem(
  env,
  {
    mediaIds: [mediaA.id],
    workspaceId: "workspace-b",
  },
  "workspace-a"
);
assert.equal(createdInA.workspaceId, "workspace-a");
assert.equal(await getContentPoolItem(env, workspaceBItem.id, "workspace-a"), null);
await assert.rejects(
  updateContentPoolItem(env, workspaceBItem.id, { topics: ["foreign"] }, "workspace-a"),
  /not found/u
);
assert.equal(await removeContentPoolItem(env, workspaceBItem.id, "workspace-a"), false);
await assert.rejects(
  createContentPoolItem(env, { mediaIds: [mediaB.id] }, "workspace-a"),
  /same workspace/u
);
await assert.rejects(
  updateContentPoolItem(env, createdInA.id, { mediaIds: [mediaB.id] }, "workspace-a"),
  /same workspace/u
);

const batch = await createContentPoolBatch(
  env,
  [{ mediaIds: [mediaA.id], topics: ["batch"] }],
  "workspace-a"
);
assert.equal(batch.created.length, 1);
assert.equal(batch.created[0].workspaceId, "workspace-a");

const unlimitedPool = await createContentPoolItem(env, {
  mediaIds: [mediaA.id],
  maxUses: null,
  usedCount: 1,
  lastUsedAt: "2026-08-01T00:00:00.000Z",
  cooldownDays: 0,
}, "workspace-a");
assert.equal(unlimitedPool.maxUses, null);
assert.equal(
  isContentPoolItemAvailable(
    unlimitedPool,
    new Date("2026-08-02T00:00:00.000Z")
  ),
  true
);

const cooldownPool = await createContentPoolItem(env, {
  mediaIds: [mediaA.id],
  maxUses: null,
  usedCount: 1,
  lastUsedAt: "2026-08-01T00:00:00.000Z",
  cooldownDays: 2,
}, "workspace-a");
assert.equal(
  isContentPoolItemAvailable(
    cooldownPool,
    new Date("2026-08-02T00:00:00.000Z")
  ),
  false
);

const capacityMedia = media("capacity-media", "workspace-capacity-a");
const capacityForeignMedia = media("capacity-foreign-media", "workspace-capacity-b");
const capacityItems = Array.from(
  { length: 1000 },
  (_, index) => poolItem(`capacity-a-${index}`, capacityMedia.id, {
    workspaceId: "workspace-capacity-a",
  })
);
const capacityForeign = poolItem("capacity-foreign", capacityForeignMedia.id, {
  workspaceId: "workspace-capacity-b",
});
const { env: capacityEnv, kv: capacityKv } = createEnv(
  [capacityMedia, capacityForeignMedia],
  [...capacityItems, capacityForeign]
);
await assert.rejects(
  createContentPoolItem(capacityEnv, { mediaIds: [capacityMedia.id] }, "workspace-capacity-a"),
  /item limit/u
);
assert.equal((await listContentPool(capacityEnv, {}, "workspace-capacity-a")).length, 1000);
assert.ok((await rawItems(capacityKv)).some((item) => item.id === capacityForeign.id));

await assert.rejects(listContentPool(env, {}, ""), /workspace id is invalid/u);

await assert.rejects(
  createContentPoolItem(env, { type: "product", mediaIds: [legacyMedia.id] }),
  (error) => error?.code === "content_pool_type_invalid"
);

const noProductLookup = await createContentPoolItem(env, {
  mediaIds: [legacyMedia.id],
  productId: "legacy-product-id",
});
assert.equal("productId" in noProductLookup, false);

const legacyProductEnv = createEnv(
  [legacyMedia],
  [poolItem("legacy-product-pool", legacyMedia.id, { type: "product", productId: "legacy-product-id" })]
);
assert.deepEqual(await listContentPool(legacyProductEnv.env), []);

console.log("workspace-aware content pool fixtures passed");
