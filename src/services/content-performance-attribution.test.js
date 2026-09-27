import assert from "node:assert/strict";
import { test, after } from "node:test";
import { getContentPerformanceAttribution } from "./content-performance-attribution.js";
import { logPostSuccess } from "./logger.js";
import { buildAccountPerformanceBaseline } from "./account-performance-baseline.js";
import { POST_INSIGHT_METRICS, deriveInsightTotals } from "./insights.js";

const identity = { workspaceId: "workspace-a", connectedAccountId: "account-a", threadsUserId: "threads-a", postId: "target" };
const reference = Date.parse("2026-09-30T00:00:00Z");
function snapshot({ postId = identity.postId, hours = 32, daysAgo = 0, metrics: changes = {}, ...overrides } = {}) {
  const metrics = { views: 20, likes: 3, replies: 2, reposts: 1, quotes: 0, shares: 0, ...changes };
  const published = reference - daysAgo * 86400000;
  return {
    ...identity, postId, schemaVersion: 1, integrityVersion: 1, windowId: hours < 72 ? "D1" : "D3",
    ownershipSource: "published_log", publishedAt: new Date(published).toISOString(),
    observedAt: new Date(published + hours * 3600000).toISOString(), observationAgeSeconds: hours * 3600,
    collectionStatus: Object.values(metrics).every((value) => value !== null) ? "success" : "partial",
    metricAvailability: Object.fromEntries(POST_INSIGHT_METRICS.map((name) => [name, metrics[name] !== null])),
    ...metrics, ...deriveInsightTotals(metrics), ...overrides,
  };
}
const snapshotKey = (item) => `post_insight_snapshot:v1:${[item.workspaceId, item.connectedAccountId, item.threadsUserId, item.postId]
  .map(encodeURIComponent).join(":")}:${item.windowId}`;
const history = (count = 10, options = {}) => Array.from({ length: count }, (_, i) =>
  snapshot({ postId: `history-${i}`, daysAgo: i + 1, metrics: { views: 100 }, ...options }));
const logKey = "post_log:1:fixture";
const generalMetadata = {
  ...identity, source: "cron_auto_general", contentMode: "current_topic_reaction", contentBasis: "CURRENT_TOPIC",
  currentTopicId: "topic-1", currentTopicCategory: "daily", currentTopicSelectedAngle: "saved angle",
  style: "short", contentType: "작은 발견형", topic: "commute", emotion: "calm", hookStyle: "saved hook",
  endingStyle: "open", questionUsed: false, publishMode: "IMAGE", mediaId: "image-1", contentPoolId: "pool-1",
  usedCurrentTopic: false, usedUserExperience: false,
};
const commerceMetadata = {
  ...identity, source: "COMMERCE_MANUAL", contentMode: "commerce_manual", contentBasis: "PRODUCT_OPPORTUNITY",
  opportunityId: "opportunity-1", contentAngle: "DISCOVERY", hookType: "CURIOSITY",
  usedCurrentTopic: true, currentTopicId: "topic-2", usedUserExperience: true, publishMode: "TEXT",
};
const publishLog = (metadata = generalMetadata) => ({ status: "published", post_id: identity.postId,
  created_at: new Date(reference).toISOString(), text: "private post text", metadata: structuredClone(metadata) });
