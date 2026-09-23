import assert from "node:assert/strict";

import { buildProductOpportunityPerformanceSummary } from "./analytics.js";
import { getPublishedCommercePostsForOpportunity } from "./history.js";
import { logPostSuccess } from "./logger.js";

class MemoryKv {
  constructor() {
    this.values = new Map();
  }

  async get(key, type) {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }

  async put(key, value) {
    this.values.set(key, value);
  }

  async list({ prefix = "" } = {}) {
    return {
      keys: [...this.values.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((name) => ({ name })),
    };
  }
}

const env = { THREADS_KV: new MemoryKv() };
const metadata = (workspaceId, opportunityId) => ({
  workspaceId,
  connectedAccountId: "account-a",
  threadsUserId: "provider-a",
  source: "COMMERCE_MANUAL",
  contentBasis: "PRODUCT_OPPORTUNITY",
  opportunityId,
});

const noPosts = await getPublishedCommercePostsForOpportunity(env, {
  workspaceId: "workspace-next",
  opportunityId: "opportunity-one",
});
assert.deepEqual(noPosts, []);
assert.deepEqual(await buildProductOpportunityPerformanceSummary(env, noPosts), {
  publishedPostCount: 0,
  postsWithPerformanceCount: 0,
  performancePendingCount: 0,
  totals: null,
});

await logPostSuccess(env, "operator", "pending-post", "Pending Commerce post", metadata("workspace-next", "opportunity-one"));
let posts = await getPublishedCommercePostsForOpportunity(env, {
  workspaceId: "workspace-next",
  opportunityId: "opportunity-one",
});
assert.equal(posts.length, 1);
assert.equal(posts[0].postId, "pending-post");
assert.deepEqual(await buildProductOpportunityPerformanceSummary(env, posts), {
  publishedPostCount: 1,
  postsWithPerformanceCount: 0,
  performancePendingCount: 1,
  totals: null,
});

await logPostSuccess(env, "operator", "insight-post", "Measured Commerce post", metadata("workspace-next", "opportunity-one"));
await env.THREADS_KV.put("post_insight:insight-post", JSON.stringify({
  postId: "insight-post", workspaceId: "workspace-next", connectedAccountId: "account-a", threadsUserId: "provider-a",
  integrityVersion: 1, collectionStatus: "success",
  metricAvailability: { views:true, likes:true, replies:true, reposts:true, quotes:true, shares:true },
  views: 125,
  likes: 12,
  replies: 3,
  reposts: 2,
  quotes: 1,
  shares: 4,
  interactions: 22,
  fetchedAt: "2026-09-14T00:00:00.000Z",
}));
await logPostSuccess(env, "operator", "aggregate-post", "Another measured Commerce post", metadata("workspace-next", "opportunity-one"));
await env.THREADS_KV.put("post_insight:aggregate-post", JSON.stringify({
  postId: "aggregate-post", workspaceId: "workspace-next", connectedAccountId: "account-a", threadsUserId: "provider-a",
  integrityVersion: 1, collectionStatus: "success",
  metricAvailability: { views:true, likes:true, replies:true, reposts:true, quotes:true, shares:true },
  views: 75,
  likes: 8,
  replies: 2,
  reposts: 1,
  quotes: 0,
  shares: 2,
  interactions: 13,
  fetchedAt: "2026-09-14T01:00:00.000Z",
}));
await logPostSuccess(env, "operator", "other-opportunity", "Other opportunity", metadata("workspace-next", "opportunity-two"));
await logPostSuccess(env, "operator", "other-workspace", "Other workspace", metadata("workspace-other", "opportunity-one"));
await logPostSuccess(env, "operator", "not-commerce", "Other manual post", {
  workspaceId: "workspace-next",
  source: "MANUAL",
  contentBasis: "PRODUCT_OPPORTUNITY",
  opportunityId: "opportunity-one",
});

posts = await getPublishedCommercePostsForOpportunity(env, {
  workspaceId: "workspace-next",
  opportunityId: "opportunity-one",
});
assert.deepEqual(posts.map((post) => post.postId).sort(), ["aggregate-post", "insight-post", "pending-post"]);
const summary = await buildProductOpportunityPerformanceSummary(env, posts);
assert.equal(summary.publishedPostCount, 3);
assert.equal(summary.postsWithPerformanceCount, 2);
assert.equal(summary.performancePendingCount, 1);
assert.deepEqual(summary.totals, {
  views: 200,
  likes: 20,
  replies: 5,
  reposts: 3,
  quotes: 1,
  shares: 6,
  interactions: 35,
});

console.log("commerce performance fixtures passed");
