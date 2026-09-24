import { insightObservationWindow, observationAgeSeconds } from "./insight-snapshots.js";
import { POST_INSIGHT_METRICS, deriveInsightTotals } from "./insights.js";

const IDENTITY_FIELDS = ["postId", "workspaceId", "connectedAccountId", "threadsUserId"];
const OWNERSHIP_SOURCES = new Set(["published_log", "account_post_list"]);
const COLLECTION_STATUSES = new Set(["success", "partial"]);
const nonblank = (value) => typeof value === "string" && Boolean(value.trim());
const validMetric = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;

function normalizeTrustedSnapshot(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.integrityVersion !== 1 ||
      !COLLECTION_STATUSES.has(snapshot.collectionStatus) || !OWNERSHIP_SOURCES.has(snapshot.ownershipSource) ||
      !IDENTITY_FIELDS.every((field) => nonblank(snapshot[field]))) return null;

  const age = observationAgeSeconds(snapshot.publishedAt, snapshot.observedAt);
  if (age === null || snapshot.observationAgeSeconds !== age ||
      insightObservationWindow(snapshot.publishedAt, snapshot.observedAt) !== snapshot.windowId) return null;

  const metrics = {};
  let availableCount = 0;
  for (const name of POST_INSIGHT_METRICS) {
    const available = snapshot.metricAvailability?.[name];
    if (typeof available !== "boolean") return null;
    if (available) {
      if (!validMetric(snapshot[name])) return null;
      metrics[name] = snapshot[name];
      availableCount += 1;
    } else {
      if (snapshot[name] !== null) return null;
      metrics[name] = null;
    }
  }
  if (!availableCount || snapshot.collectionStatus !==
      (availableCount === POST_INSIGHT_METRICS.length ? "success" : "partial")) return null;

  const totals = deriveInsightTotals(metrics);
  if (snapshot.interactions !== totals.interactions || snapshot.engagementRate !== totals.engagementRate) return null;
  return { metrics, interactions: totals.interactions };
}

function rate(numerator, views) {
  return validMetric(numerator) && validMetric(views) && views > 0 ? numerator / views * 100 : null;
}

export function buildPerformanceDimensions(snapshot) {
  const trusted = normalizeTrustedSnapshot(snapshot);
  if (!trusted) return null;
  const { metrics, interactions } = trusted;
  return {
    observation: {
      schemaVersion: snapshot.schemaVersion,
      windowId: snapshot.windowId,
      postId: snapshot.postId,
      workspaceId: snapshot.workspaceId,
      connectedAccountId: snapshot.connectedAccountId,
      threadsUserId: snapshot.threadsUserId,
      ownershipSource: snapshot.ownershipSource,
      publishedAt: snapshot.publishedAt,
      observedAt: snapshot.observedAt,
      observationAgeSeconds: snapshot.observationAgeSeconds,
      integrityVersion: snapshot.integrityVersion,
      collectionStatus: snapshot.collectionStatus,
      metricAvailability: { ...snapshot.metricAvailability },
    },
    reach: { views: metrics.views },
    engagement: { engagementRate: rate(interactions, metrics.views) },
    conversation: { replyRate: rate(metrics.replies, metrics.views) },
    distribution: {
      repostRate: rate(metrics.reposts, metrics.views),
      quoteRate: rate(metrics.quotes, metrics.views),
      shareRate: rate(metrics.shares, metrics.views),
    },
  };
}
