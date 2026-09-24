import { getJson, getText, putJson } from "./kv.js";
import { POST_INSIGHT_METRICS, normalizeInsightMetric, deriveInsightTotals } from "./insights.js";

export const INSIGHT_COLLECTION_MAX_AGE_SECONDS = 96 * 60 * 60;
const WINDOWS = { D1: [24 * 3600, 48 * 3600], D3: [72 * 3600, INSIGHT_COLLECTION_MAX_AGE_SECONDS] };
const IDENTITY_FIELDS = ["workspaceId", "connectedAccountId", "threadsUserId", "postId"];
const nonblank = (value) => typeof value === "string" && Boolean(value.trim());

export function observationAgeSeconds(publishedAt, observedAt) {
  if (!nonblank(publishedAt) || !nonblank(observedAt)) return null;
  const age = (Date.parse(observedAt) - Date.parse(publishedAt)) / 1000;
  return Number.isFinite(age) && age >= 0 ? age : null;
}

export function insightObservationWindow(publishedAt, observedAt) {
  const age = observationAgeSeconds(publishedAt, observedAt);
  if (age === null) return null;
  return Object.keys(WINDOWS).find((id) => age >= WINDOWS[id][0] && age < WINDOWS[id][1]) || null;
}

function snapshotKey(identity, windowId) {
  if (!Object.hasOwn(WINDOWS, windowId) || !IDENTITY_FIELDS.every((field) => nonblank(identity?.[field]))) return null;
  return `post_insight_snapshot:v1:${IDENTITY_FIELDS.map((field) => encodeURIComponent(identity[field])).join(":")}:${windowId}`;
}

function normalizeSnapshot(observation) {
  if (observation?.integrityVersion !== 1 || !["success", "partial"].includes(observation.collectionStatus) ||
      !["published_log", "account_post_list"].includes(observation.ownershipSource)) return null;
  const observedAt = observation.observedAt ?? observation.fetchedAt;
  const windowId = insightObservationWindow(observation.publishedAt, observedAt);
  if (!snapshotKey(observation, windowId)) return null;
  const metrics = Object.fromEntries(POST_INSIGHT_METRICS.map((name) => [name,
    observation.metricAvailability?.[name] === true ? normalizeInsightMetric(observation[name]) : null,
  ]));
  const validCount = Object.values(metrics).filter((value) => value !== null).length;
  if (!validCount) return null;
  return {
    schemaVersion: 1,
    windowId,
    ...Object.fromEntries(IDENTITY_FIELDS.map((field) => [field, observation[field]])),
    ownershipSource: observation.ownershipSource,
    publishedAt: observation.publishedAt,
    observedAt,
    observationAgeSeconds: observationAgeSeconds(observation.publishedAt, observedAt),
    integrityVersion: 1,
    collectionStatus: validCount === POST_INSIGHT_METRICS.length ? "success" : "partial",
    metricAvailability: Object.fromEntries(POST_INSIGHT_METRICS.map((name) => [name, metrics[name] !== null])),
    ...metrics,
    ...deriveInsightTotals(metrics),
  };
}

export async function getInsightSnapshot(env, identity, windowId) {
  const key = snapshotKey(identity, windowId);
  if (!key) return null;
  const stored = await getJson(env, key);
  if (stored?.schemaVersion !== 1 || stored.windowId !== windowId ||
      !IDENTITY_FIELDS.every((field) => stored[field] === identity[field])) return null;
  const snapshot = normalizeSnapshot(stored);
  return snapshot?.windowId === windowId ? snapshot : null;
}

// Only fresh, server-owned collection observations are passed here. No cache
// migration/backfill. KV read-before-write is best-effort idempotency, not CAS:
// concurrent isolates may still race in V1; no lock/DO is introduced.
export async function saveInsightSnapshot(env, observation) {
  const snapshot = normalizeSnapshot(observation);
  if (!snapshot) return false;
  const key = snapshotKey(snapshot, snapshot.windowId);
  if (await getText(env, key) !== null) return false;
  await putJson(env, key, snapshot);
  return true;
}
