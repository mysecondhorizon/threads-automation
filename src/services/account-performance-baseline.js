import { listAccountInsightSnapshots } from "./insight-snapshots.js";
import { buildPerformanceDimensions } from "./performance-dimensions.js";

const POLICY = Object.freeze({
  lookbackDays: 28,
  ageToleranceSeconds: 6 * 3600,
  minimumValidSamples: 10,
  targetValidSamples: 20,
  maximumCohortPosts: 30,
});
const SCOPE_FIELDS = ["workspaceId", "connectedAccountId", "threadsUserId", "windowId"];
const METRICS = {
  reach: ["views"],
  engagement: ["engagementRate"],
  conversation: ["replyRate"],
  distribution: ["repostRate", "quoteRate", "shareRate"],
};
const finiteValue = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;

function targetDimensions(snapshot) {
  if (!["D1", "D3"].includes(snapshot?.windowId)) return null;
  return buildPerformanceDimensions(snapshot);
}

// Values must be sorted. No rounding, ranking or interpretation labels.
function quantile(values, p) {
  if (!values.length) return null;
  const position = (values.length - 1) * p;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return values[lower] + (values[Math.ceil(position)] - values[lower]) * fraction;
}

function summarize(values, target) {
  values.sort((a, b) => a - b);
  const enough = values.length >= POLICY.minimumValidSamples;
  const median = enough ? quantile(values, 0.5) : null;
  const targetValue = finiteValue(target) ? target : null;
  return {
    targetValue,
    sampleCount: values.length,
    median,
    q1: enough ? quantile(values, 0.25) : null,
    q3: enough ? quantile(values, 0.75) : null,
    delta: targetValue !== null && median !== null ? targetValue - median : null,
  };
}

// Caller supplies a trusted target and a COMPLETE discovered history, not a
// paginated subset. The async facade below enforces completion before calling.
export function buildAccountPerformanceBaseline(target, snapshots) {
  const dimensions = targetDimensions(target);
  if (!dimensions || !Array.isArray(snapshots)) return null;
  const publishedAt = Date.parse(target.publishedAt);
  const observedAt = Date.parse(target.observedAt);
  const earliest = publishedAt - POLICY.lookbackDays * 24 * 3600 * 1000;
  const eligible = [];
  for (const snapshot of snapshots) {
    if (!snapshot || snapshot.postId === target.postId ||
        !SCOPE_FIELDS.every((field) => snapshot[field] === target[field])) continue;
    const historical = buildPerformanceDimensions(snapshot);
    if (!historical) continue;
    const published = Date.parse(snapshot.publishedAt);
    const observed = Date.parse(snapshot.observedAt);
    if (published < earliest || published >= publishedAt || observed > observedAt ||
        Math.abs(snapshot.observationAgeSeconds - target.observationAgeSeconds) > POLICY.ageToleranceSeconds) continue;
    eligible.push({ dimensions: historical, published, observed });
  }
  eligible.sort((a, b) => b.published - a.published || a.observed - b.observed ||
    a.dimensions.observation.postId.localeCompare(b.dimensions.observation.postId));
  const cohort = [];
  const seenPosts = new Set();
  for (const item of eligible) {
    const postId = item.dimensions.observation.postId;
    if (seenPosts.has(postId)) continue;
    seenPosts.add(postId);
    cohort.push(item.dimensions);
    if (cohort.length === POLICY.maximumCohortPosts) break;
  }
  const ages = cohort.map((item) => item.observation.observationAgeSeconds).sort((a, b) => a - b);
  return {
    observation: dimensions.observation,
    policy: { ...POLICY },
    cohort: {
      postCount: cohort.length,
      observationAgeSeconds: {
        min: ages[0] ?? null,
        median: quantile(ages, 0.5),
        max: ages.at(-1) ?? null,
      },
    },
    metrics: Object.fromEntries(Object.entries(METRICS).map(([dimension, names]) => [dimension,
      Object.fromEntries(names.map((name) => [name, summarize(
        cohort.map((item) => item[dimension][name]).filter(finiteValue), dimensions[dimension][name],
      )])),
    ])),
  };
}

export async function getAccountPerformanceBaseline(env, target) {
  if (!targetDimensions(target)) return { available: false, reason: "invalid_target_snapshot", baseline: null };
  const { snapshots, ...discovery } = await listAccountInsightSnapshots(env, target, target.windowId);
  if (!discovery.available) return { available: false, reason: discovery.reason, baseline: null, discovery };
  return { available: true, reason: null, baseline: buildAccountPerformanceBaseline(target, snapshots), discovery };
}
