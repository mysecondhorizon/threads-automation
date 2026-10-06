import assert from "node:assert/strict";
import test from "node:test";
import { evaluateLearningEvidence, LEARNING_EVIDENCE_POLICY } from "./learning-evidence-policy.js";
import { buildAttributionAggregation } from "./attribution-aggregation.js";

const scope = { workspaceId: "w1", connectedAccountId: "a1", threadsUserId: "u1" };
const asOf = "2026-10-06T00:00:00.000Z";
const period = (windowId) => {
  const before = Date.parse(asOf) - (windowId === "D1" ? 48 : 96) * 3600000;
  return { asOf, publishedBefore: new Date(before).toISOString(),
    publishedFrom: new Date(before - 14 * 86400000).toISOString(), maxPosts: 100 };
};
const metric = (median, count = 10, excludedDeltaCounts = {}) => ({
  validMetricCount: count, validDeltaCount: count,
  target: { available: count >= 10, median: Math.abs(median) },
  delta: { available: count >= 10, median }, excludedDeltaCounts,
});
const group = (value, delta = 1, count = 10) => ({
  value,
  metrics: {
    reach: { views: metric(100, count) },
    engagement: { engagementRate: metric(delta, count) },
    conversation: { replyRate: metric(delta, count) },
    distribution: {
      repostRate: metric(delta, count), quoteRate: metric(delta, count), shareRate: metric(delta, count),
    },
  },
});
const aggregation = (windowId, groups, overrides = {}) => ({
  schemaVersion: 1, available: true, interpretationMode: "DESCRIPTIVE", causalClaimAllowed: false,
  scope: { ...scope, windowId },
  period: period(windowId),
  groupings: [{ kind: "general", field: "style", available: true, excludedCount: 0, groups }],
  ...overrides,
});

test("requires both exact-scope descriptive windows", () => {
  const result = evaluateLearningEvidence({ D1: aggregation("D1", [group("calm")]), D3: null });
  assert.equal(result.available, false);
  assert.equal(result.reason, "aggregation_unavailable_or_scope_mismatch");
});

test("marks a two-family same-direction pattern learnable and keeps output bounded", () => {
  const result = evaluateLearningEvidence({
    D1: aggregation("D1", [group("calm", 1)]),
    D3: aggregation("D3", [group("calm", 2)]),
  });
  assert.equal(result.available, true);
  assert.equal(result.candidates[0].status, "LEARNABLE_DESCRIPTIVE");
  assert.ok(result.candidates[0].supportingFamilyCount >= 2);
  assert.equal(result.causalClaimAllowed, false);
  assert.equal(result.candidates[0].metrics.engagement.metrics.engagementRate.d1.median, 1);
  assert.equal(Object.hasOwn(result.candidates[0], "postBody"), false);
});

test("holds back a one-family pattern", () => {
  const oneFamily = (windowId) => ({
    schemaVersion: 1, available: true, interpretationMode: "DESCRIPTIVE", causalClaimAllowed: false,
    scope: { ...scope, windowId },
    period: period(windowId),
    groupings: [{ kind: "general", field: "style", available: true, excludedCount: 0, groups: [{
      value: "calm", metrics: { reach: { views: metric(1) } },
    }] }],
  });
  const result = evaluateLearningEvidence({ D1: oneFamily("D1"), D3: oneFamily("D3") });
  assert.equal(result.candidates[0].status, "INSUFFICIENT_SUPPORT");
});

test("marks opposite D1/D3 directions inconsistent", () => {
  const result = evaluateLearningEvidence({
    D1: aggregation("D1", [group("calm", 1)]),
    D3: aggregation("D3", [group("calm", -1)]),
  });
  assert.equal(result.candidates[0].status, "INCONSISTENT");
  assert.equal(result.candidates[0].reason, "metric_or_window_direction_mismatch");
});

test("does not create an unknown group or infer a value missing from D3", () => {
  const result = evaluateLearningEvidence({
    D1: aggregation("D1", [group("calm"), group("unknown")]),
    D3: aggregation("D3", [group("calm")]),
  });
  assert.deepEqual(result.candidates.map((item) => item.value), ["calm"]);
});

test("holds back candidates with excluded delta samples", () => {
  const excluded = (windowId) => aggregation(windowId, [{
    value: "calm",
    metrics: {
      reach: { views: { ...metric(1), excludedDeltaCounts: { baseline_unavailable: 1 } } },
      engagement: { engagementRate: metric(1) },
    },
  }]);
  const result = evaluateLearningEvidence({ D1: excluded("D1"), D3: excluded("D3") });
  assert.equal(result.candidates[0].status, "UNAVAILABLE");
  assert.equal(result.candidates[0].reason, "excluded_delta_samples");
});

const pair = () => ({ D1: aggregation("D1", [group("calm")]), D3: aggregation("D3", [group("calm")]) });
const evaluateCandidate = (input) => evaluateLearningEvidence(input).candidates[0];

