import { listAccountInsightSnapshots, snapshotKey } from "./insight-snapshots.js";
import { getScopedSuccessfulPostLogs } from "./logger.js";
import { validateAttributionIdentity, inspectAttributionSnapshot, composeContentPerformanceAttribution } from "./content-performance-attribution.js";
import { buildAccountPerformanceBaseline, ACCOUNT_BASELINE_POLICY, performanceQuantile } from "./account-performance-baseline.js";

const SCOPE_FIELDS = ["workspaceId", "connectedAccountId", "threadsUserId"];
const POLICY = Object.freeze({ lookbackDays: 14, maxPosts: 100, minimumSamples: 10, maxGroupValues: 20,
  quantileMethod: "linear_(n-1)*p" });
const COMMON = ["contentBasis", "contentMode"];
const FIELDS = {
  general: [...COMMON, "currentTopicCategory", "style", "contentType", "emotion", "hookStyle", "endingStyle"],
  commerce: [...COMMON, "contentAngle", "hookType", "usedCurrentTopic", "usedUserExperience"],
};
const METRICS = { reach: ["views"], engagement: ["engagementRate"], conversation: ["replyRate"],
  distribution: ["repostRate", "quoteRate", "shareRate"] };
const LIMITATIONS = ["descriptive_not_causal", "sample_threshold_is_not_statistical_significance",
  "snapshot_coverage_is_not_all_published_posts", "kv_eventual_consistency", "bounded_global_log_scan",
  "account_baseline_mixes_general_and_commerce", "baseline_does_not_control_all_time_or_audience_changes",
  "within_window_observation_ages_vary", "commerce_metadata_is_publish_submission", "stored_labels_are_not_semantically_clustered"];
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const nonnegative = (value) => finite(value) && value >= 0;
const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const count = (counts, reason) => { counts[reason] = (counts[reason] || 0) + 1; };

