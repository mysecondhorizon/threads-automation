import assert from "node:assert/strict";

import {
  PRODUCT_OPPORTUNITY_ASSETS_KEY,
  ProductOpportunityAssetError,
  linkProductOpportunityAsset,
  listProductOpportunityAssets,
  unlinkProductOpportunityAsset,
} from "./product-opportunity-assets.js";

class MemoryKv { constructor() { this.values = new Map(); } async get(key, type) { const value = this.values.get(key); return value === undefined ? null : (type === "json" ? JSON.parse(value) : value); } async put(key, value) { this.values.set(key, value); } }
const env = { THREADS_KV: new MemoryKv() };
const media = { id: "product-image", workspaceId: "workspace-a", sourceType: "product", mediaKind: "image", active: true, description: "unchanged" };
const opportunity = { id: "opportunity-a", workspaceId: "workspace-a", productName: "Coffee tool" };
const dependencies = {
  getOpportunity: async (_env, id, workspaceId) => id === "opportunity-a" && workspaceId === "workspace-a" ? opportunity : id === "opportunity-b" && workspaceId === "workspace-a" ? { ...opportunity, id: "opportunity-b" } : null,
  get: async (_env, id, workspaceId) => id === "product-image" && workspaceId === "workspace-a" ? media : id === "product-video" && workspaceId === "workspace-a" ? { ...media, id, mediaKind: "video" } : id === "general" && workspaceId === "workspace-a" ? { ...media, id, sourceType: "general" } : id === "inactive" && workspaceId === "workspace-a" ? { ...media, id, active: false } : null,
};
const originalMedia = structuredClone(media);
const linked = await linkProductOpportunityAsset(env, "opportunity-a", "product-image", "workspace-a", dependencies);
assert.equal(linked.created, true);
assert.equal((await listProductOpportunityAssets(env, "opportunity-a", "workspace-a")).length, 1);
assert.deepEqual(media, originalMedia);
assert.equal((await linkProductOpportunityAsset(env, "opportunity-a", "product-image", "workspace-a", dependencies)).created, false);
assert.equal((await linkProductOpportunityAsset(env, "opportunity-a", "product-video", "workspace-a", dependencies)).created, true);
assert.equal((await linkProductOpportunityAsset(env, "opportunity-b", "product-image", "workspace-a", dependencies)).created, true);
assert.equal((await listProductOpportunityAssets(env, "opportunity-a", "workspace-a")).length, 2);
assert.equal((await listProductOpportunityAssets(env, "opportunity-b", "workspace-a")).length, 1);
await assert.rejects(() => linkProductOpportunityAsset(env, "missing", "product-image", "workspace-a", dependencies), (error) => error instanceof ProductOpportunityAssetError && error.code.endsWith("opportunity_not_found"));
await assert.rejects(() => linkProductOpportunityAsset(env, "opportunity-a", "missing", "workspace-a", dependencies), (error) => error instanceof ProductOpportunityAssetError && error.code.endsWith("media_not_found"));
await assert.rejects(() => linkProductOpportunityAsset(env, "opportunity-a", "general", "workspace-a", dependencies), /not eligible/u);
await assert.rejects(() => linkProductOpportunityAsset(env, "opportunity-a", "inactive", "workspace-a", dependencies), /not eligible/u);
await assert.rejects(() => linkProductOpportunityAsset(env, "opportunity-a", "product-image", "workspace-b", dependencies), /not found/u);
assert.equal(await unlinkProductOpportunityAsset(env, "opportunity-a", "product-image", "workspace-a"), true);
assert.equal(await unlinkProductOpportunityAsset(env, "opportunity-a", "product-image", "workspace-a"), false);
assert.equal(env.THREADS_KV.values.has(PRODUCT_OPPORTUNITY_ASSETS_KEY), true);
console.log("product opportunity asset relation fixture passed");
