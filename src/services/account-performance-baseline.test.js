import assert from "node:assert/strict";
import { buildAccountPerformanceBaseline, getAccountPerformanceBaseline } from "./account-performance-baseline.js";
import { POST_INSIGHT_METRICS, deriveInsightTotals } from "./insights.js";

const hour = 3600000;
const day = 24 * hour;
const reference = Date.parse("2026-09-30T00:00:00.000Z");
const owner = { workspaceId: "workspace-a", connectedAccountId: "account-a", threadsUserId: "threads-a" };
function snapshot({ postId = "history", daysAgo = 1, ageHours = 32, metrics: changes = {}, ...overrides } = {}) {
  const metrics = { views: 100, likes: 3, replies: 2, reposts: 1, quotes: 0, shares: 0, ...changes };
  const metricAvailability = Object.fromEntries(POST_INSIGHT_METRICS.map((name) => [name, metrics[name] !== null]));
  const published = reference - daysAgo * day;
  return {
    schemaVersion: 1, integrityVersion: 1, ...owner, postId,
    windowId: ageHours >= 72 ? "D3" : "D1", ownershipSource: "published_log",
    publishedAt: new Date(published).toISOString(), observedAt: new Date(published + ageHours * hour).toISOString(),
    observationAgeSeconds: ageHours * 3600,
    collectionStatus: Object.values(metricAvailability).every(Boolean) ? "success" : "partial",
    metricAvailability, ...metrics, ...deriveInsightTotals(metrics), ...overrides,
  };
}
const target = snapshot({ postId: "target", daysAgo: 0, metrics: { views: 20 } });
const history = (count = 10, options = {}) => Array.from({ length: count }, (_, i) => snapshot({
  postId: `history-${i}`, daysAgo: (i + 1) / 4, metrics: { views: i + 1 }, ...options,
}));
const key = (item) => `post_insight_snapshot:v1:${[item.workspaceId, item.connectedAccountId, item.threadsUserId, item.postId]
  .map(encodeURIComponent).join(":")}:${item.windowId}`;
const prefix = (item) => `post_insight_snapshot:v1:${[item.workspaceId, item.connectedAccountId, item.threadsUserId]
  .map(encodeURIComponent).join(":")}:`;

