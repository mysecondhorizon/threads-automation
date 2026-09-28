import assert from "node:assert/strict";
import { test, after } from "node:test";
import { buildAttributionAggregation, getAttributionAggregation } from "./attribution-aggregation.js";
import { getContentPerformanceAttribution, inspectAttributionSnapshot, composeContentPerformanceAttribution } from "./content-performance-attribution.js";
import { getScopedSuccessfulPostLog, getScopedSuccessfulPostLogs } from "./logger.js";
import { buildAccountPerformanceBaseline } from "./account-performance-baseline.js";
import { listAccountInsightSnapshots, snapshotKey } from "./insight-snapshots.js";
import { deriveInsightTotals, POST_INSIGHT_METRICS } from "./insights.js";

const scope = { workspaceId: "ws", connectedAccountId: "account", threadsUserId: "user" };
const asOf = "2026-10-30T00:00:00.000Z";
const now = Date.parse(asOf), hour = 3600000, day = 24 * hour;
const options = { asOf };
function snapshot({ postId = "post", daysAgo = 5, age = 32, metrics: changes = {}, ...overrides } = {}) {
  const metrics = { views: 100, likes: 3, replies: 2, reposts: 1, quotes: 0, shares: 0, ...changes };
  return { ...scope, postId, schemaVersion: 1, integrityVersion: 1, ownershipSource: "published_log",
    windowId: age >= 72 ? "D3" : "D1", publishedAt: new Date(now - daysAgo * day).toISOString(),
    observedAt: new Date(now - daysAgo * day + age * hour).toISOString(), observationAgeSeconds: age * 3600,
    collectionStatus: Object.values(metrics).every((value) => value !== null) ? "success" : "partial",
    metricAvailability: Object.fromEntries(POST_INSIGHT_METRICS.map((name) => [name, metrics[name] !== null])),
    ...metrics, ...deriveInsightTotals(metrics), ...overrides };
}
const history = (age = 32) => Array.from({ length: 10 }, (_, i) => snapshot({ postId: `history-${i}`, daysAgo: 10 + i, age }));
const general = { source: "cron_auto_general", contentMode: "current_topic_reaction", contentBasis: "CURRENT_TOPIC",
  currentTopicCategory: "daily", currentTopicId: "private-topic-id", style: "short", contentType: "작은 발견형",
  emotion: "calm", hookStyle: "observed-opening", endingStyle: "open", questionUsed: false, publishMode: "TEXT",
  usedCurrentTopic: false, usedUserExperience: false, currentTopicSelectedAngle: "private topic text",
  experienceNote: "private experience", mediaId: "private-media-id" };
const commerce = { source: "COMMERCE_MANUAL", contentMode: "commerce_manual", contentBasis: "PRODUCT_OPPORTUNITY",
  opportunityId: "private-opportunity-id", contentAngle: "DISCOVERY", hookType: "OBSERVATION", usedCurrentTopic: false,
  currentTopicId: null, usedUserExperience: true, publishMode: "TEXT" };