test("9/10 boundaries and strict finite integer target/delta support", () => {
  for (const count of [9, 10]) {
    const input = { D1: aggregation("D1", [group("calm", 1, count)]), D3: aggregation("D3", [group("calm", 1, count)]) };
    assert.equal(evaluateCandidate(input).status, count === 10 ? "LEARNABLE_DESCRIPTIVE" : "INSUFFICIENT_SUPPORT");
  }
  for (const property of ["validMetricCount", "validDeltaCount"]) {
    for (const value of ["10", 10.5, Infinity, NaN, -1, 101, null, undefined]) {
      const input = pair();
      for (const family of Object.values(input.D1.groupings[0].groups[0].metrics)) {
        for (const item of Object.values(family)) item[property] = value;
      }
      assert.equal(evaluateCandidate(input).status, "INSUFFICIENT_SUPPORT", `${property}: ${value}`);
    }
  }
  for (const target of ["target", "delta"]) {
    for (const value of [null, "1", Infinity, NaN, undefined]) {
      const input = pair();
      for (const family of Object.values(input.D1.groupings[0].groups[0].metrics)) {
        for (const item of Object.values(family)) item[target].median = value;
      }
      assert.equal(evaluateCandidate(input).status, "INSUFFICIENT_SUPPORT");
    }
  }
});

test("contradictory families are inconsistent even with two supporting families", () => {
  const input = pair();
  for (const aggregation of Object.values(input)) aggregation.groupings[0].groups[0].metrics.reach.views.delta.median = -1;
  assert.equal(evaluateCandidate(input).status, "INCONSISTENT");
});

test("a delta exclusion in one metric holds back the whole candidate", () => {
  for (const exclusions of [{ baseline_unavailable: 1 }, null, [], { invalid: "1" }, { invalid: -1 }, { invalid: NaN }]) {
    const input = pair();
    input.D3.groupings[0].groups[0].metrics.distribution.shareRate.excludedDeltaCounts = exclusions;
    assert.equal(evaluateCandidate(input).status, "UNAVAILABLE");
  }
  const zero = pair();
  zero.D3.groupings[0].groups[0].metrics.reach.views.excludedDeltaCounts = { baseline_unavailable: 0 };
  assert.equal(evaluateCandidate(zero).status, "LEARNABLE_DESCRIPTIVE");
});

test("provenance coverage exclusions, including ambiguous not-applicable counts, fail closed", () => {
  for (const excludedCount of [1, undefined, -1, "0", Infinity]) {
    const input = pair(); input.D1.groupings[0].excludedCount = excludedCount;
    assert.equal(evaluateCandidate(input).reason, "provenance_coverage_uncertain");
  }
});

test("window comparison validates asOf and each L07 maturity/14-day period", () => {
  for (const field of ["asOf", "publishedFrom", "publishedBefore", "maxPosts"]) {
    const input = pair(); input.D3.period[field] = field === "maxPosts" ? 99 : "invalid";
    assert.equal(evaluateLearningEvidence(input).reason, "aggregation_period_mismatch");
  }
  const mismatch = pair();
  for (const field of ["asOf", "publishedFrom", "publishedBefore"]) {
    mismatch.D3.period[field] = new Date(Date.parse(mismatch.D3.period[field]) - 86400000).toISOString();
  }
  assert.equal(evaluateLearningEvidence(mismatch).reason, "aggregation_period_mismatch");
  const sameBounds = pair(); sameBounds.D3.period = sameBounds.D1.period;
  assert.equal(evaluateLearningEvidence(sameBounds).available, false);
  // There is no clock-based freshness threshold in V1; historical aligned pairs remain evaluable.
  const historical = pair();
  for (const aggregation of Object.values(historical)) for (const field of ["asOf", "publishedFrom", "publishedBefore"]) {
    aggregation.period[field] = new Date(Date.parse(aggregation.period[field]) - 365 * 86400000).toISOString();
  }
  assert.equal(evaluateLearningEvidence(historical).available, true);
});

test("diagnostics sanitize private data and reject duplicate grouping containers", () => {
  const input = pair();
  input.D1.groupings.push({ kind: "private-body", field: { secret: "private-body" }, reason: "private-body" });
  input.D3.groupings.push({ kind: "commerce", field: "contentAngle", available: false, reason: "private-body" });
  assert.equal(JSON.stringify(evaluateLearningEvidence(input)).includes("private-body"), false);
  for (const value of [null, {}, "", " ", "x\u0000y", "x".repeat(201), true]) {
    const malformed = pair(); malformed.D1.groupings[0].groups[0].value = value;
    assert.equal(evaluateLearningEvidence(malformed).candidates.length, 0);
  }
  const duplicate = pair(); duplicate.D1.groupings.push({ ...duplicate.D1.groupings[0], groups: [] });
  assert.equal(evaluateLearningEvidence(duplicate).reason, "duplicate_learning_group");
  const duplicateValue = pair(); duplicateValue.D1.groupings[0].groups.push(group("calm"));
  assert.equal(evaluateLearningEvidence(duplicateValue).reason, "duplicate_learning_group");
  const malformedScope = pair(); malformedScope.D1.scope.workspaceId = { private: "private-body" };
  assert.equal(JSON.stringify(evaluateLearningEvidence(malformedScope)).includes("private-body"), false);
});

