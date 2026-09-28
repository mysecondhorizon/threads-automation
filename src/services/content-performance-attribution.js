import { getJson } from "./kv.js";
import { getScopedSuccessfulPostLog } from "./logger.js";
import { buildPerformanceDimensions } from "./performance-dimensions.js";
import { getAccountPerformanceBaseline } from "./account-performance-baseline.js";
import { POST_INSIGHT_METRICS } from "./insights.js";
import { snapshotKey } from "./insight-snapshots.js";

const IDENTITY_FIELDS = ["workspaceId", "connectedAccountId", "threadsUserId", "postId"];
const CONTENT_BASES = ["CURRENT_TOPIC", "USER_EXPERIENCE", "PERSONA", "CONTENT_POOL", "PRODUCT_OPPORTUNITY"];
const CONTENT_ANGLES = ["FAILURE", "OBSERVATION", "REVERSAL", "DISCOVERY", "COMPARISON", "RELATABLE_MOMENT", "QUESTION", "PRACTICAL_TIP"];
const HOOK_TYPES = ["CONTRARIAN", "CURIOSITY", "CONFESSION", "SPECIFIC_MOMENT", "UNEXPECTED_RESULT", "DIRECT_QUESTION", "OBSERVATION"];
const METRICS = {
  reach: ["views"], engagement: ["engagementRate"], conversation: ["replyRate"],
  distribution: ["repostRate", "quoteRate", "shareRate"],
};

function projectProvenance(entry) {
  const metadata = entry.log.metadata;
  const fieldIssues = [];
  const issue = (field, reason) => fieldIssues.push({ field, reason });
  function read(field, allowed = null) {
    const value = metadata[field];
    if (value === undefined || value === null || value === "") {
      issue(field, "missing");
      return null;
    }
    if (typeof value !== "string" || !value.trim() || (allowed && !allowed.includes(value))) {
      issue(field, "invalid");
      return null;
    }
    return value; // Preserve the stored value; do not trim/reclassify labels.
  }
  const common = {
    source: read("source"), contentMode: read("contentMode"), contentBasis: read("contentBasis", CONTENT_BASES),
    publishMode: read("publishMode", ["TEXT", "IMAGE", "VIDEO"]), mediaId: read("mediaId"),
  };
  let kind = "unknown";
  // Positive writer provenance, not "not Commerce => General". Inconsistent
  // or incomplete classification evidence stays unknown, without rewriting it.
  if (common.source === "COMMERCE_MANUAL" && common.contentBasis === "PRODUCT_OPPORTUNITY" &&
      (common.contentMode === null || common.contentMode === "commerce_manual")) kind = "commerce";
  else if (["manual", "cron", "cron_auto_general"].includes(common.source) &&
      ["everyday_personal", "current_topic_reaction"].includes(common.contentMode) &&
      CONTENT_BASES.slice(0, 4).includes(common.contentBasis) && !metadata.opportunityId) kind = "general";

  let general = null;
  let commerce = null;
  if (kind === "general") {
    general = Object.fromEntries([
      "currentTopicId", "currentTopicCategory", "currentTopicSelectedAngle", "style", "contentType",
      "topic", "emotion", "hookStyle", "endingStyle", "contentPoolId",
    ].map((field) => [field, read(field)]));
    general.questionUsed = typeof metadata.questionUsed === "boolean" ? metadata.questionUsed : null;
    if (general.questionUsed === null) issue("questionUsed", metadata.questionUsed == null ? "missing" : "invalid");
    // Neither default false is evidence of non-use in General. Basis and saved
    // topic fields express provenance; no synthetic usage booleans are exposed.
    issue("usedCurrentTopic", "general_usage_flag_not_authoritative");
    issue("usedUserExperience", "general_usage_flag_not_authoritative");
  } else if (kind === "commerce") {
    commerce = {
      authority: "publish_submission",
      opportunityId: read("opportunityId"), contentAngle: read("contentAngle", CONTENT_ANGLES),
      hookType: read("hookType", HOOK_TYPES), currentTopicId: read("currentTopicId"),
    };
    // The logger writes false even when no story was submitted. Require the
    // saved story labels before interpreting either usage flag, and never claim
    // these declarations are bound to the original generated or reviewed text.
    for (const field of ["usedCurrentTopic", "usedUserExperience"]) {
      commerce[field] = null;
      if (typeof metadata[field] !== "boolean") issue(field, metadata[field] == null ? "missing" : "invalid");
      else if (!commerce.contentAngle || !commerce.hookType) issue(field, "story_metadata_unverified");
      else commerce[field] = metadata[field];
    }
    if (commerce.usedCurrentTopic !== null && (commerce.usedCurrentTopic !== Boolean(commerce.currentTopicId) ||
        fieldIssues.some((item) => item.field === "currentTopicId" && item.reason === "invalid"))) {
      commerce.usedCurrentTopic = null;
      issue("usedCurrentTopic", "topic_provenance_conflict");
    }
  } else issue("kind", "unrecognized_or_incomplete_provenance");
  return { source: { kind: "post_log", key: entry.key }, kind, common, general, commerce, fieldIssues };
}