function envelope(scope, windowId, asOf) {
  const scopeCopy = Object.fromEntries(SCOPE_FIELDS.map((field) => [field, typeof scope?.[field] === "string" ? scope[field] : null]));
  const end = typeof asOf === "string" ? Date.parse(asOf) : NaN;
  const before = end - (windowId === "D1" ? 48 : 96) * 3600000;
  const period = Number.isFinite(before) && Number.isFinite(before - 14 * 86400000) &&
    Math.abs(before - 14 * 86400000) <= 8640000000000000 ? {
      asOf: new Date(end).toISOString(), publishedFrom: new Date(before - 14 * 86400000).toISOString(),
      publishedBefore: new Date(before).toISOString(), maxPosts: POLICY.maxPosts,
    } : null;
  return { schemaVersion: 1, available: false, reason: null, scope: { ...scopeCopy, windowId },
    interpretationMode: "DESCRIPTIVE", causalClaimAllowed: false, period, policy: { ...POLICY },
    coverage: null, groupings: [], baselinePolicy: { ...ACCOUNT_BASELINE_POLICY }, limitations: [...LIMITATIONS] };
}
function requestError(scope, windowId, result) {
  if (validateAttributionIdentity({ ...scope, postId: "probe" }, windowId)) return "invalid_aggregation_scope";
  return result.period ? null : "invalid_as_of";
}
function inPeriod(observation, period) {
  const published = Date.parse(observation.publishedAt);
  const observed = Date.parse(observation.observedAt);
  return published >= Date.parse(period.publishedFrom) && published < Date.parse(period.publishedBefore) &&
    observed <= Date.parse(period.asOf);
}
function distribution(values) {
  const enough = values.length >= POLICY.minimumSamples;
  const sorted = [...values].sort((a, b) => a - b);
  return { available: enough, reason: enough ? null : "insufficient_samples",
    median: enough ? performanceQuantile(sorted, 0.5) : null,
    q1: enough ? performanceQuantile(sorted, 0.25) : null, q3: enough ? performanceQuantile(sorted, 0.75) : null };
}
function deltaExclusion(attribution, metric) {
  if (attribution.performance.baseline?.available !== true) return "baseline_unavailable";
  if (!Number.isInteger(metric?.sampleCount) || metric.sampleCount < 0) return "baseline_sample_count_unavailable";
  if (metric.sampleCount < ACCOUNT_BASELINE_POLICY.minimumValidSamples) return "baseline_insufficient_samples";
  if (!nonnegative(metric.targetValue)) return "target_unavailable";
  if (!nonnegative(metric.baselineMedian)) return "baseline_median_unavailable";
  return finite(metric.delta) ? null : "delta_unavailable";
}
function summarizeMetric(records, group, name) {
  const targets = [], deltas = [];
  const excludedDeltaCounts = {};
  for (const record of records) {
    const metric = record.performance.metrics?.[group]?.[name];
    if (nonnegative(metric?.targetValue)) targets.push(metric.targetValue);
    const reason = deltaExclusion(record, metric);
    if (reason) count(excludedDeltaCounts, reason);
    else deltas.push(metric.delta);
  }
  return { validMetricCount: targets.length, validDeltaCount: deltas.length,
    target: distribution(targets), delta: distribution(deltas), excludedDeltaCounts };
}
function groupingValue(record, field) {
  if (field === "currentTopicCategory" && record.provenance.common?.contentBasis !== "CURRENT_TOPIC") return { reason: "not_applicable" };
  if (record.provenance.fieldIssues.some((issue) => issue.field === field)) return { reason: "missing_or_invalid_provenance" };
  const fields = COMMON.includes(field) ? record.provenance.common : record.provenance[record.provenance.kind];
  const value = fields?.[field];
  const valid = field === "usedCurrentTopic" || field === "usedUserExperience"
    ? typeof value === "boolean" : typeof value === "string" && Boolean(value.trim());
  return valid ? { value } : { reason: "missing_or_invalid_provenance" };
}
function grouping(records, kind, field) {
  const buckets = new Map();
  let excludedCount = 0;
  for (const record of records) {
    const selection = groupingValue(record, field);
    if (selection.reason) { excludedCount += 1; continue; }
    if (!buckets.has(selection.value)) buckets.set(selection.value, []);
    buckets.get(selection.value).push(record);
  }
  const available = buckets.size <= POLICY.maxGroupValues;
  return { kind, field, available, reason: available ? null : "too_many_group_values", excludedCount,
    groups: available ? [...buckets].sort(([a], [b]) => lexical(a, b)).map(([value, members]) => {
      const ages = members.map((item) => item.observation.observationAgeSeconds).sort((a, b) => a - b);
      return { value, postCount: members.length,
        observationAgeSeconds: { min: ages[0], median: performanceQuantile(ages, 0.5), max: ages.at(-1) },
        metrics: Object.fromEntries(Object.entries(METRICS).map(([group, names]) => [group,
          Object.fromEntries(names.map((name) => [name, summarizeMetric(members, group, name)])),
        ])) };
    }) : [] };
}

// Pure aggregation of service-owned L06 records; this is not a client JSON API.
// Discovery/cap is the facade's responsibility. Never dedupe or refill a batch.
export function buildAttributionAggregation(scope, windowId, attributions, { asOf = new Date().toISOString() } = {}) {
  const result = envelope(scope, windowId, asOf);
  const invalid = requestError(scope, windowId, result);
  if (invalid) return { ...result, reason: invalid };
  if (!Array.isArray(attributions) || attributions.length > POLICY.maxPosts) return { ...result, reason: "invalid_attribution_batch" };
  const seen = new Set();
  for (const record of attributions) {
    if (record?.schemaVersion !== 1 || !record.performance || !record.provenance ||
        !Array.isArray(record.provenance.fieldIssues) || !["general", "commerce", "unknown"].includes(record.provenance.kind)) {
      return { ...result, reason: "invalid_attribution_batch" };
    }
    const id = record.identity;
    if (validateAttributionIdentity(id, windowId) || !SCOPE_FIELDS.every((field) => id[field] === scope[field]) ||
        record.observation?.windowId !== windowId || ![...SCOPE_FIELDS, "postId"].every((field) => record.observation[field] === id[field])) {
      return { ...result, reason: "attribution_scope_mismatch" };
    }
    if (seen.has(id.postId)) return { ...result, reason: "duplicate_attribution_identity" };
    seen.add(id.postId);
    if (!inPeriod(record.observation, result.period) || !nonnegative(record.observation.observationAgeSeconds)) {
      return { ...result, reason: "attribution_outside_period" };
    }
  }
  const coverage = { discoveryComplete: null, candidateCount: attributions.length, attributedCount: attributions.length,
    excludedCounts: {}, truncatedByPostLimit: false, postLimitExcludedCount: 0,
    unknownKindCount: 0, missingOrInvalidProvenanceCount: 0,
    baselineUnavailableCount: 0, baselineInsufficientSamplesCount: 0 };
  for (const record of attributions) {
    if (record.provenance.kind === "unknown") coverage.unknownKindCount += 1;
    else if (FIELDS[record.provenance.kind].some((field) => groupingValue(record, field).reason === "missing_or_invalid_provenance")) {
      coverage.missingOrInvalidProvenanceCount += 1;
    }
    if (record.performance.baseline?.available !== true) coverage.baselineUnavailableCount += 1;
    else if (Object.entries(METRICS).some(([group, names]) => names.some((name) =>
      deltaExclusion(record, record.performance.metrics?.[group]?.[name]) === "baseline_insufficient_samples"))) {
      coverage.baselineInsufficientSamplesCount += 1;
    }
  }
  return { ...result, available: true, coverage,
    groupings: Object.entries(FIELDS).flatMap(([kind, fields]) => {
      const records = attributions.filter((record) => record.provenance.kind === kind);
      return fields.map((field) => grouping(records, kind, field));
    }) };
}

