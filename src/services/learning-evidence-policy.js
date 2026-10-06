const SCOPE_FIELDS = ["workspaceId", "connectedAccountId", "threadsUserId"];
const WINDOWS = Object.freeze(["D1", "D3"]);
const METRIC_FAMILIES = {
  reach: ["views"],
  engagement: ["engagementRate"],
  conversation: ["replyRate"],
  distribution: ["repostRate", "quoteRate", "shareRate"],
};
const ALLOWED_FIELDS = {
  general: new Set(["contentBasis", "contentMode", "currentTopicCategory", "style", "contentType", "emotion", "hookStyle", "endingStyle"]),
  commerce: new Set(["contentBasis", "contentMode", "contentAngle", "hookType", "usedCurrentTopic", "usedUserExperience"]),
};

export const LEARNING_EVIDENCE_POLICY = Object.freeze({
  schemaVersion: 1,
  minimumSamples: 10,
  minimumSupportingFamilies: 2,
  maxLabelLength: 200,
  maxGroupings: 14,
  maxGroupValues: 20,
  requiredWindows: WINDOWS,
});

const LIMITATIONS = Object.freeze([
  "descriptive_not_causal",
  "d1_d3_observations_overlap",
  "sample_threshold_is_not_statistical_significance",
  "l07_discovery_and_kv_consistency_limits_apply",
  "stored_labels_are_not_semantically_clustered",
  "d1_d3_cohorts_are_not_matched",
  "grouping_exclusions_may_include_not_applicable",
  "freshness_relative_to_current_time_is_not_evaluated",
]);

const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const count = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 100;
const keyOf = (kind, field, value) => JSON.stringify([kind, field, value]);
const validLabel = (value) => typeof value === "string" && value.trim().length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value);
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function validPeriod(aggregation, windowId) {
  const period = aggregation?.period;
  const dates = [period?.asOf, period?.publishedFrom, period?.publishedBefore];
  if (!dates.every((value) => typeof value === "string" && value.length <= 30 && finite(Date.parse(value)))) return false;
  const [asOf, from, before] = dates.map(Date.parse);
  return asOf - before === (windowId === "D1" ? 48 : 96) * 3600000 &&
    before - from === 14 * 86400000 && period.maxPosts === 100;
}

function scopeOf(aggregation) {
  return aggregation?.scope && Object.fromEntries(SCOPE_FIELDS.map((field) => [field,
    validLabel(aggregation.scope[field]) ? aggregation.scope[field] : null]));
}

function validAggregation(aggregation, scope, windowId) {
  return aggregation?.schemaVersion === 1 && aggregation.available === true &&
    aggregation.interpretationMode === "DESCRIPTIVE" && aggregation.causalClaimAllowed === false &&
    aggregation.scope?.windowId === windowId &&
    SCOPE_FIELDS.every((field) => validLabel(aggregation.scope[field]) &&
      aggregation.scope[field] === scope[field]) && Array.isArray(aggregation.groupings);
}

function groupMap(aggregation) {
  const map = new Map();
  const rejected = [];
  const seen = new Set();
  for (const grouping of aggregation.groupings) {
    if (!grouping || typeof grouping.kind !== "string" || typeof grouping.field !== "string" ||
        !Object.hasOwn(ALLOWED_FIELDS, grouping.kind) || !ALLOWED_FIELDS[grouping.kind].has(grouping.field)) {
      rejected.push({ kind: null, field: null, reason: "out_of_scope_grouping" });
      continue;
    }
    const groupingKey = keyOf(grouping.kind, grouping.field, null);
    if (seen.has(groupingKey)) return { map: null, rejected: [] };
    seen.add(groupingKey);
    if (grouping.available !== true || !Array.isArray(grouping.groups)) {
      rejected.push({ kind: grouping.kind, field: grouping.field, reason: "grouping_unavailable" });
      continue;
    }
    if (grouping.groups.length > 20) {
      rejected.push({ kind: grouping.kind, field: grouping.field, reason: "too_many_group_values" });
      continue;
    }
    for (const group of grouping.groups) {
      const booleanField = grouping.field === "usedCurrentTopic" || grouping.field === "usedUserExperience";
      if (!(booleanField ? typeof group?.value === "boolean" : validLabel(group?.value))) {
        rejected.push({ kind: grouping.kind, field: grouping.field, reason: "invalid_group_value" });
        continue;
      }
      const key = keyOf(grouping.kind, grouping.field, group.value);
      if (map.has(key)) return { map: null, rejected: [{ reason: "duplicate_learning_group" }] };
      map.set(key, { kind: grouping.kind, field: grouping.field, value: group.value, group,
        provenanceCertain: count(grouping.excludedCount) && grouping.excludedCount === 0 });
    }
  }
  return { map, rejected };
}