function record(index = 0, metadata = general, changes = {}) {
  const raw = snapshot({ postId: `post-${String(index).padStart(3, "0")}`, daysAgo: 5 + index / 1000, ...changes });
  const inspected = inspectAttributionSnapshot(raw, raw, raw.windowId);
  assert.equal(inspected.reason, null);
  const entry = { key: `post_log:${index}`, log: { status: "published", post_id: raw.postId, text: "private post body",
    metadata: { ...scope, ...metadata } } };
  const comparison = { available: true, reason: null, baseline: buildAccountPerformanceBaseline(raw, history(changes.age || 32)) };
  return composeContentPerformanceAttribution(entry, inspected.dimensions, comparison, null).attribution;
}
const records = (count = 10, metadata = general, changes = {}) => Array.from({ length: count }, (_, i) => record(i, metadata, changes));
const build = (items, windowId = "D1") => buildAttributionAggregation(scope, windowId, items, options);
function grouping(output, field = "contentBasis", kind = "general") {
  assert.equal(output.available, true, output.reason);
  return output.groupings.find((item) => item.kind === kind && item.field === field);
}
const metric = (output, group = "reach", name = "views") => grouping(output).groups[0].metrics[group][name];
const forbidden = { network: 0, writes: 0, sourceReads: 0 };
class MemoryKv {
  constructor(targets = [snapshot()], metadata = general, baseline = history()) {
    this.values = new Map([...baseline, ...targets].map((item) => [snapshotKey(item, item.windowId), structuredClone(item)]));
    targets.forEach((item, i) => this.values.set(`post_log:${String(i).padStart(5, "0")}`, {
      status: "published", post_id: item.postId, text: "private body", metadata: { ...scope, ...metadata },
    }));
    this.pageSize = 1000;
    this.lists = []; this.reads = []; this.snapshotBulkCalls = 0;
  }
  async list(input) {
    if (input.prefix !== "post_log:" && !input.prefix.startsWith("post_insight_snapshot:v1:")) forbidden.sourceReads++;
    assert.ok(input.prefix === "post_log:" || input.prefix.startsWith("post_insight_snapshot:v1:"));
    this.lists.push(input);
    const names = [...this.values.keys()].filter((key) => key.startsWith(input.prefix)).sort();
    const start = Number(input.cursor || 0), end = Math.min(start + this.pageSize, names.length);
    return { keys: names.slice(start, end).map((name) => ({ name })), cursor: String(end), list_complete: end === names.length };
  }
  async get(keys, type) {
    assert.equal(type, "json");
    this.reads.push(keys);
    if (Array.isArray(keys) && keys[0].startsWith("post_insight_snapshot:")) this.snapshotBulkCalls++;
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      if (!key.startsWith("post_log:") && !key.startsWith("post_insight_snapshot:v1:")) forbidden.sourceReads++;
      assert.ok(key.startsWith("post_log:") || key.startsWith("post_insight_snapshot:v1:"));
    }
    return Array.isArray(keys) ? new Map(keys.map((key) => [key, structuredClone(this.values.get(key) ?? null)])) :
      structuredClone(this.values.get(keys) ?? null);
  }
  async put() { forbidden.writes++; assert.fail("writes forbidden"); }
  async delete() { forbidden.writes++; assert.fail("deletes forbidden"); }
}
const get = (kv = new MemoryKv(), account = scope, windowId = "D1") => getAttributionAggregation({ THREADS_KV: kv }, account, windowId, options);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { forbidden.network++; assert.fail("external calls forbidden"); };
after(() => { globalThis.fetch = originalFetch; assert.deepEqual(forbidden, { network: 0, writes: 0, sourceReads: 0 }); });

test("exact workspace/account/user/window isolation, including invalid input and observation scope", async () => {
  for (const field of Object.keys(scope)) {
    const mixed = records(); mixed[0].identity[field] = "foreign";
    assert.equal(build(mixed).reason, "attribution_scope_mismatch");
    const observed = records(); observed[0].observation[field] = "foreign";
    assert.equal(build(observed).reason, "attribution_scope_mismatch");
    const kv = new MemoryKv();
    const empty = await get(kv, { ...scope, [field]: "foreign" });
    assert.equal(empty.coverage.attributedCount, 0);
    assert.equal(kv.lists.length, 1);
    const invalid = await get(kv, { ...scope, [field]: null });
    assert.equal(invalid.reason, "invalid_aggregation_scope");
  }
  assert.equal(build([record(0, general, { age: 80 })]).reason, "attribution_scope_mismatch");
  const kv = new MemoryKv([snapshot(), snapshot({ postId: "d3", age: 80 })]);
  assert.equal((await get(kv)).coverage.attributedCount, 1);
  assert.equal((await get(kv, scope, "D3")).coverage.attributedCount, 1);
  assert.equal((await get(kv, scope, "D7")).reason, "invalid_aggregation_scope");
  assert.equal(buildAttributionAggregation(scope, "D1", [], { asOf: "bad" }).reason, "invalid_as_of");
  for (const output of [build([]), build(null), await get(kv, {}, "D1")]) {
    assert.equal(output.interpretationMode, "DESCRIPTIVE"); assert.equal(output.causalClaimAllowed, false);
  }
});