class ReadOnlyKv {
  constructor(items = [], pageSize = 1000) {
    this.values = new Map(items.map((item) => [key(item), structuredClone(item)]));
    this.pageSize = pageSize;
    this.lists = [];
    this.reads = [];
  }
  async list(options) {
    this.lists.push(options);
    const names = [...this.values.keys()].filter((name) => name.startsWith(options.prefix)).sort();
    const start = Number(options.cursor || 0);
    const end = Math.min(start + this.pageSize, names.length);
    return { keys: names.slice(start, end).map((name) => ({ name })), list_complete: end === names.length, cursor: String(end) };
  }
  async get(keys, type) {
    assert.ok(Array.isArray(keys), "discovery must bulk read");
    assert.ok(keys.length > 0 && keys.length <= 100);
    assert.equal(type, "json");
    this.reads.push([...keys]);
    return new Map(keys.map((name) => [name, structuredClone(this.values.get(name) ?? null)]));
  }
  async put() { assert.fail("baseline must never write"); }
  async delete() { assert.fail("baseline must never delete"); }
}
const environment = (kv) => ({ THREADS_KV: kv });
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => assert.fail("no Threads/OpenAI/network calls permitted");
try {
  const base = buildAccountPerformanceBaseline(target, history());
  assert.deepEqual(base.metrics.reach.views, { targetValue: 20, sampleCount: 10, median: 5.5, q1: 3.25, q3: 7.75, delta: 14.5 });
  assert.deepEqual(base.policy, { lookbackDays: 28, ageToleranceSeconds: 21600,
    minimumValidSamples: 10, targetValidSamples: 20, maximumCohortPosts: 30 });
  assert.deepEqual(base.cohort.observationAgeSeconds, { min: 115200, median: 115200, max: 115200 });
  assert.equal(base.observation.postId, target.postId);
  for (const field of ["workspaceId", "connectedAccountId", "threadsUserId", "windowId", "observedAt", "observationAgeSeconds"]) {
    assert.equal(base.observation[field], target[field]);
  }

  // All scope fields are checked, even with mixed inputs; no missing identity
  // defaults or promotion of a legacy/latest observation.
  for (const field of ["workspaceId", "connectedAccountId", "threadsUserId", "windowId"]) {
    const mixed = [...history(), ...history(10).map((item) => ({ ...item, [field]: "other", postId: `other-${item.postId}` }))];
    assert.deepEqual(buildAccountPerformanceBaseline(target, mixed), base);
  }
  for (const changes of [{ integrityVersion: 0 }, { schemaVersion: undefined }, { ownershipSource: "guessed" },
    { threadsUserId: "" }, { windowId: null }, { observationAgeSeconds: 0 }, { collectionStatus: "failed" }]) {
    assert.equal(buildAccountPerformanceBaseline({ ...target, ...changes }, history()), null);
    const invalid = history().map((item) => ({ ...item, ...changes }));
    assert.equal(buildAccountPerformanceBaseline(target, invalid).cohort.postCount, 0);
  }
  const d3Target = snapshot({ postId: "target", daysAgo: 0, ageHours: 80 });
  const d3 = buildAccountPerformanceBaseline(d3Target, [...history(), ...history(10, { ageHours: 80 })]);
  assert.equal(d3.observation.windowId, "D3");
  assert.equal(d3.metrics.reach.views.sampleCount, 10);

  // Publication lower bound and age tolerance are inclusive. Future/same-time
  // posts and observations unavailable as of the target are excluded.
  const boundaryItems = [
    target,
    snapshot({ postId: "target", daysAgo: 2 }),
    snapshot({ postId: "future-post", daysAgo: -1 }),
    snapshot({ postId: "same-publication", daysAgo: 0 }),
    snapshot({ postId: "future-observation", daysAgo: 1 / 24, ageHours: 34 }),
    snapshot({ postId: "same-observation", daysAgo: 3 / 24, ageHours: 35, metrics: { views: 10 } }),
    snapshot({ postId: "28-days", daysAgo: 28, metrics: { views: 11 } }),
    snapshot({ postId: "too-old", daysAgo: 28 + 1 / day }),
    snapshot({ postId: "age-low", ageHours: 26, metrics: { views: 12 } }),
    snapshot({ postId: "age-high", ageHours: 38, metrics: { views: 13 } }),
    snapshot({ postId: "age-below", ageHours: 26 - 1 / 3600 }),
    snapshot({ postId: "age-above", ageHours: 38 + 1 / 3600 }),
  ];
  const boundaries = buildAccountPerformanceBaseline(target, boundaryItems);
  assert.equal(boundaries.cohort.postCount, 4);
  assert.deepEqual(boundaries.cohort.observationAgeSeconds, { min: 26 * 3600, median: 33.5 * 3600, max: 38 * 3600 });
  assert.equal(boundaries.metrics.reach.views.sampleCount, 4);
  assert.equal(boundaries.metrics.reach.views.median, null);
  const acceptedBoundaryIds = new Set(["same-observation", "28-days", "age-low", "age-high"]);
  for (const item of boundaryItems) {
    assert.equal(buildAccountPerformanceBaseline(target, [item]).cohort.postCount,
      acceptedBoundaryIds.has(item.postId) ? 1 : 0, item.postId);
  }

  const many = history(40);
  const newest = buildAccountPerformanceBaseline(target, [...many].reverse());
  assert.equal(newest.cohort.postCount, 30);
  assert.equal(newest.metrics.reach.views.median, 15.5);
  assert.deepEqual(newest, buildAccountPerformanceBaseline(target, many));
  assert.deepEqual(newest, buildAccountPerformanceBaseline(target, [...many, ...many]));

  // Valid count, independent partial metrics and an observed zero are not
  // confused with unavailable data. Do not refill a metric beyond the common 30.
  const partials = history().map((item, i) => snapshot({ postId: item.postId, daysAgo: (i + 1) / 4,
    metrics: { views: i, likes: i < 2 ? null : 3, replies: 0, quotes: i < 3 ? null : 0 } }));
  const partial = buildAccountPerformanceBaseline(target, partials);
  assert.deepEqual(partial.metrics.reach.views, { targetValue: 20, sampleCount: 10, median: 4.5, q1: 2.25, q3: 6.75, delta: 15.5 });
  assert.equal(partial.metrics.engagement.engagementRate.sampleCount, 7);
  assert.equal(partial.metrics.conversation.replyRate.sampleCount, 9); // views=0 excluded only from rates
  assert.equal(partial.metrics.distribution.quoteRate.sampleCount, 7);
  for (const metric of [partial.metrics.engagement.engagementRate, partial.metrics.conversation.replyRate]) {
    assert.equal(metric.median, null); assert.equal(metric.q1, null); assert.equal(metric.q3, null); assert.equal(metric.delta, null);
  }
  const zeros = buildAccountPerformanceBaseline(target, history(10, { metrics: {
    views: 10, likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0,
  } }));
  assert.equal(zeros.metrics.engagement.engagementRate.median, 0);
  assert.equal(zeros.metrics.engagement.engagementRate.sampleCount, 10);
  assert.equal(zeros.metrics.conversation.replyRate.median, 0);
  assert.equal(zeros.metrics.conversation.replyRate.delta, 10); // 2/20*100 - 0 percentage points
  assert.equal(zeros.metrics.distribution.quoteRate.delta, 0);
  const conversationOnly = buildAccountPerformanceBaseline(target, history(10, { metrics: { likes: null } }));
  assert.equal(conversationOnly.metrics.engagement.engagementRate.sampleCount, 0);
  assert.equal(conversationOnly.metrics.conversation.replyRate.sampleCount, 10);
  assert.equal(conversationOnly.metrics.conversation.replyRate.delta, 8); // 10% - 2%
  assert.equal(buildAccountPerformanceBaseline(target, history(9)).metrics.reach.views.median, null);
  const unavailableViews = buildAccountPerformanceBaseline(target, history(10, { metrics: { views: null } }));
  assert.equal(unavailableViews.cohort.postCount, 10);
  for (const group of Object.values(unavailableViews.metrics)) {
    for (const metric of Object.values(group)) {
      assert.equal(metric.sampleCount, 0);
      assert.equal(metric.median, null);
      assert.equal(metric.delta, null);
    }
  }
  assert.equal(buildAccountPerformanceBaseline(target, []).cohort.observationAgeSeconds.min, null);
  const noRefill = history(40).map((item, i) => i < 30 ? snapshot({ postId: item.postId, daysAgo: (i + 1) / 4, metrics: { likes: null } }) : item);
  assert.equal(buildAccountPerformanceBaseline(target, noRefill).metrics.engagement.engagementRate.sampleCount, 0);

  const outlier = history();
  outlier[9] = snapshot({ postId: "viral", daysAgo: 3, metrics: { views: 1000000 } });
  assert.deepEqual(buildAccountPerformanceBaseline(target, outlier).metrics.reach.views, base.metrics.reach.views);
  const tied = buildAccountPerformanceBaseline(target, history(10, { metrics: { views: 7 } }));
  assert.deepEqual(tied.metrics.reach.views, { targetValue: 20, sampleCount: 10, median: 7, q1: 7, q3: 7, delta: 13 });
  const missingTarget = snapshot({ postId: "target", daysAgo: 0, metrics: { views: null } });
  const missing = buildAccountPerformanceBaseline(missingTarget, history());
  assert.equal(missing.metrics.reach.views.targetValue, null);
  assert.equal(missing.metrics.reach.views.median, 5.5);
  assert.equal(missing.metrics.reach.views.delta, null);
  assert.equal(missing.metrics.engagement.engagementRate.targetValue, null);
  assert.equal(missing.metrics.engagement.engagementRate.delta, null);

  // Same facade as future consumers: real prefix discovery, non-chronological
  // key ordering, pagination and bulk reads. No history or other account reads.
  const kv = new ReadOnlyKv([...many, target, ...history(10, { ageHours: 80 }),
    ...history(10, { workspaceId: "other" }), ...history(10, { connectedAccountId: "other" }),
    ...history(10, { threadsUserId: "other" })], 7);
  const loaded = await getAccountPerformanceBaseline(environment(kv), target);
  assert.equal(loaded.available, true);
  assert.deepEqual(loaded.baseline, newest);
  assert.ok(kv.lists.length > 1);
  assert.ok(kv.lists.every((options) => options.prefix === prefix(target)));
  assert.ok(kv.reads.flat().every((name) => name.startsWith(prefix(target)) && name.endsWith(":D1")));
  assert.equal(kv.reads.flat().length, 41);
  assert.equal(loaded.discovery.scannedKeys, 51);

  for (const field of ["workspaceId", "connectedAccountId", "threadsUserId", "postId", "windowId"]) {
    const mismatch = new ReadOnlyKv(history());
    const firstKey = key(history()[0]);
    mismatch.values.get(firstKey)[field] = "foreign";
    const result = await getAccountPerformanceBaseline(environment(mismatch), target);
    assert.equal(result.available, true);
    assert.equal(result.baseline.metrics.reach.views.sampleCount, 9);
    assert.equal(result.baseline.metrics.reach.views.median, null);
  }
  const special = snapshot({ postId: "target", daysAgo: 0, workspaceId: "ws:a/%", connectedAccountId: "acct:b", threadsUserId: "user:c" });
  const specialKv = new ReadOnlyKv(history(10, { workspaceId: special.workspaceId,
    connectedAccountId: special.connectedAccountId, threadsUserId: special.threadsUserId }));
  assert.equal((await getAccountPerformanceBaseline(environment(specialKv), special)).baseline.cohort.postCount, 10);

  async function expectUnavailable(store, reason) {
    const result = await getAccountPerformanceBaseline(environment(store), target);
    assert.equal(result.available, false);
    assert.equal(result.reason, reason);
    assert.equal(result.baseline, null, "incomplete discovery must never return partial statistics");
    assert.equal("snapshots" in result, false);
    return result;
  }
  const overKeys = new ReadOnlyKv(history(5001));
  const keyBudget = await expectUnavailable(overKeys, "snapshot_key_budget_exceeded");
  assert.equal(keyBudget.discovery.scannedKeys, 5001);
  assert.equal(keyBudget.discovery.bulkReadCalls, 50);
  const overLists = new ReadOnlyKv(history(21), 1);
  const listBudget = await expectUnavailable(overLists, "snapshot_list_budget_exceeded");
  assert.equal(listBudget.discovery.listCalls, 20);
  assert.equal(overLists.lists.length, 20);
  const overBulk = new ReadOnlyKv(history(3417), 201); // 17 pages * 3 batches: 51st batch is blocked
  const bulkBudget = await expectUnavailable(overBulk, "snapshot_bulk_budget_exceeded");
  assert.equal(bulkBudget.discovery.bulkReadCalls, 50);
  assert.equal(overBulk.reads.length, 50);
  // Exactly 5,000 keys / 50 reads and exactly 20 list calls still complete.
  assert.equal((await getAccountPerformanceBaseline(environment(new ReadOnlyKv(history(5000))), target)).available, true);
  assert.equal((await getAccountPerformanceBaseline(environment(new ReadOnlyKv(history(20), 1)), target)).available, true);

  const listFailure = new ReadOnlyKv(history(20), 10);
  const listOriginal = listFailure.list.bind(listFailure);
  listFailure.list = async (options) => { if (options.cursor) throw new Error("private provider error"); return listOriginal(options); };
  await expectUnavailable(listFailure, "snapshot_list_failed");
  const readFailure = new ReadOnlyKv(history(110));
  const readOriginal = readFailure.get.bind(readFailure);
  readFailure.get = async (...args) => { if (readFailure.reads.length) throw new Error("private read error"); return readOriginal(...args); };
  await expectUnavailable(readFailure, "snapshot_bulk_read_failed");
  const missingBatchValue = new ReadOnlyKv(history());
  missingBatchValue.get = async () => new Map();
  await expectUnavailable(missingBatchValue, "snapshot_bulk_read_failed");
  const invalidBatch = new ReadOnlyKv(history());
  invalidBatch.get = async () => [];
  await expectUnavailable(invalidBatch, "snapshot_bulk_read_failed");
  const looping = new ReadOnlyKv(history());
  looping.list = async () => ({ keys: [{ name: key(history()[0]) }], cursor: "same", list_complete: false });
  await expectUnavailable(looping, "snapshot_pagination_invalid");
  const noCursor = new ReadOnlyKv();
  noCursor.list = async () => ({ keys: [], list_complete: false });
  await expectUnavailable(noCursor, "snapshot_pagination_invalid");
  const invalidPage = new ReadOnlyKv();
  invalidPage.list = async () => ({ keys: [], list_complete: "true" });
  await expectUnavailable(invalidPage, "snapshot_pagination_invalid");
  const emptyPages = new ReadOnlyKv(history());
  const emptyOriginal = emptyPages.list.bind(emptyPages);
  emptyPages.list = async (options) => options.cursor === "empty" ? emptyOriginal({ ...options, cursor: undefined }) :
    { keys: [], list_complete: false, cursor: "empty" };
  assert.equal((await getAccountPerformanceBaseline(environment(emptyPages), target)).baseline.cohort.postCount, 10);
  const invalidTargetKv = new ReadOnlyKv();
  assert.equal((await getAccountPerformanceBaseline(environment(invalidTargetKv), { ...target, integrityVersion: 0 })).available, false);
  assert.equal(invalidTargetKv.lists.length, 0);

  // Frozen caller objects remain untouched, including nested availability.
  const frozenHistory = history();
  const before = structuredClone([target, frozenHistory]);
  Object.freeze(target.metricAvailability); Object.freeze(target);
  for (const item of frozenHistory) { Object.freeze(item.metricAvailability); Object.freeze(item); }
  Object.freeze(frozenHistory);
  buildAccountPerformanceBaseline(target, frozenHistory);
  assert.deepEqual([target, frozenHistory], before);
  const unchanged = structuredClone([...kv.values]);
  await getAccountPerformanceBaseline(environment(kv), target);
  assert.deepEqual([...kv.values], unchanged);
} finally {
  globalThis.fetch = originalFetch;
}
console.log("account baseline fixtures passed (scope, time/age, statistics, partial metrics, pagination/budgets, read-only)");