function direction(value) {
  if (!finite(value) || value === 0) return finite(value) ? "neutral" : null;
  return value > 0 ? "positive" : "negative";
}

function metricView(first, second, family, metric) {
  const firstMetric = first.group.metrics?.[family]?.[metric];
  const secondMetric = second.group.metrics?.[family]?.[metric];
  const enough = firstMetric?.delta?.available === true && secondMetric?.delta?.available === true &&
    firstMetric?.target?.available === true && secondMetric?.target?.available === true &&
    [firstMetric, secondMetric].every((item) => count(item.validMetricCount) && count(item.validDeltaCount) &&
      item.validMetricCount >= 10 && item.validDeltaCount <= item.validMetricCount &&
      finite(item.target.median) && item.target.median >= 0 && finite(item.delta.median)) &&
    firstMetric?.validDeltaCount >= LEARNING_EVIDENCE_POLICY.minimumSamples &&
    secondMetric?.validDeltaCount >= LEARNING_EVIDENCE_POLICY.minimumSamples &&
    !deltaIssue(firstMetric) && !deltaIssue(secondMetric);
  const firstMedian = firstMetric?.delta?.median;
  const secondMedian = secondMetric?.delta?.median;
  const firstDirection = enough ? direction(firstMedian) : null;
  const secondDirection = enough ? direction(secondMedian) : null;
  const consistent = enough && firstDirection === secondDirection;
  return {
    available: enough,
    reason: enough ? (consistent ? null : "window_direction_mismatch") : "insufficient_samples_or_delta",
    d1: { median: enough && finite(firstMedian) ? firstMedian : null, direction: firstDirection },
    d3: { median: enough && finite(secondMedian) ? secondMedian : null, direction: secondDirection },
    direction: consistent ? firstDirection : null,
  };
}

function familyView(first, second, family, metrics) {
  const values = Object.fromEntries(metrics.map((metric) => [metric, metricView(first, second, family, metric)]));
  const available = Object.values(values).filter((item) => item.available);
  if (!available.length) return { available: false, direction: null, reason: "insufficient_samples_or_delta", metrics: values };
  if (available.some((item) => item.reason === "window_direction_mismatch")) {
    return { available: true, direction: null, reason: "window_direction_mismatch", metrics: values };
  }
  const nonNeutral = [...new Set(available.map((item) => item.direction).filter((item) => item !== "neutral"))];
  if (nonNeutral.length > 1) return { available: true, direction: null, reason: "metric_direction_mismatch", metrics: values };
  return { available: true, direction: nonNeutral[0] || "neutral", reason: null, metrics: values };
}

