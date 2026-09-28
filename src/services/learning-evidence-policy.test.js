import assert from "node:assert/strict";
import test from "node:test";
import { evaluateLearningEvidence } from "./learning-evidence-policy.js";

const scope = { workspaceId: "w1", connectedAccountId: "a1", threadsUserId: "u1" };
const metric = (median, count = 10, excludedDeltaCounts = {}) => ({
  validMetricCount: count, validDeltaCount: count,
  target: { available: count >= 10, median },
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
  groupings: [{ kind: "general", field: "style", available: true, groups }],
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
    groupings: [{ kind: "general", field: "style", available: true, groups: [{
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

test("holds back metrics with excluded delta samples", () => {
  const excluded = (windowId) => aggregation(windowId, [{
    value: "calm",
    metrics: {
      reach: { views: { ...metric(1), excludedDeltaCounts: { baseline_unavailable: 1 } } },
      engagement: { engagementRate: metric(1) },
    },
  }]);
  const result = evaluateLearningEvidence({ D1: excluded("D1"), D3: excluded("D3") });
  assert.equal(result.candidates[0].status, "INSUFFICIENT_SUPPORT");
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