test("General/Commerce taxonomy and exact single-field allowlists stay separate", () => {
  const output = build([...records(), ...records(10, commerce).map((item, i) => ({ ...item,
    identity: { ...item.identity, postId: `commerce-${i}` }, observation: { ...item.observation, postId: `commerce-${i}` } }))]);
  assert.deepEqual(output.groupings.filter((item) => item.kind === "general").map((item) => item.field),
    ["contentBasis", "contentMode", "currentTopicCategory", "style", "contentType", "emotion", "hookStyle", "endingStyle"]);
  assert.deepEqual(output.groupings.filter((item) => item.kind === "commerce").map((item) => item.field),
    ["contentBasis", "contentMode", "contentAngle", "hookType", "usedCurrentTopic", "usedUserExperience"]);
  for (const field of ["style", "contentType", "emotion", "hookStyle", "endingStyle"]) {
    assert.equal(grouping(output, field).groups[0].value, general[field]);
  }
  assert.equal(grouping(output).groups[0].postCount, 10);
  assert.equal(grouping(output, "contentBasis", "commerce").groups[0].value, "PRODUCT_OPPORTUNITY");
  assert.equal(grouping(output, "usedCurrentTopic", "commerce").groups[0].value, false);
  assert.equal(grouping(output, "usedUserExperience", "commerce").groups[0].value, true);
  for (const field of ["publishMode", "questionUsed", "currentTopicSelectedAngle", "opportunityId"]) {
    assert.equal(output.groupings.some((item) => item.field === field), false);
  }
  assert.equal(grouping(output, "hookType"), undefined);
  assert.equal(grouping(output, "hookStyle", "commerce"), undefined);
});

test("missing fields and fieldIssues exclude only that grouping, with no UNKNOWN/default false groups", () => {
  const items = records();
  items[0].provenance.general.style = null;
  items[1].provenance.fieldIssues.push({ field: "style", reason: "invalid" });
  items[2].provenance.common.contentBasis = "USER_EXPERIENCE";
  items[3].provenance.kind = "unknown";
  const output = build(items);
  assert.equal(grouping(output, "style").excludedCount, 2);
  assert.equal(grouping(output, "style").groups[0].postCount, 7);
  assert.equal(grouping(output, "emotion").groups[0].postCount, 9);
  assert.equal(grouping(output, "currentTopicCategory").excludedCount, 1);
  assert.equal(output.coverage.unknownKindCount, 1);
  assert.equal(output.coverage.missingOrInvalidProvenanceCount, 2);
  const noStory = build(records(10, { ...commerce, contentAngle: null, hookType: null, usedCurrentTopic: false, usedUserExperience: false }));
  for (const field of ["usedCurrentTopic", "usedUserExperience"]) {
    assert.deepEqual(grouping(noStory, field, "commerce").groups, []);
    assert.equal(grouping(noStory, field, "commerce").excludedCount, 10);
  }
  assert.equal(grouping(noStory, "contentBasis", "commerce").groups[0].postCount, 10);
});

test("20 exact group values allowed; 21 disables entire field without affecting others", () => {
  for (const size of [20, 21]) {
    const items = records(size).map((item, i) => { item.provenance.general.style = `style-${i}`; return item; });
    const output = build(items), styles = grouping(output, "style");
    assert.equal(styles.available, size === 20);
    assert.equal(styles.reason, size === 20 ? null : "too_many_group_values");
    assert.equal(styles.groups.length, size === 20 ? 20 : 0);
    assert.equal(grouping(output, "emotion").groups[0].postCount, size);
  }
});