const forbiddenCalls = { network: 0, writes: 0, sourceReads: 0 };
class ReadOnlyKv {
  constructor(target = snapshot(), metadata = generalMetadata, histories = history()) {
    this.values = new Map([[logKey, publishLog(metadata)], ...[target, ...histories].map((item) => [snapshotKey(item), item])]);
    this.reads = [];
    this.lists = [];
  }
  async list(options) {
    if (options.prefix !== "post_log:" && !options.prefix.startsWith("post_insight_snapshot:v1:")) forbiddenCalls.sourceReads += 1;
    assert.ok(options.prefix === "post_log:" || options.prefix.startsWith("post_insight_snapshot:v1:"), "no source store discovery");
    this.lists.push(options);
    return { keys: [...this.values.keys()].filter((key) => key.startsWith(options.prefix)).map((name) => ({ name })), list_complete: true };
  }
  async get(keys, type) {
    assert.equal(type, "json");
    this.reads.push(keys);
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      if (!key.startsWith("post_log:") && !key.startsWith("post_insight_snapshot:v1:")) forbiddenCalls.sourceReads += 1;
      assert.ok(key.startsWith("post_log:") || key.startsWith("post_insight_snapshot:v1:"), "no Topic/Opportunity/media/history/latest reads");
    }
    return Array.isArray(keys) ? new Map(keys.map((key) => [key, structuredClone(this.values.get(key) ?? null)])) :
      structuredClone(this.values.get(keys) ?? null);
  }
  async put() { forbiddenCalls.writes += 1; assert.fail("no attribution writes"); }
  async delete() { forbiddenCalls.writes += 1; assert.fail("no attribution deletes"); }
}
const run = (kv = new ReadOnlyKv(), scope = identity, windowId = "D1") => getContentPerformanceAttribution({ THREADS_KV: kv }, scope, windowId);
async function result(kv, scope = identity, windowId = "D1") {
  const response = await run(kv, scope, windowId);
  assert.equal(response.available, true, response.reason);
  return response.attribution;
}
async function unavailable(kv, reason, scope = identity, windowId = "D1") {
  const response = await run(kv, scope, windowId);
  assert.equal(response.available, false);
  assert.equal(response.reason, reason);
  assert.equal(response.attribution, null);
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { forbiddenCalls.network += 1; assert.fail("no Threads/OpenAI/network calls"); };
after(() => {
  globalThis.fetch = originalFetch;
  assert.deepEqual(forbiddenCalls, { network: 0, writes: 0, sourceReads: 0 });
});

test("General projects saved provenance, never Commerce labels or default usage negatives", async () => {
  const kv = new ReadOnlyKv();
  kv.values.get(logKey).metadata.contentAngle = "DISCOVERY";
  kv.values.get(logKey).metadata.hookType = "CURIOSITY";
  const output = await result(kv);
  assert.deepEqual(output.identity, identity);
  assert.equal(output.provenance.kind, "general");
  assert.deepEqual(output.provenance.source, { kind: "post_log", key: logKey });
  for (const [field, value] of Object.entries(output.provenance.general)) assert.equal(value, generalMetadata[field]);
  assert.equal(output.provenance.common.contentBasis, "CURRENT_TOPIC");
  assert.equal(output.provenance.general.currentTopicId, "topic-1");
  assert.equal(output.provenance.general.hookStyle, "saved hook");
  assert.equal(output.provenance.commerce, null);
  for (const field of ["usedCurrentTopic", "usedUserExperience", "contentAngle", "hookType"]) {
    assert.equal(Object.hasOwn(output.provenance.general, field), false);
    assert.equal(Object.hasOwn(output.provenance.common, field), false);
  }
  assert.ok(output.provenance.fieldIssues.some((item) => item.field === "usedCurrentTopic"));
  assert.ok(output.provenance.fieldIssues.some((item) => item.field === "usedUserExperience"));
  const experience = await result(new ReadOnlyKv(snapshot(), { ...generalMetadata, contentBasis: "USER_EXPERIENCE",
    contentMode: "everyday_personal", currentTopicId: null, experienceNote: "private personal experience" }));
  assert.equal(experience.provenance.common.contentBasis, "USER_EXPERIENCE");
  assert.equal(experience.provenance.common.mediaId, "image-1");
  assert.equal(JSON.stringify(experience).includes("experienceNote"), false);
});

test("Commerce preserves enum labels, declared flags and PRODUCT_OPPORTUNITY basis", async () => {
  const output = await result(new ReadOnlyKv(snapshot(), commerceMetadata));
  assert.equal(output.provenance.kind, "commerce");
  assert.equal(output.provenance.general, null);
  assert.equal(output.provenance.common.contentBasis, "PRODUCT_OPPORTUNITY");
  assert.deepEqual(output.provenance.commerce, { authority: "publish_submission", opportunityId: "opportunity-1",
    contentAngle: "DISCOVERY", hookType: "CURIOSITY", currentTopicId: "topic-2", usedCurrentTopic: true, usedUserExperience: true });
  for (const angle of ["FAILURE", "OBSERVATION", "REVERSAL", "DISCOVERY", "COMPARISON", "RELATABLE_MOMENT", "QUESTION", "PRACTICAL_TIP"]) {
    assert.equal((await result(new ReadOnlyKv(snapshot(), { ...commerceMetadata, contentAngle: angle }))).provenance.commerce.contentAngle, angle);
  }
  for (const hook of ["CONTRARIAN", "CURIOSITY", "CONFESSION", "SPECIFIC_MOMENT", "UNEXPECTED_RESULT", "DIRECT_QUESTION", "OBSERVATION"]) {
    assert.equal((await result(new ReadOnlyKv(snapshot(), { ...commerceMetadata, hookType: hook }))).provenance.commerce.hookType, hook);
  }
  const negative = await result(new ReadOnlyKv(snapshot(), { ...commerceMetadata,
    usedCurrentTopic: false, currentTopicId: null, usedUserExperience: false }));
  assert.equal(negative.provenance.commerce.usedCurrentTopic, false);
  assert.equal(negative.provenance.commerce.usedUserExperience, false);
});

test("invalid and absent optional metadata stays partial, with issues and no repairs", async () => {
  for (const field of ["contentAngle", "hookType"]) {
    for (const value of ["UNKNOWN", " DISCOVERY ", 1, null]) {
      const output = await result(new ReadOnlyKv(snapshot(), { ...commerceMetadata, [field]: value }));
      assert.equal(output.provenance.commerce[field], null);
      assert.ok(output.provenance.fieldIssues.some((item) => item.field === field));
    }
  }
  const noStory = await result(new ReadOnlyKv(snapshot(), { ...commerceMetadata,
    contentAngle: null, hookType: null, usedCurrentTopic: false, usedUserExperience: false, currentTopicId: null }));
  assert.equal(noStory.provenance.commerce.usedCurrentTopic, null);
  assert.equal(noStory.provenance.commerce.usedUserExperience, null);
  for (const changes of [{ usedCurrentTopic: true, currentTopicId: null }, { usedCurrentTopic: false, currentTopicId: "topic" },
    { usedCurrentTopic: false, currentTopicId: 123 }, { usedCurrentTopic: "false" }]) {
    const output = await result(new ReadOnlyKv(snapshot(), { ...commerceMetadata, ...changes }));
    assert.equal(output.provenance.commerce.usedCurrentTopic, null);
    assert.ok(output.provenance.fieldIssues.some((item) => item.field === "usedCurrentTopic"));
  }
  const partial = await result(new ReadOnlyKv(snapshot(), {
    ...identity, source: "cron_auto_general", contentMode: "everyday_personal", contentBasis: "PERSONA",
  }));
  assert.equal(partial.provenance.general.hookStyle, null);
  assert.equal(partial.provenance.common.publishMode, null);
  assert.equal(partial.provenance.general.questionUsed, null);
  assert.ok(partial.provenance.fieldIssues.some((item) => item.field === "hookStyle" && item.reason === "missing"));
});

test("unknown kind uses positive evidence only and never maps taxonomies", async () => {
  for (const metadata of [{ ...identity }, { ...identity, source: "manual" }, { ...commerceMetadata, contentBasis: "USER_EXPERIENCE" },
    { ...generalMetadata, contentBasis: "UNRECOGNIZED" }, { ...generalMetadata, source: "external_import" },
    { ...generalMetadata, opportunityId: "conflicting" }]) {
    const output = await result(new ReadOnlyKv(snapshot(), metadata));
    assert.equal(output.provenance.kind, "unknown");
    assert.equal(output.provenance.general, null);
    assert.equal(output.provenance.commerce, null);
    assert.equal(output.provenance.common.contentBasis, metadata.contentBasis === "UNRECOGNIZED" ? null : metadata.contentBasis ?? null);
  }
  for (const basis of ["CURRENT_TOPIC", "USER_EXPERIENCE", "PERSONA", "CONTENT_POOL"]) {
    assert.equal((await result(new ReadOnlyKv(snapshot(), { ...generalMetadata, contentBasis: basis }))).provenance.common.contentBasis, basis);
  }
});

test("exact scope and window checked before reads; no default workspace or postId-only join", async () => {
  for (const field of Object.keys(identity)) {
    for (const value of [undefined, null, "", " "]) {
      const kv = new ReadOnlyKv();
      await unavailable(kv, "invalid_attribution_identity", { ...identity, [field]: value });
      assert.equal(kv.reads.length + kv.lists.length, 0);
    }
    const kv = new ReadOnlyKv();
    await unavailable(kv, "published_log_not_found", { ...identity, [field]: "other" });
    if (field === "postId") kv.values.get(logKey).post_id = "other";
    else kv.values.get(logKey).metadata[field] = "other";
    await unavailable(kv, "snapshot_not_found", { ...identity, [field]: "other" });
  }
  const kv = new ReadOnlyKv();
  await unavailable(kv, "invalid_attribution_window", identity, "D7");
  assert.equal(kv.lists.length, 0);
  const special = { workspaceId: "ws:a/%", connectedAccountId: "acc:b", threadsUserId: "user:c", postId: "post:d" };
  const specialKv = new ReadOnlyKv(snapshot(special), { ...generalMetadata, ...special }, []);
  specialKv.values.get(logKey).post_id = special.postId;
  assert.deepEqual((await result(specialKv, special)).identity, special);
});

test("missing, multiple or incompletely discovered successful logs fail closed", async () => {
  const none = new ReadOnlyKv(); none.values.delete(logKey);
  await unavailable(none, "published_log_not_found");
  const duplicate = new ReadOnlyKv(); duplicate.values.set("post_log:2:fixture", publishLog());
  await unavailable(duplicate, "published_log_ambiguous");
  const incomplete = new ReadOnlyKv();
  incomplete.list = async () => ({ keys: [{ name: logKey }], list_complete: false });
  await unavailable(incomplete, "log_pagination_invalid");
});

test("raw trusted snapshot invalidity is rejected rather than normalized into validity", async () => {
  for (const changes of [{ schemaVersion: 2 }, { integrityVersion: 0 }, { collectionStatus: "failed" },
    { ownershipSource: "guessed" }, { observationAgeSeconds: 1 }, { publishedAt: "invalid" }, { observedAt: "invalid" },
    { interactions: 999 }, { engagementRate: 999 }, { metricAvailability: {} }, { views: -1 }]) {
    await unavailable(new ReadOnlyKv(snapshot(changes)), "invalid_trusted_snapshot");
  }
  for (const field of [...Object.keys(identity), "windowId"]) {
    const kv = new ReadOnlyKv(); kv.values.get(snapshotKey(snapshot()))[field] = "foreign";
    await unavailable(kv, "snapshot_identity_mismatch");
  }
  const missing = new ReadOnlyKv(); missing.values.delete(snapshotKey(snapshot()));
  await unavailable(missing, "snapshot_not_found");
  const failed = new ReadOnlyKv();
  const original = failed.get.bind(failed);
  failed.get = async (...args) => { if (typeof args[0] === "string") throw new Error("private failure"); return original(...args); };
  await unavailable(failed, "snapshot_read_failed");
});

test("D1 and D3 independently reuse original baseline values, including percentage-point deltas", async () => {
  const kv = new ReadOnlyKv();
  const d3 = snapshot({ hours: 80, metrics: { views: 40 } });
  for (const item of [d3, ...history(10, { hours: 80 })]) kv.values.set(snapshotKey(item), item);
  for (const target of [snapshot(), d3]) {
    const output = await result(kv, identity, target.windowId);
    assert.equal(output.observation.windowId, target.windowId);
    assert.equal(output.observation.observationAgeSeconds, target.observationAgeSeconds);
    const expected = buildAccountPerformanceBaseline(target, history(10, { hours: target.windowId === "D1" ? 32 : 80 }));
    for (const [group, metrics] of Object.entries(expected.metrics)) {
      for (const [name, metric] of Object.entries(metrics)) {
        assert.deepEqual(output.performance.metrics[group][name], {
          targetValue: metric.targetValue, baselineMedian: metric.median, delta: metric.delta, sampleCount: metric.sampleCount,
        });
      }
    }
    assert.deepEqual(output.performance.baseline.policy, expected.policy);
    assert.deepEqual(output.performance.baseline.cohort, expected.cohort);
    assert.equal(output.performance.baseline.reason, null);
    assert.equal(output.performance.metrics.conversation.replyRate.delta, target.windowId === "D1" ? 8 : 3);
    assert.equal(JSON.stringify(output).includes('"q1"'), false);
    assert.equal(JSON.stringify(output).includes('"q3"'), false);
  }
  await unavailable(new ReadOnlyKv(), "snapshot_not_found", identity, "D3");
});

test("observed zero, partial metrics and insufficient samples remain distinct", async () => {
  const zero = await result(new ReadOnlyKv(snapshot({ metrics: Object.fromEntries(POST_INSIGHT_METRICS.map((key) => [key, 0])) })));
  assert.equal(zero.performance.metrics.reach.views.targetValue, 0);
  assert.equal(zero.performance.metrics.conversation.replyRate.targetValue, null);
  const partial = await result(new ReadOnlyKv(snapshot({ metrics: { likes: null, replies: 0 } })));
  assert.equal(partial.performance.metrics.engagement.engagementRate.targetValue, null);
  assert.equal(partial.performance.metrics.engagement.engagementRate.delta, null);
  assert.equal(partial.performance.metrics.conversation.replyRate.targetValue, 0);
  assert.equal(partial.performance.metrics.conversation.replyRate.delta, -2);
  assert.equal(partial.observation.collectionStatus, "partial");
  for (const count of [0, 9]) {
    const small = await result(new ReadOnlyKv(snapshot(), generalMetadata, history(count)));
    assert.equal(small.performance.baseline.available, true);
    assert.equal(small.performance.baseline.reason, "insufficient_samples");
    assert.equal(small.performance.metrics.reach.views.sampleCount, count);
    assert.equal(small.performance.metrics.reach.views.baselineMedian, null);
    assert.equal(small.performance.metrics.reach.views.targetValue, 20);
  }
  const partialHistory = await result(new ReadOnlyKv(snapshot(), generalMetadata, history(10, { metrics: { likes: null } })));
  assert.equal(partialHistory.performance.baseline.reason, "partial_insufficient_samples");
  assert.deepEqual(partialHistory.performance.baseline.insufficientSampleMetrics, ["engagement.engagementRate"]);
});

test("baseline discovery failure or budget exhaustion retains trusted target values", async () => {
  for (const mode of ["list", "bulk", "budget"]) {
    const kv = new ReadOnlyKv();
    const originalList = kv.list.bind(kv);
    const originalGet = kv.get.bind(kv);
    kv.list = async (options) => {
      if (options.prefix !== "post_log:") {
        if (mode === "list") throw new Error("private provider error");
        if (mode === "budget") return { keys: Array.from({ length: 5001 }, (_, i) => ({ name: `${options.prefix}${i}:D1` })), list_complete: true };
      }
      return originalList(options);
    };
    kv.get = async (...args) => {
      if (mode === "bulk" && Array.isArray(args[0]) && args[0][0].startsWith("post_insight_snapshot:")) throw new Error("private read error");
      return originalGet(...args);
    };
    const output = await result(kv);
    assert.equal(output.performance.baseline.available, false);
    assert.equal(output.performance.baseline.reason, { list: "snapshot_list_failed", bulk: "snapshot_bulk_read_failed", budget: "snapshot_key_budget_exceeded" }[mode]);
    assert.deepEqual(output.performance.metrics.reach.views, { targetValue: 20, baselineMedian: null, delta: null, sampleCount: null });
    assert.equal(JSON.stringify(output).includes("private"), false);
  }
});

test("actual logger defaults, privacy allowlist, immutable data and no source/network/write calls", async () => {
  const kv = new ReadOnlyKv(snapshot(), generalMetadata);
  let saved;
  await logPostSuccess({ THREADS_KV: { put: async (_key, value) => { saved = JSON.parse(value); } } },
    "private username", identity.postId, "private text", { ...commerceMetadata, contentAngle: undefined,
      hookType: undefined, usedCurrentTopic: undefined, usedUserExperience: undefined, currentTopicId: undefined });
  kv.values.set(logKey, saved);
  const stored = await result(kv);
  assert.equal(stored.provenance.commerce.usedCurrentTopic, null);
  assert.equal(stored.provenance.commerce.usedUserExperience, null);
  kv.values.set(logKey, publishLog({ ...commerceMetadata, experienceNote: "private experience", primaryStoryIdea: "private idea",
    narrativeSource: "private narrative", category: "private category", secret: "private ignored field" }));
  kv.values.get(snapshotKey(snapshot())).metricAvailability.experienceNote = "private unexpected nested field";
  const before = structuredClone([...kv.values]);
  for (const value of kv.values.values()) {
    if (value.metadata) Object.freeze(value.metadata);
    if (value.metricAvailability) Object.freeze(value.metricAvailability);
    Object.freeze(value);
  }
  const output = await result(kv);
  assert.equal(JSON.stringify(output).includes("private"), false);
  for (const field of ["experienceNote", "primaryStoryIdea", "narrativeSource", "category"]) assert.equal(Object.hasOwn(output.provenance.commerce, field), false);
  assert.deepEqual([...kv.values], before);
});