function projectPerformance(dimensions, comparison) {
  const baseline = comparison.available ? comparison.baseline : null;
  const insufficientSampleMetrics = [];
  const metrics = Object.fromEntries(Object.entries(METRICS).map(([group, names]) => [group,
    Object.fromEntries(names.map((name) => {
      const metric = baseline?.metrics[group][name];
      if (metric && metric.sampleCount < baseline.policy.minimumValidSamples) insufficientSampleMetrics.push(`${group}.${name}`);
      return [name, {
        targetValue: dimensions[group][name], baselineMedian: metric?.median ?? null,
        delta: metric?.delta ?? null, sampleCount: metric?.sampleCount ?? null,
      }];
    })),
  ]));
  return {
    baseline: {
      // available means complete discovery, even when no metric has enough
      // samples. Failed discovery has unknown (null), NOT zero, sample counts.
      available: comparison.available,
      reason: !comparison.available ? comparison.reason : insufficientSampleMetrics.length === 6
        ? "insufficient_samples" : insufficientSampleMetrics.length ? "partial_insufficient_samples" : null,
      policy: baseline?.policy ?? null, cohort: baseline?.cohort ?? null,
      insufficientSampleMetrics, discovery: comparison.discovery ?? null,
    },
    metrics,
  };
}

// Internal read-only service; callers must authorize the requested account.
// No history projection, latest insight fallback, source-store reads or writes.
export function validateAttributionIdentity(identity, windowId) {
  if (!IDENTITY_FIELDS.every((field) => typeof identity?.[field] === "string" && identity[field].trim())) {
    return "invalid_attribution_identity";
  }
  return ["D1", "D3"].includes(windowId) ? null : "invalid_attribution_window";
}

export function inspectAttributionSnapshot(snapshot, identity, windowId) {
  const invalid = validateAttributionIdentity(identity, windowId);
  if (invalid) return { reason: invalid, dimensions: null };
  if (!snapshot) return { reason: "snapshot_not_found", dimensions: null };
  if (snapshot.windowId !== windowId || !IDENTITY_FIELDS.every((field) => snapshot[field] === identity[field])) {
    return { reason: "snapshot_identity_mismatch", dimensions: null };
  }
  const dimensions = buildPerformanceDimensions(snapshot);
  return { reason: dimensions ? null : "invalid_trusted_snapshot", dimensions };
}

// Internal composition only: entry comes from completed unique-log discovery,
// dimensions from inspectAttributionSnapshot, comparison from LEARNING-05.
export function composeContentPerformanceAttribution(entry, dimensions, comparison, discovery) {
  return {
    available: true, reason: null, discovery,
    attribution: {
      schemaVersion: 1,
      identity: Object.fromEntries(IDENTITY_FIELDS.map((field) => [field, dimensions.observation[field]])),
      observation: {
        ...dimensions.observation,
        metricAvailability: Object.fromEntries(POST_INSIGHT_METRICS.map((name) => [name, dimensions.observation.metricAvailability[name]])),
      },
      provenance: projectProvenance(entry), performance: projectPerformance(dimensions, comparison),
    },
  };
}

export async function getContentPerformanceAttribution(env, identity, windowId) {
  const unavailable = (reason, discovery = null) => ({ available: false, reason, attribution: null, discovery });
  const invalid = validateAttributionIdentity(identity, windowId);
  if (invalid) return unavailable(invalid);
  const scope = Object.fromEntries(IDENTITY_FIELDS.map((field) => [field, identity[field]]));
  const log = await getScopedSuccessfulPostLog(env, scope);
  if (!log.available) return unavailable(log.reason, log.discovery);
  let snapshot;
  try {
    // Same v1 key as insight-snapshots.js. Read the raw record deliberately:
    // getInsightSnapshot normalizes stored totals/ages, while attribution must
    // reject an invalid trusted target rather than repair it during the read.
    snapshot = await getJson(env, snapshotKey(scope, windowId));
  } catch {
    return unavailable("snapshot_read_failed", log.discovery);
  }
  const { reason, dimensions } = inspectAttributionSnapshot(snapshot, scope, windowId);
  if (reason) return unavailable(reason, log.discovery);
  const comparison = await getAccountPerformanceBaseline(env, snapshot);
  return composeContentPerformanceAttribution(log.entry, dimensions, comparison, log.discovery);
}