test("target and delta counts, zero/null/negative values, interpolation and outliers", () => {
  const items = records();
  const targets = [0, 1, 2, 3, 4, 5, 6, 7, 8, 1000000];
  items.forEach((item, i) => Object.assign(item.performance.metrics.reach.views,
    { targetValue: targets[i], baselineMedian: 4, delta: targets[i] - 4 }));
  const output = build(items), value = metric(output);
  assert.equal(value.validMetricCount, 10); assert.equal(value.validDeltaCount, 10);
  assert.deepEqual(value.target, { available: true, reason: null, median: 4.5, q1: 2.25, q3: 6.75 });
  assert.deepEqual(value.delta, { available: true, reason: null, median: 0.5, q1: -1.75, q3: 2.75 });
  // A second view of the same untouched outlier values makes their upper tail visible.
  const upperTail = records(10);
  upperTail.forEach((item, i) => { item.performance.metrics.reach.views.targetValue = i < 7 ? i : 1000000; });
  assert.equal(metric(build(upperTail)).target.q3, 750001.5);
  items[0].performance.metrics.reach.views.targetValue = null;
  const partial = metric(build(items));
  assert.equal(partial.validMetricCount, 9); assert.equal(partial.validDeltaCount, 9);
  assert.equal(partial.target.median, null); assert.equal(partial.target.reason, "insufficient_samples");
  assert.equal(partial.delta.reason, "insufficient_samples");
  assert.equal(metric(build(items), "conversation", "replyRate").validDeltaCount, 10);
  for (const field of ["mean", "score", "ranking", "positiveCount", "negativeCount", "successRate"]) {
    assert.equal(JSON.stringify(output).includes(`"${field}"`), false);
  }
});

test("metric baseline eligibility is independent; unavailable targets never discard other observations", () => {
  const items = records(12);
  items[0].performance.baseline.available = false;
  items[1].performance.metrics.reach.views.sampleCount = 9;
  items[2].performance.metrics.reach.views.baselineMedian = null;
  items[3].performance.metrics.reach.views.delta = null;
  const output = build(items), reach = metric(output);
  assert.equal(reach.validMetricCount, 12); assert.equal(reach.validDeltaCount, 8);
  assert.equal(reach.target.available, true); assert.equal(reach.delta.available, false);
  assert.deepEqual(reach.excludedDeltaCounts, { baseline_unavailable: 1, baseline_insufficient_samples: 1,
    baseline_median_unavailable: 1, delta_unavailable: 1 });
  assert.equal(metric(output, "conversation", "replyRate").validDeltaCount, 11);
  assert.equal(output.coverage.baselineUnavailableCount, 1);
  assert.equal(output.coverage.baselineInsufficientSamplesCount, 1);
  assert.equal(output.coverage.attributedCount, 12);
  // Baseline sample counts are eligibility only, never summed or weighted.
  const weights = records(); weights.forEach((item, i) => { item.performance.metrics.reach.views.sampleCount = 10 + i * 100; });
  assert.deepEqual(metric(build(weights)), metric(build(records())));
});

test("nine/ten sample thresholds, min/median/max observation age and non-performance ordering", () => {
  for (const n of [9, 10]) {
    const output = build(records(n));
    assert.equal(metric(output).target.available, n === 10);
    assert.equal(metric(output).delta.available, n === 10);
  }
  const items = Array.from({ length: 10 }, (_, i) => record(i, { ...general, style: i < 5 ? "z" : "a" }, { age: 26 + i }));
  const before = structuredClone(items);
  const output = build(items);
  assert.deepEqual(grouping(output, "style").groups.map((item) => item.value), ["a", "z"]);
  assert.deepEqual(grouping(output).groups[0].observationAgeSeconds, { min: 26 * 3600, median: 30.5 * 3600, max: 35 * 3600 });
  assert.deepEqual(build([...items].reverse()), output);
  assert.deepEqual(items, before);
  const booleans = [record(0, commerce), record(1, { ...commerce, usedUserExperience: false })];
  assert.deepEqual(grouping(build(booleans), "usedUserExperience", "commerce").groups.map((item) => item.value), [false, true]);
});