function candidate(first, second) {
  const metrics = Object.fromEntries(Object.entries(METRIC_FAMILIES).map(([family, names]) =>
    [family, familyView(first, second, family, names)]));
  const availableFamilies = Object.values(metrics).filter((item) => item.available);
  const inconsistent = availableFamilies.some((item) => item.reason) ||
    new Set(availableFamilies.map((item) => item.direction).filter((item) => item && item !== "neutral")).size > 1;
  const directional = availableFamilies.filter((item) => item.direction && item.direction !== "neutral");
  const counts = new Map();
  for (const item of directional) counts.set(item.direction, (counts.get(item.direction) || 0) + 1);
  const support = [...counts.entries()].sort((a, b) => b[1] - a[1] || lexical(a[0], b[0]))[0];
  let status = "INSUFFICIENT_SUPPORT";
  let reason = "fewer_than_two_supporting_metric_families";
  if (inconsistent) { status = "INCONSISTENT"; reason = "metric_or_window_direction_mismatch"; }
  else if (support?.[1] >= LEARNING_EVIDENCE_POLICY.minimumSupportingFamilies &&
      directional.every((item) => item.direction === support[0])) {
    status = "LEARNABLE_DESCRIPTIVE";
    reason = null;
  }
  const exclusionIssue = [first, second].flatMap((item) => Object.entries(METRIC_FAMILIES)
    .flatMap(([family, names]) => names.map((name) => deltaIssue(item.group.metrics?.[family]?.[name])))).find(Boolean);
  if (!first.provenanceCertain || !second.provenanceCertain) {
    status = "UNAVAILABLE"; reason = "provenance_coverage_uncertain";
  } else if (exclusionIssue) { status = "UNAVAILABLE"; reason = exclusionIssue; }
  return {
    kind: first.kind, field: first.field, value: first.value, status, reason,
    supportingDirection: support?.[0] || null,
    supportingFamilyCount: support?.[1] || 0,
    metrics,
  };
}

function deltaIssue(metric) {
  if (metric === undefined) return null;
  const counts = metric?.excludedDeltaCounts;
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return "invalid_delta_exclusion_counts";
  const values = Object.values(counts);
  if (values.length > 6 || !values.every(count) || values.reduce((sum, value) => sum + value, 0) > 100) return "invalid_delta_exclusion_counts";
  return values.some((value) => value > 0) ? "excluded_delta_samples" : null;
}

export function evaluateLearningEvidence(input = {}) {
  const { D1, D3 } = input || {};
  const scope = scopeOf(D1) || scopeOf(D3) || Object.fromEntries(SCOPE_FIELDS.map((field) => [field, null]));
  const base = {
    schemaVersion: LEARNING_EVIDENCE_POLICY.schemaVersion,
    available: false,
    reason: null,
    scope,
    windowIds: [...WINDOWS],
    interpretationMode: "DESCRIPTIVE",
    causalClaimAllowed: false,
    policy: { ...LEARNING_EVIDENCE_POLICY },
    coverage: { candidateCount: 0, consideredCount: 0, learnableCount: 0, heldBackCount: 0, rejectedGroupings: [] },
    candidates: [],
    limitations: [...LIMITATIONS],
  };
  if (!validAggregation(D1, scope, "D1") || !validAggregation(D3, scope, "D3")) {
    return freeze({ ...base, reason: "aggregation_unavailable_or_scope_mismatch" });
  }
  if (!validPeriod(D1, "D1") || !validPeriod(D3, "D3") || Date.parse(D1.period.asOf) !== Date.parse(D3.period.asOf)) {
    return freeze({ ...base, reason: "aggregation_period_mismatch" });
  }
  if (D1.groupings.length > 14 || D3.groupings.length > 14) return freeze({ ...base, reason: "too_many_groupings" });
  const firstResult = groupMap(D1);
  const secondResult = groupMap(D3);
  if (!firstResult.map || !secondResult.map) return freeze({ ...base, reason: "duplicate_learning_group" });
  const rejectedGroupings = [...firstResult.rejected, ...secondResult.rejected];
  const keys = [...firstResult.map.keys()].filter((key) => secondResult.map.has(key)).sort(lexical);
  const candidates = keys.map((key) => candidate(firstResult.map.get(key), secondResult.map.get(key)));
  const learnableCount = candidates.filter((item) => item.status === "LEARNABLE_DESCRIPTIVE").length;
  return freeze({
    ...base,
    available: true,
    coverage: {
      candidateCount: keys.length,
      consideredCount: candidates.length,
      learnableCount,
      heldBackCount: candidates.length - learnableCount,
      rejectedGroupings,
    },
    candidates,
  });
}
