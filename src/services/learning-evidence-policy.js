const SCOPE_FIELDS = ["workspaceId", "connectedAccountId", "threadsUserId"];
const WINDOWS = ["D1", "D3"];
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
  requiredWindows: WINDOWS,
});

const LIMITATIONS = Object.freeze([
  "descriptive_not_causal",
  "d1_d3_observations_overlap",
  "sample_threshold_is_not_statistical_significance",
  "l07_discovery_and_kv_consistency_limits_apply",
  "stored_labels_are_not_semantically_clustered",
]);

const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const keyOf = (kind, field, value) => `${kind}\u0000${field}\u0000${value}`;

function scopeOf(aggregation) {
  return aggregation?.scope && Object.fromEntries(SCOPE_FIELDS.map((field) => [field, aggregation.scope[field]]));
}

function validAggregation(aggregation, scope, windowId) {
  return aggregation?.schemaVersion === 1 && aggregation.available === true &&
    aggregation.interpretationMode === "DESCRIPTIVE" && aggregation.causalClaimAllowed === false &&
    aggregation.scope?.windowId === windowId &&
    SCOPE_FIELDS.every((field) => typeof aggregation.scope[field] === "string" &&
      aggregation.scope[field] === scope[field]) && Array.isArray(aggregation.groupings);
}

function groupMap(aggregation) {
  const map = new Map();
  const rejected = [];
  for (const grouping of aggregation.groupings) {
    if (!grouping || !ALLOWED_FIELDS[grouping.kind]?.has(grouping.field)) {
      rejected.push({ kind: grouping?.kind ?? null, field: grouping?.field ?? null, reason: "out_of_scope_grouping" });
      continue;
    }
    if (grouping.available !== true || !Array.isArray(grouping.groups)) {
      rejected.push({ kind: grouping.kind, field: grouping.field, reason: grouping.reason || "grouping_unavailable" });
      continue;
    }
    if (grouping.groups.length > 20) {
      rejected.push({ kind: grouping.kind, field: grouping.field, reason: "too_many_group_values" });
      continue;
    }
    for (const group of grouping.groups) {
      if (typeof grouping.kind !== "string" || typeof grouping.field !== "string" ||
          typeof group?.value !== "string") continue;
      if (group.value.length > LEARNING_EVIDENCE_POLICY.maxLabelLength) {
        rejected.push({ kind: grouping.kind, field: grouping.field, reason: "group_value_too_long" });
        continue;
      }
      const key = keyOf(grouping.kind, grouping.field, group.value);
      if (map.has(key)) return { map: null, rejected: [{ reason: "duplicate_learning_group" }] };
      map.set(key, { kind: grouping.kind, field: grouping.field, value: group.value, group });
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
  const firstDelta = firstMetric?.delta;
  const secondDelta = secondMetric?.delta;
  const enough = firstMetric?.delta?.available === true && secondMetric?.delta?.available === true &&
    firstMetric?.target?.available === true && secondMetric?.target?.available === true &&
    firstMetric?.validDeltaCount >= LEARNING_EVIDENCE_POLICY.minimumSamples &&
    secondMetric?.validDeltaCount >= LEARNING_EVIDENCE_POLICY.minimumSamples &&
    !Object.keys(firstMetric?.excludedDeltaCounts || {}).length &&
    !Object.keys(secondMetric?.excludedDeltaCounts || {}).length;
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
  const inconsistent = availableFamilies.some((item) => item.reason);
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
  return {
    kind: first.kind, field: first.field, value: first.value, status, reason,
    supportingDirection: support?.[0] || null,
    supportingFamilyCount: support?.[1] || 0,
    metrics,
  };
}

export function evaluateLearningEvidence({ D1, D3 } = {}) {
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
    return { ...base, reason: "aggregation_unavailable_or_scope_mismatch" };
  }
  const firstResult = groupMap(D1);
  const secondResult = groupMap(D3);
  if (!firstResult.map || !secondResult.map) return { ...base, reason: "duplicate_learning_group" };
  const rejectedGroupings = [...firstResult.rejected, ...secondResult.rejected];
  const keys = [...firstResult.map.keys()].filter((key) => secondResult.map.has(key)).sort(lexical);
  const candidates = keys.map((key) => candidate(firstResult.map.get(key), secondResult.map.get(key)));
  const learnableCount = candidates.filter((item) => item.status === "LEARNABLE_DESCRIPTIVE").length;
  return {
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
  };
}