test("14-day inclusive lower and exclusive D1/D3 maturity upper boundaries", async () => {
  for (const [windowId, maturity, age] of [["D1", 2, 32], ["D3", 4, 80]]) {
    const targets = [snapshot({ postId: "lower", daysAgo: maturity + 14, age }),
      snapshot({ postId: "too-old", daysAgo: maturity + 14 + 1 / day, age }),
      snapshot({ postId: "upper", daysAgo: maturity, age }),
      snapshot({ postId: "inside", daysAgo: maturity + 1 / day, age })];
    const kv = new MemoryKv(targets, general, []);
    const output = await get(kv, scope, windowId);
    assert.equal(output.available, true, output.reason);
    assert.equal(output.coverage.candidateCount, 2); assert.equal(output.coverage.attributedCount, 2);
    assert.equal(Date.parse(output.period.publishedBefore), now - maturity * day);
    assert.equal(Date.parse(output.period.publishedFrom), now - (maturity + 14) * day);
  }
});

test("cap 100 and same-time postId ordering, no refill after missing log/raw validation", async () => {
  const targets = Array.from({ length: 101 }, (_, i) => snapshot({ postId: `id-${String(i).padStart(3, "0")}` }));
  const kv = new MemoryKv([...targets].reverse(), general, []);
  // Select id-000..id-099 lexically, then exclude id-000 and id-001 without id-100 refill.
  for (const [key, value] of kv.values) if (key.startsWith("post_log:") && value.post_id === "id-000") kv.values.delete(key);
  const original = kv.get.bind(kv);
  let rawKeys;
  kv.get = async (keys, type) => {
    const response = await original(keys, type);
    if (Array.isArray(keys) && keys[0].startsWith("post_insight_snapshot:") && kv.snapshotBulkCalls === 3) {
      rawKeys = keys;
      response.get(snapshotKey(targets[1], "D1")).integrityVersion = 0;
    }
    return response;
  };
  const output = await get(kv);
  assert.equal(output.coverage.eligibleCount, 101); assert.equal(output.coverage.candidateCount, 100);
  assert.equal(output.coverage.attributedCount, 98); assert.equal(output.coverage.truncatedByPostLimit, true);
  assert.equal(output.coverage.postLimitExcludedCount, 1);
  assert.equal(output.coverage.excludedCounts.published_log_not_found, 1);
  assert.equal(output.coverage.excludedCounts.invalid_trusted_snapshot, 1);
  assert.equal(rawKeys.length, 100); assert.ok(!rawKeys.includes(snapshotKey(targets[100], "D1")));
});

test("duplicate batch identity fails whole result; duplicate success log excludes only one post", async () => {
  const one = record(); assert.equal(build([one, structuredClone(one)]).reason, "duplicate_attribution_identity");
  const kv = new MemoryKv([snapshot({ postId: "a" }), snapshot({ postId: "b" })]);
  kv.values.set("post_log:duplicate", { status: "published", post_id: "a", metadata: { ...scope, ...general } });
  kv.pageSize = 1;
  const output = await get(kv);
  assert.equal(output.available, true); assert.equal(output.coverage.attributedCount, 1);
  assert.equal(output.coverage.excludedCounts.published_log_ambiguous, 1);
  const repeated = new MemoryKv(); const originalList = repeated.list.bind(repeated);
  repeated.list = async (input) => {
    const page = await originalList(input);
    if (input.prefix.startsWith("post_insight_snapshot:")) page.keys.push(page.keys[0]);
    return page;
  };
  assert.equal((await get(repeated)).reason, "duplicate_snapshot_identity");
});

test("snapshot/log/target read failures and incomplete pagination never emit partial groups", async () => {
  for (const stage of ["snapshot-list", "snapshot-bulk", "log-list", "log-bulk", "target-bulk", "cursor"]) {
    const kv = new MemoryKv(); const originalList = kv.list.bind(kv), originalGet = kv.get.bind(kv);
    kv.list = async (input) => {
      if ((stage === "snapshot-list" && input.prefix.startsWith("post_insight_snapshot:")) ||
          (stage === "log-list" && input.prefix === "post_log:")) throw new Error("private error");
      if (stage === "cursor") return { keys: [], list_complete: false };
      return originalList(input);
    };
    kv.get = async (keys, type) => {
      if (Array.isArray(keys) && ((stage === "snapshot-bulk" && keys[0].startsWith("post_insight_snapshot:")) ||
          (stage === "log-bulk" && keys[0].startsWith("post_log:")) ||
          (stage === "target-bulk" && kv.snapshotBulkCalls === 1 && keys[0].startsWith("post_insight_snapshot:")))) throw new Error("private error");
      return originalGet(keys, type);
    };
    const output = await get(kv);
    assert.equal(output.available, false, stage); assert.deepEqual(output.groupings, []);
    assert.equal(output.coverage, null); assert.equal(JSON.stringify(output).includes("private"), false);
  }
});

