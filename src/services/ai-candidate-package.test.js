import assert from "node:assert/strict";

import {
  buildAiCandidatePackage,
  selectDeterministicAiFallback,
  validateAiCandidateSelection,
} from "./ai-candidate-package.js";

class MemoryKv {
  constructor(entries = {}) {
    this.values = new Map(
      Object.entries(entries).map(([key, value]) => [key, JSON.stringify(value)])
    );
  }

  async get(key, type) {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }
}

function media(id, workspaceId) {
  return {
    id,
    workspaceId,
    mediaKind: "image",
    sourceType: "general",
    objectKey: `media/${id}.jpg`,
    active: true,
    maxUses: 1,
    usedCount: 0,
    cooldownDays: 0,
  };
}

function pool(id, workspaceId, mediaId) {
  return {
    id,
    workspaceId,
    type: "general",
    mediaIds: [mediaId],
    topics: [],
    allowedContentTypes: [],
    priority: 0,
    maxUses: 1,
    usedCount: 0,
    cooldownDays: 0,
    active: true,
  };
}

const env = {
  THREADS_KV: new MemoryKv({
    content_media_library: {
      version: 1,
      records: [media("media-a", "workspace-a"), media("media-b", "workspace-b")],
    },
    content_pool: {
      version: 1,
      items: [
        pool("pool-a", "workspace-a", "media-a"),
        pool("pool-b", "workspace-b", "media-b"),
      ],
    },
  }),
};

const packageA = await buildAiCandidatePackage(env, {
  workspaceId: "workspace-a",
  at: "2026-08-30T00:00:00.000Z",
});
const packageB = await buildAiCandidatePackage(env, {
  workspaceId: "workspace-b",
  at: "2026-08-30T00:00:00.000Z",
});

assert.deepEqual(packageA.candidates.map((item) => item.candidateId), ["pool-a"]);
assert.deepEqual(packageA.candidates[0].mediaIds, ["media-a"]);
assert.deepEqual(packageB.candidates.map((item) => item.candidateId), ["pool-b"]);
assert.deepEqual(packageB.candidates[0].mediaIds, ["media-b"]);
assert.equal("product" in packageA.candidates[0], false);
assert.equal("productId" in packageA.candidates[0], false);
assert.equal(selectDeterministicAiFallback(packageA).productId, null);
assert.throws(
  () => validateAiCandidateSelection(packageA, {
    candidateId: "pool-a",
    productId: "legacy-product",
    mediaId: null,
    contentType: "TEXT",
  }),
  (error) => error?.code === "ai_selection_product_unsupported"
);

console.log("workspace-aware AI candidate package fixtures passed");
