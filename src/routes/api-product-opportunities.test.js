import assert from "node:assert/strict";

import {
  handleProductOpportunityById,
  handleProductOpportunityContentGeneration,
  handleProductOpportunityContentPublish,
  handleProductOpportunityPerformance,
  handleProductOpportunityProductCandidates,
  handleProductOpportunityDiscovery,
  handleProductOpportunityAssets,
  handleProductOpportunitiesCollection,
} from "./api-product-opportunities.js";
import { CoupangPartnersError } from "../services/coupang-partners.js";
import { CommerceContentError } from "../services/commerce-content.js";
import { CommercePublishError } from "../services/commerce-publish.js";
import {
  ADMIN_SESSION_KEY_PREFIX,
  USERS_KEY,
  WORKSPACES_KEY,
} from "../services/login-foundation.js";

class MemoryKv {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); }
  async get(key, type) {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }
  async put(key, value) { this.values.set(key, value); }
}

function workspaceEnv() {
  return { THREADS_KV: new MemoryKv({
    [USERS_KEY]: JSON.stringify({ version: 1, users: [{ id: "user-next", loginId: "next", displayName: "Next", active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" }] }),
    [WORKSPACES_KEY]: JSON.stringify({ version: 1, workspaces: [
      { id: "workspace-next", ownerUserId: "user-next", name: "Next", active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
      { id: "workspace-other", ownerUserId: "user-other", name: "Other", active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    ] }),
    [`${ADMIN_SESSION_KEY_PREFIX}registered`]: JSON.stringify({ version: 1, userId: "user-next", selectedWorkspaceId: "workspace-next", createdAt: "2026-01-01", expiresAt: "2099-01-01" }),
  }) };
}

function request(path, method = "GET", body, session = "registered") {
  return new Request(`https://example.test${path}`, {
    method,
    headers: { cookie: `admin_session=${session}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const create = {
  productName: "Weekend coffee grinder",
  category: "coffee",
  status: "DISCOVERED",
  signalSources: ["community", "community"],
  opportunityScore: 80,
};
const env = workspaceEnv();

const unauthorized = await handleProductOpportunitiesCollection(request("/api/product-opportunities", "GET", undefined, "missing"), env);
assert.equal(unauthorized.status, 401);

const created = await handleProductOpportunitiesCollection(request("/api/product-opportunities", "POST", create), env);
assert.equal(created.status, 201);
const opportunity = (await created.json()).opportunity;
assert.equal(opportunity.workspaceId, "workspace-next");
assert.deepEqual(opportunity.signalSources, ["community"]);

const listed = await handleProductOpportunitiesCollection(request("/api/product-opportunities"), env);
assert.deepEqual((await listed.json()).opportunities.map((item) => item.id), [opportunity.id]);

const fetched = await handleProductOpportunityById(request(`/api/product-opportunities/${opportunity.id}`), env, opportunity.id);
assert.equal((await fetched.json()).opportunity.productName, create.productName);

const patched = await handleProductOpportunityById(request(`/api/product-opportunities/${opportunity.id}`, "PATCH", { status: "READY", brand: "Example" }), env, opportunity.id);
assert.equal((await patched.json()).opportunity.status, "READY");

const invalid = await handleProductOpportunitiesCollection(request("/api/product-opportunities", "POST", { ...create, status: "PENDING" }), env);
assert.equal(invalid.status, 400);
const scopeOverride = await handleProductOpportunitiesCollection(request("/api/product-opportunities", "POST", { ...create, workspaceId: "workspace-other" }), env);
assert.equal(scopeOverride.status, 400);
const unsupported = await handleProductOpportunitiesCollection(request("/api/product-opportunities", "PUT", create), env);
assert.equal(unsupported.status, 405);

let discoveryWorkspaceId = null;
const discovered = await handleProductOpportunityDiscovery(request("/api/product-opportunities/discover", "POST"), env, {
  discover: async (_env, options) => {
    discoveryWorkspaceId = options.workspaceId;
    return { savedCount: 2, recommendedCount: 1, discoveredCount: 1, skippedDuplicateCount: 1, skippedInvalidCount: 1, opportunities: [] };
  },
});
assert.equal(discovered.status, 200);
assert.equal(discoveryWorkspaceId, "workspace-next");
assert.equal((await discovered.json()).discovery.savedCount, 2);
assert.equal((await handleProductOpportunityDiscovery(request("/api/product-opportunities/discover", "GET"), env)).status, 405);
assert.equal((await handleProductOpportunityDiscovery(request("/api/product-opportunities/discover", "POST", { workspaceId: "workspace-other" }), env)).status, 400);
assert.equal((await handleProductOpportunityDiscovery(request("/api/product-opportunities/discover", "POST", undefined, "missing"), env)).status, 401);
const discoveryFailure = await handleProductOpportunityDiscovery(request("/api/product-opportunities/discover", "POST"), env, {
  discover: async () => { throw new Error("OpenAI detail"); },
});
assert.equal(discoveryFailure.status, 502);
assert.equal((await discoveryFailure.json()).error, "Product Opportunity discovery failed");

let scopedWorkspace = null;
const foreign = await handleProductOpportunityById(request("/api/product-opportunities/foreign"), env, "foreign", {
  get: async (_env, _id, workspaceId) => { scopedWorkspace = workspaceId; return null; },
});
assert.equal(foreign.status, 404);
assert.equal(scopedWorkspace, "workspace-next");

let commerceWorkspaceId = null;
const commerceOpportunity = { id: "commerce-opportunity", workspaceId: "workspace-next", productName: "Car vacuum", category: "car" };
const commerceDraft = await handleProductOpportunityContentGeneration(request("/api/product-opportunities/commerce-opportunity/generate-content", "POST"), env, "commerce-opportunity", {
  get: async (_env, id, workspaceId) => { commerceWorkspaceId = workspaceId; return id === "commerce-opportunity" ? commerceOpportunity : null; },
  generate: async (_env, value) => {
    assert.equal(value.workspaceId, "workspace-next");
    return { text: "차 안 정리를 조금 더 가볍게 시작할 수 있겠어요.", contentBasis: "PRODUCT_OPPORTUNITY", opportunityId: value.opportunity.id, mediaId: "media-assets", mediaKind: "image", usedUserExperience: true, affiliateLink: null };
  },
});
assert.equal(commerceDraft.status, 200);
assert.equal(commerceWorkspaceId, "workspace-next");
assert.equal((await commerceDraft.json()).draft.contentBasis, "PRODUCT_OPPORTUNITY");
assert.equal((await handleProductOpportunityContentGeneration(request("/api/product-opportunities/missing/generate-content", "POST"), env, "missing", { get: async () => null })).status, 404);
assert.equal((await handleProductOpportunityContentGeneration(request("/api/product-opportunities/commerce-opportunity/generate-content", "GET"), env, "commerce-opportunity")).status, 405);
assert.equal((await handleProductOpportunityContentGeneration(request("/api/product-opportunities/commerce-opportunity/generate-content", "POST", { workspaceId: "workspace-other" }), env, "commerce-opportunity")).status, 400);
const missingProductName = await handleProductOpportunityContentGeneration(request("/api/product-opportunities/commerce-opportunity/generate-content", "POST"), env, "commerce-opportunity", {
  get: async () => ({ ...commerceOpportunity, productName: "" }),
  generate: async () => { throw new CommerceContentError("missing", "commerce_content_product_name_required"); },
});
assert.equal(missingProductName.status, 400);

let performanceOptions = null;
const performanceResponse = await handleProductOpportunityPerformance(request("/api/product-opportunities/commerce-opportunity/performance"), env, "commerce-opportunity", {
  get: async (_env, id, workspaceId) => id === "commerce-opportunity" && workspaceId === "workspace-next" ? commerceOpportunity : null,
  getPublishedPosts: async (_env, options) => {
    performanceOptions = options;
    return [{ postId: "commerce-post" }];
  },
  buildPerformance: async (_env, posts) => {
    assert.equal(posts[0].postId, "commerce-post");
    return { publishedPostCount: 1, postsWithPerformanceCount: 0, performancePendingCount: 1, totals: null };
  },
});
assert.equal(performanceResponse.status, 200);
assert.deepEqual(performanceOptions, { workspaceId: "workspace-next", opportunityId: "commerce-opportunity" });
assert.deepEqual(await performanceResponse.json(), {
  ok: true,
  opportunityId: "commerce-opportunity",
  performance: { publishedPostCount: 1, postsWithPerformanceCount: 0, performancePendingCount: 1, totals: null },
});
assert.equal((await handleProductOpportunityPerformance(request("/api/product-opportunities/commerce-opportunity/performance", "POST"), env, "commerce-opportunity")).status, 405);
assert.equal((await handleProductOpportunityPerformance(request("/api/product-opportunities/foreign/performance"), env, "foreign", {
  get: async () => null,
  getPublishedPosts: async () => { throw new Error("must not run"); },
})).status, 404);

const publishOpportunity = { id: "publish-opportunity", workspaceId: "workspace-next", productName: "Car vacuum", category: "car", status: "READY", useCount: 0 };
const publishImage = { id: "publish-image", workspaceId: "workspace-next", sourceType: "product", active: true, mediaKind: "image" };
let publishInput = null;
const publishDependencies = {
  get: async (_env, id, workspaceId) => id === "publish-opportunity" && workspaceId === "workspace-next" ? publishOpportunity : null,
  listLinks: async () => [{ workspaceId: "workspace-next", opportunityId: "publish-opportunity", mediaId: "publish-image" }],
  getMediaById: async (_env, id, workspaceId) => id === "publish-image" && workspaceId === "workspace-next" ? publishImage : null,
  resolveThreadsAccount: async () => ({ id: "threads-next" }),
  resolveContext: async (_env, input) => ({ ...input }),
  publish: async (_env, input) => { publishInput = input; return { app: "THREADS", postId: "published-1", mediaId: input.media?.id || null }; },
};
const storyMetadata = { contentAngle: "DISCOVERY", hookType: "CURIOSITY", usedCurrentTopic: true, currentTopicId: "topic-a", usedUserExperience: false };
const published = await handleProductOpportunityContentPublish(request("/api/product-opportunities/publish-opportunity/publish-content", "POST", { text: "  Edited review text.  ", mediaId: "publish-image", storyMetadata }), env, "publish-opportunity", publishDependencies);
assert.equal(published.status, 200);
assert.equal(publishInput.text, "  Edited review text.  ");
assert.equal(publishInput.workspaceId, "workspace-next");
assert.equal(publishInput.media.id, "publish-image");
assert.equal(publishInput.executionContext.connectedAccountId, "threads-next");
assert.deepEqual(publishInput.storyMetadata, storyMetadata);
assert.equal(publishOpportunity.useCount, 0);
const textPublished = await handleProductOpportunityContentPublish(request("/api/product-opportunities/publish-opportunity/publish-content", "POST", { text: "Text-only review" }), env, "publish-opportunity", publishDependencies);
assert.equal(textPublished.status, 200);
assert.equal(publishInput.media, null);
assert.equal((await handleProductOpportunityContentPublish(request("/api/product-opportunities/publish-opportunity/publish-content", "POST", { text: "x" }, "missing"), env, "publish-opportunity", publishDependencies)).status, 401);
assert.equal((await handleProductOpportunityContentPublish(request("/api/product-opportunities/publish-opportunity/publish-content", "POST", { text: "x" }), env, "publish-opportunity", { ...publishDependencies, get: async () => null })).status, 404);
assert.equal((await handleProductOpportunityContentPublish(request("/api/product-opportunities/publish-opportunity/publish-content", "POST", { text: "   " }), env, "publish-opportunity", publishDependencies)).status, 400);
assert.equal((await handleProductOpportunityContentPublish(request("/api/product-opportunities/publish-opportunity/publish-content", "POST", { text: "x", mediaId: "unlinked" }), env, "publish-opportunity", publishDependencies)).status, 400);
assert.equal((await handleProductOpportunityContentPublish(request("/api/product-opportunities/publish-opportunity/publish-content", "POST", { text: "x", mediaId: "publish-image" }), env, "publish-opportunity", { ...publishDependencies, getMediaById: async () => ({ ...publishImage, active: false }) })).status, 400);
assert.equal((await handleProductOpportunityContentPublish(request("/api/product-opportunities/publish-opportunity/publish-content", "POST", { text: "x", mediaId: "publish-image" }), env, "publish-opportunity", { ...publishDependencies, getMediaById: async () => ({ ...publishImage, workspaceId: "workspace-other" }) })).status, 400);
assert.equal((await handleProductOpportunityContentPublish(request("/api/product-opportunities/publish-opportunity/publish-content", "POST", { text: "x", mediaId: "publish-image" }), env, "publish-opportunity", { ...publishDependencies, getMediaById: async () => ({ ...publishImage, mediaKind: "video" }) })).status, 400);
assert.equal((await handleProductOpportunityContentPublish(request("/api/product-opportunities/publish-opportunity/publish-content", "POST", { text: "x", mediaId: "publish-image", workspaceId: "workspace-other" }), env, "publish-opportunity", publishDependencies)).status, 400);
assert.equal((await handleProductOpportunityContentPublish(request("/api/product-opportunities/publish-opportunity/publish-content", "POST", { text: "x", opportunityId: "spoofed-opportunity" }), env, "publish-opportunity", publishDependencies)).status, 400);
assert.equal((await handleProductOpportunityContentPublish(request("/api/product-opportunities/publish-opportunity/publish-content", "POST", { text: "x", storyMetadata: { ...storyMetadata, contentAngle: "PROMOTION" } }), env, "publish-opportunity", publishDependencies)).status, 400);
const publishFailure = await handleProductOpportunityContentPublish(request("/api/product-opportunities/publish-opportunity/publish-content", "POST", { text: "x" }), env, "publish-opportunity", { ...publishDependencies, publish: async () => { throw new CommercePublishError("raw", { code: "commerce_threads_publish_failed", status: 502 }); } });
assert.equal(publishFailure.status, 502);

let candidateWorkspaceId = null;
let candidateSearchCalls = 0;
const candidateOpportunity = { id: "coupang-opportunity", workspaceId: "workspace-next", productName: "Coffee" };
const productCandidates = await handleProductOpportunityProductCandidates(request("/api/product-opportunities/coupang-opportunity/product-candidates?q=coffee"), env, "coupang-opportunity", {
  get: async (_env, id, workspaceId) => { candidateWorkspaceId = workspaceId; return id === "coupang-opportunity" ? candidateOpportunity : null; },
  search: async (_env, options) => { candidateSearchCalls += 1; assert.deepEqual(options, { query: "coffee", limit: 5 }); return [{ productName: "Coffee maker", productUrl: "https://link.coupang.com/a/one", affiliateUrl: "https://link.coupang.com/a/one" }]; },
});
assert.equal(productCandidates.status, 200);
assert.equal(candidateWorkspaceId, "workspace-next");
assert.equal((await productCandidates.json()).candidates[0].productName, "Coffee maker");
assert.equal(candidateSearchCalls, 1);
assert.equal((await handleProductOpportunityProductCandidates(request("/api/product-opportunities/coupang-opportunity/product-candidates?q=%20%20"), env, "coupang-opportunity", { get: async () => candidateOpportunity, search: async () => { throw new Error("must not run"); } })).status, 400);
assert.equal((await handleProductOpportunityProductCandidates(request("/api/product-opportunities/coupang-opportunity/product-candidates?q=coffee", "POST"), env, "coupang-opportunity", { get: async () => candidateOpportunity })).status, 405);
assert.equal((await handleProductOpportunityProductCandidates(request("/api/product-opportunities/foreign/product-candidates?q=coffee"), env, "foreign", { get: async () => null, search: async () => { throw new Error("must not run"); } })).status, 404);
const candidateFailure = await handleProductOpportunityProductCandidates(request("/api/product-opportunities/coupang-opportunity/product-candidates?q=coffee"), env, "coupang-opportunity", {
  get: async () => candidateOpportunity,
  search: async () => { throw new CoupangPartnersError("upstream raw detail", "coupang_auth_failed"); },
});
assert.equal(candidateFailure.status, 502);
assert.deepEqual(await candidateFailure.json(), { ok: false, error: "Coupang product search failed", code: "coupang_auth_failed" });

const removed = await handleProductOpportunityById(request(`/api/product-opportunities/${opportunity.id}`, "DELETE"), env, opportunity.id);
assert.deepEqual(await removed.json(), { ok: true, removed: true });
const missing = await handleProductOpportunityById(request(`/api/product-opportunities/${opportunity.id}`), env, opportunity.id);
assert.equal(missing.status, 404);

const opportunityForAssets = { id: "opportunity-assets", workspaceId: "workspace-next", productName: "Coffee" };
const productMedia = { id: "media-assets", mediaKind: "image", sourceType: "product", active: true, description: "Coffee tool", tags: ["coffee"], experienceTags: ["morning"], experienceNote: "Used during a morning routine.", sceneType: "kitchen", usableAngles: ["small tool"] };
const assetDependencies = {
  getOpportunity: async (_env, id, workspaceId) => { assert.equal(workspaceId, "workspace-next"); return id === "opportunity-assets" ? opportunityForAssets : null; },
  candidates: async (_env, value, workspaceId) => { assert.equal(value.id, "opportunity-assets"); assert.equal(workspaceId, "workspace-next"); return [{ ...productMedia, mediaId: productMedia.id, matchScore: 80, reasons: ["제품/카테고리와 미디어 태그 일치"], hasUserExperience: true, previewUrl: "/media/media-assets" }]; },
  listLinks: async () => [{ mediaId: "media-assets" }],
  link: async (_env, _opportunityId, mediaId, workspaceId) => { assert.equal(workspaceId, "workspace-next"); assert.equal(mediaId, "media-assets"); return { mediaId, created: true }; },
  unlink: async () => true,
  get: async (_env, mediaId, workspaceId) => { assert.equal(workspaceId, "workspace-next"); return mediaId === "media-assets" ? productMedia : null; },
};
const candidateResponse = await handleProductOpportunityAssets(request("/api/product-opportunities/opportunity-assets/assets/candidates"), env, "opportunity-assets", "candidates", assetDependencies);
assert.equal((await candidateResponse.json()).candidates[0].matchScore, 80);
const linkedResponse = await handleProductOpportunityAssets(request("/api/product-opportunities/opportunity-assets/assets"), env, "opportunity-assets", null, assetDependencies);
assert.equal((await linkedResponse.json()).assets[0].hasUserExperience, true);
const linkedCreate = await handleProductOpportunityAssets(request("/api/product-opportunities/opportunity-assets/assets", "POST", { mediaId: "media-assets" }), env, "opportunity-assets", null, assetDependencies);
assert.equal(linkedCreate.status, 201);
assert.equal((await handleProductOpportunityAssets(request("/api/product-opportunities/opportunity-assets/assets/media-assets", "DELETE"), env, "opportunity-assets", "media-assets", assetDependencies)).status, 200);
assert.equal((await handleProductOpportunityAssets(request("/api/product-opportunities/opportunity-assets/assets", "POST", { mediaId: "media-assets", workspaceId: "workspace-other" }), env, "opportunity-assets", null, assetDependencies)).status, 400);
assert.equal((await handleProductOpportunityAssets(request("/api/product-opportunities/missing/assets/candidates"), env, "missing", "candidates", assetDependencies)).status, 404);
assert.equal((await handleProductOpportunityAssets(request("/api/product-opportunities/opportunity-assets/assets/candidates", "POST"), env, "opportunity-assets", "candidates", assetDependencies)).status, 405);

console.log("product opportunities API fixture passed");