test("batch snapshot/log budgets allow exact limits and fail closed on excess", async () => {
  // Directly exercise the same strict snapshot and batch-log readers used by the facade.
  for (const source of ["snapshot", "log"]) {
    for (const [size, pageSize, expected] of [[5000, 1000, null], [5001, 1000, "key"], [20, 1, null], [21, 1, "list"], [3417, 201, "bulk"]]) {
      const kv = new MemoryKv([], general, []);
      for (let i = 0; i < size; i++) {
        if (source === "snapshot") {
          const item = snapshot({ postId: `item-${i}` }); kv.values.set(snapshotKey(item, "D1"), item);
        } else kv.values.set(`post_log:${i}`, { status: i === 0 ? "published" : "failed", post_id: "post", metadata: scope });
      }
      kv.pageSize = pageSize;
      const output = source === "snapshot" ? await listAccountInsightSnapshots({ THREADS_KV: kv }, scope, "D1", { strictDiscovery: true }) :
        await getScopedSuccessfulPostLogs({ THREADS_KV: kv }, scope, ["post"]);
      assert.equal(output.available, expected === null, `${source}/${size}/${pageSize}`);
      if (expected) assert.equal(output.reason, `${source === "snapshot" ? "snapshot" : "log"}_${expected}_budget_exceeded`);
      if (!expected && size === 5000) assert.equal(source === "snapshot" ? output.bulkReadCalls : output.discovery.bulkReadCalls, 50);
    }
  }
});

test("shared L06 validation/projection and batched lookup are equivalent to single attribution", async () => {
  for (const metadata of [general, commerce]) {
    const targets = [snapshot({ postId: "a" }), snapshot({ postId: "b", metrics: { likes: null, replies: 0 } })];
    const kv = new MemoryKv(targets, metadata), env = { THREADS_KV: kv };
    const discovered = await listAccountInsightSnapshots(env, scope, "D1");
    const logs = await getScopedSuccessfulPostLogs(env, scope, targets.map((item) => item.postId));
    const singles = [];
    for (const raw of targets) {
      const single = await getContentPerformanceAttribution(env, raw, "D1");
      assert.equal(single.available, true);
      const { snapshots, ...discovery } = discovered;
      const comparison = { available: true, reason: null, baseline: buildAccountPerformanceBaseline(raw, snapshots), discovery };
      const composed = composeContentPerformanceAttribution(logs.results.get(raw.postId).entry,
        inspectAttributionSnapshot(raw, raw, "D1").dimensions, comparison, logs.discovery);
      assert.deepEqual(composed, single);
      assert.deepEqual(await getScopedSuccessfulPostLog(env, raw), { ...logs.results.get(raw.postId), discovery: logs.discovery });
      singles.push(single.attribution);
    }
    const fresh = new MemoryKv(targets, metadata), before = structuredClone([...fresh.values]);
    const aggregate = await get(fresh);
    assert.deepEqual(aggregate.groupings, build(singles).groupings);
    assert.equal(fresh.lists.filter((item) => item.prefix === "post_log:").length, 1);
    assert.equal(fresh.lists.filter((item) => item.prefix.startsWith("post_insight_snapshot:")).length, 1);
    assert.equal(fresh.snapshotBulkCalls, 2); // one discovery + one raw batch, not per post
    assert.deepEqual([...fresh.values], before);
    assert.equal(JSON.stringify(aggregate).includes("private"), false);
  }
});