// Internal service: authorize the account before calling. Only post_log and
// scoped snapshots are read. Counts describe discovered snapshots, not all posts.
export async function getAttributionAggregation(env, scope, windowId, { asOf = new Date().toISOString() } = {}) {
  const result = envelope(scope, windowId, asOf);
  const invalid = requestError(scope, windowId, result);
  if (invalid) return { ...result, reason: invalid };
  const discovery = await listAccountInsightSnapshots(env, scope, windowId, { strictDiscovery: true });
  if (!discovery.available) return { ...result, reason: discovery.reason };
  // Discovery-normalized records provide candidate identities and the existing
  // L05 history view. Targets below must still pass raw L06 validation.
  const eligible = discovery.snapshots.filter((item) => inPeriod(item, result.period))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || lexical(a.postId, b.postId));
  const candidates = eligible.slice(0, POLICY.maxPosts);
  if (new Set(candidates.map((item) => item.postId)).size !== candidates.length) return { ...result, reason: "duplicate_attribution_identity" };
  const exclusions = {};
  const attributions = [];
  if (candidates.length) {
    const keys = candidates.map((item) => snapshotKey(item, windowId));
    let raw;
    try { raw = await env.THREADS_KV.get(keys, "json"); }
    catch { return { ...result, reason: "target_snapshot_bulk_read_failed" }; }
    if (!(raw instanceof Map) || keys.some((key) => !raw.has(key))) return { ...result, reason: "target_snapshot_bulk_read_failed" };
    const logs = await getScopedSuccessfulPostLogs(env, scope, candidates.map((item) => item.postId));
    if (!logs.available) return { ...result, reason: logs.reason };
    for (const item of candidates) {
      const snapshot = raw.get(snapshotKey(item, windowId));
      const inspected = inspectAttributionSnapshot(snapshot, item, windowId);
      if (inspected.reason) { count(exclusions, inspected.reason); continue; }
      if (!inPeriod(snapshot, result.period) || snapshot.publishedAt !== item.publishedAt || snapshot.observedAt !== item.observedAt) {
        count(exclusions, "snapshot_changed_during_discovery"); continue;
      }
      const log = logs.results.get(item.postId);
      if (!log.available) { count(exclusions, log.reason); continue; }
      const { scannedKeys, listCalls, bulkReadCalls } = discovery;
      const comparison = { available: true, reason: null, baseline: buildAccountPerformanceBaseline(snapshot, discovery.snapshots),
        discovery: { available: true, reason: null, scannedKeys, listCalls, bulkReadCalls } };
      attributions.push(composeContentPerformanceAttribution(log.entry, inspected.dimensions, comparison, logs.discovery).attribution);
    }
  }
  const aggregate = buildAttributionAggregation(scope, windowId, attributions, { asOf });
  if (!aggregate.available) return aggregate;
  aggregate.coverage = { ...aggregate.coverage, discoveryComplete: true,
    discoveredSnapshotCount: discovery.snapshots.length, invalidDiscoverySnapshotCount: discovery.invalidSnapshotCount,
    eligibleCount: eligible.length, candidateCount: candidates.length, excludedCounts: exclusions,
    truncatedByPostLimit: eligible.length > candidates.length, postLimitExcludedCount: eligible.length - candidates.length };
  return aggregate;
}