test("input/output bounds and immutable policy/results prevent later policy mutation", () => {
  const excessive = pair(); excessive.D1.groupings = Array.from({ length: 15 }, () => excessive.D1.groupings[0]);
  assert.equal(evaluateLearningEvidence(excessive).reason, "too_many_groupings");
  const twenty = { D1: aggregation("D1", Array.from({ length: 20 }, (_, i) => group(`value-${i}`))),
    D3: aggregation("D3", Array.from({ length: 20 }, (_, i) => group(`value-${i}`))) };
  assert.equal(evaluateLearningEvidence(twenty).candidates.length, 20);
  twenty.D1.groupings[0].groups.push(group("21st"));
  assert.equal(evaluateLearningEvidence(twenty).candidates.length, 0);
  const original = pair(); const copy = structuredClone(original); const result = evaluateLearningEvidence(original);
  assert.throws(() => result.policy.requiredWindows.push("D7"), TypeError);
  assert.throws(() => LEARNING_EVIDENCE_POLICY.requiredWindows[0] = "D7", TypeError);
  assert.throws(() => result.candidates[0].metrics.reach.metrics.views.d1.median = 999, TypeError);
  assert.deepEqual(original, copy);
  assert.equal(Object.isFrozen(original), false);
  assert.deepEqual(evaluateLearningEvidence(pair()), result);
});

test("real L07 builder output retains boolean commerce groups and 9/10 evidence boundary", () => {
  const make = (windowId, length) => buildAttributionAggregation(scope, windowId,
    Array.from({ length }, (_, index) => {
      const identity = { ...scope, postId: `post-${index}` };
      const performanceMetrics = Object.fromEntries(Object.entries(group("fixture").metrics).map(([family, metrics]) =>
        [family, Object.fromEntries(Object.keys(metrics).map((name) => [name,
          { sampleCount: 10, targetValue: 2, baselineMedian: 1, delta: 1 }]))]));
      return { schemaVersion: 1, identity,
        observation: { ...identity, windowId, publishedAt: "2026-09-30T00:00:00.000Z",
          observedAt: windowId === "D1" ? "2026-10-01T08:00:00.000Z" : "2026-10-03T08:00:00.000Z",
          observationAgeSeconds: (windowId === "D1" ? 32 : 80) * 3600 },
        provenance: { kind: "commerce", fieldIssues: [], common: { contentBasis: "PRODUCT_OPPORTUNITY", contentMode: "commerce_manual" },
          commerce: { contentAngle: "DISCOVERY", hookType: "OBSERVATION", usedCurrentTopic: false, usedUserExperience: true } },
        performance: { baseline: { available: true }, metrics: performanceMetrics } };
    }), { asOf });
  for (const length of [9, 10]) {
    const D1 = make("D1", length), D3 = make("D3", length);
    assert.equal(D1.available, true); assert.equal(D3.available, true);
    const result = evaluateLearningEvidence({ D1, D3 });
    for (const [field, value] of [["usedCurrentTopic", false], ["usedUserExperience", true]]) {
      const item = result.candidates.find((item) => item.field === field);
      assert.equal(item.value, value);
      assert.equal(item.status, length === 10 ? "LEARNABLE_DESCRIPTIVE" : "INSUFFICIENT_SUPPORT");
    }
  }
});

test("rejects out-of-scope and unavailable groupings with coverage reasons", () => {
  const make = (windowId) => aggregation(windowId, [], {
    groupings: [
      { kind: "general", field: "privateField", available: true, groups: [group("x")] },
      { kind: "commerce", field: "contentAngle", available: false, reason: "too_many_group_values", groups: [] },
    ],
  });
  const result = evaluateLearningEvidence({ D1: make("D1"), D3: make("D3") });
  assert.equal(result.available, true);
  assert.equal(result.candidates.length, 0);
  assert.equal(result.coverage.rejectedGroupings.length, 4);
  assert.ok(result.coverage.rejectedGroupings.every((item) => item.reason));
});

test("rejects oversized labels so evidence output stays bounded", () => {
  const make = (windowId) => aggregation(windowId, [{
    value: "x".repeat(201), metrics: group("placeholder").metrics,
  }]);
  const result = evaluateLearningEvidence({ D1: make("D1"), D3: make("D3") });
  assert.equal(result.candidates.length, 0);
  assert.equal(result.coverage.rejectedGroupings.length, 2);
  assert.equal(result.coverage.candidateCount, 0);
});
