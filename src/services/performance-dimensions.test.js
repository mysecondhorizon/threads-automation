import assert from "node:assert/strict";
import { buildPerformanceDimensions } from "./performance-dimensions.js";
import { POST_INSIGHT_METRICS, deriveInsightTotals } from "./insights.js";

const hour = 60 * 60 * 1000;
const publishedAt = "2026-09-01T00:00:00.000Z";
const at = (hours) => new Date(Date.parse(publishedAt) + hours * hour).toISOString();

function snapshot(overrides = {}) {
  const metrics = { views: 300, likes: 12, replies: 3, reposts: 2, quotes: 1, shares: 4,
    ...(overrides.metrics || {}) };
  const metricAvailability = Object.fromEntries(POST_INSIGHT_METRICS.map((name) => [name, metrics[name] !== null]));
  const totals = deriveInsightTotals(metrics);
  return {
    schemaVersion: 1,
    windowId: "D1",
    postId: "post-a",
    workspaceId: "workspace-a",
    connectedAccountId: "account-a",
    threadsUserId: "threads-a",
    ownershipSource: "published_log",
    publishedAt,
    observedAt: at(25),
    observationAgeSeconds: 25 * 3600,
    integrityVersion: 1,
    collectionStatus: POST_INSIGHT_METRICS.every((name) => metricAvailability[name]) ? "success" : "partial",
    metricAvailability,
    ...metrics,
    ...totals,
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "metrics")),
  };
}

const full = snapshot();
const dimensions = buildPerformanceDimensions(full);
assert.deepEqual(dimensions.reach, { views: 300 });
assert.equal(dimensions.engagement.engagementRate, 22 / 300 * 100);
assert.equal(dimensions.conversation.replyRate, 1);
assert.deepEqual(dimensions.distribution, {
  repostRate: 2 / 300 * 100,
  quoteRate: 1 / 300 * 100,
  shareRate: 4 / 300 * 100,
});
assert.equal(dimensions.engagement.engagementRate, 7.333333333333333);
assert.deepEqual(Object.keys(dimensions.distribution).sort(), ["quoteRate", "repostRate", "shareRate"]);
assert.equal("score" in dimensions.distribution, false);

const zeroViews = buildPerformanceDimensions(snapshot({ metrics: {
  views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0,
} }));
assert.equal(zeroViews.reach.views, 0);
assert.equal(zeroViews.engagement.engagementRate, null);
assert.equal(zeroViews.conversation.replyRate, null);
assert.deepEqual(zeroViews.distribution, { repostRate: null, quoteRate: null, shareRate: null });

const zeroNumerators = buildPerformanceDimensions(snapshot({ metrics: {
  views: 50, likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0,
} }));
assert.equal(zeroNumerators.engagement.engagementRate, 0);
assert.equal(zeroNumerators.conversation.replyRate, 0);
assert.deepEqual(zeroNumerators.distribution, { repostRate: 0, quoteRate: 0, shareRate: 0 });

const partial = buildPerformanceDimensions(snapshot({ metrics: {
  views: 80, likes: null, replies: 4, reposts: 2, quotes: null, shares: 1,
} }));
assert.equal(partial.engagement.engagementRate, null);
assert.equal(partial.conversation.replyRate, 5);
assert.deepEqual(partial.distribution, { repostRate: 2.5, quoteRate: null, shareRate: 1.25 });

const missingReplies = buildPerformanceDimensions(snapshot({ metrics: { replies: null } }));
assert.equal(missingReplies.engagement.engagementRate, null);
assert.equal(missingReplies.conversation.replyRate, null);
const missingViews = buildPerformanceDimensions(snapshot({ metrics: { views: null } }));
assert.equal(missingViews.reach.views, null);
assert.equal(missingViews.engagement.engagementRate, null);
assert.equal(missingViews.conversation.replyRate, null);
assert.deepEqual(missingViews.distribution, { repostRate: null, quoteRate: null, shareRate: null });

assert.deepEqual(dimensions.observation, {
  schemaVersion: 1,
  windowId: "D1",
  postId: "post-a",
  workspaceId: "workspace-a",
  connectedAccountId: "account-a",
  threadsUserId: "threads-a",
  ownershipSource: "published_log",
  publishedAt,
  observedAt: at(25),
  observationAgeSeconds: 25 * 3600,
  integrityVersion: 1,
  collectionStatus: "success",
  metricAvailability: Object.fromEntries(POST_INSIGHT_METRICS.map((name) => [name, true])),
});
const d3 = buildPerformanceDimensions(snapshot({ windowId: "D3", observedAt: at(75), observationAgeSeconds: 75 * 3600 }));
assert.equal(d3.observation.windowId, "D3");
assert.equal(d3.observation.observedAt, at(75));
assert.equal(d3.observation.observationAgeSeconds, 75 * 3600);

for (const invalid of [
  null,
  {},
  { ...full, schemaVersion: 0 },
  { ...full, integrityVersion: 0 },
  { ...full, windowId: "D3" },
  { ...full, workspaceId: "" },
  { ...full, ownershipSource: "guessed" },
  { ...full, observationAgeSeconds: 24 * 3600 },
  { ...full, interactions: full.interactions + 1 },
  { ...full, collectionStatus: "partial" },
  { ...full, metricAvailability: { ...full.metricAvailability, views: false } },
]) assert.equal(buildPerformanceDimensions(invalid), null);

const mutableInput = snapshot();
const inputBefore = structuredClone(mutableInput);
const result = buildPerformanceDimensions(mutableInput);
assert.deepEqual(mutableInput, inputBefore);
assert.notEqual(result.observation.metricAvailability, mutableInput.metricAvailability);

console.log("performance dimension fixtures passed (trusted context, independent validity, zero/null, no rounding/composite)");
