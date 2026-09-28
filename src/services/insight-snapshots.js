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

export function snapshotKey(identity, windowId) {
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

function normalizeStoredSnapshot(stored, identity, windowId) {
  if (stored?.schemaVersion !== 1 || stored.windowId !== windowId ||
      !IDENTITY_FIELDS.every((field) => stored[field] === identity[field])) return null;
  const snapshot = normalizeSnapshot(stored);
  return snapshot?.windowId === windowId ? snapshot : null;
}

export async function getInsightSnapshot(env, identity, windowId) {
  const key = snapshotKey(identity, windowId);
  if (!key) return null;
  return normalizeStoredSnapshot(await getJson(env, key), identity, windowId);
}

// Complete account discovery only: a failed/budget-limited scan never exposes
// the subset already read. Budgets also bound empty/repeating pagination.
export async function listAccountInsightSnapshots(env, identity, windowId, { strictDiscovery = false } = {}) {
  const counts = { scannedKeys: 0, listCalls: 0, bulkReadCalls: 0 };
  // Opt-in for aggregation only; existing single/baseline contracts stay intact.
  if (strictDiscovery) counts.invalidSnapshotCount = 0;
  const unavailable = (reason) => ({ available: false, reason, snapshots: [], ...counts });
  const probe = snapshotKey({ ...identity, postId: "probe" }, windowId);
  if (!probe) return unavailable("invalid_snapshot_scope");
  const prefix = probe.slice(0, -`probe:${windowId}`.length);
  const snapshots = [];
  const seenKeys = new Set();
  const cursors = new Set();
  let cursor;
  while (true) {
    if (counts.listCalls >= 20) return unavailable("snapshot_list_budget_exceeded");
    let page;
    try {
      counts.listCalls += 1;
      page = await env.THREADS_KV.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    } catch {
      return unavailable("snapshot_list_failed");
    }
    if (!Array.isArray(page?.keys) || typeof page.list_complete !== "boolean" ||
        page.keys.some((key) => typeof key?.name !== "string")) return unavailable("snapshot_pagination_invalid");
    counts.scannedKeys += page.keys.length;
    if (counts.scannedKeys > 5000) return unavailable("snapshot_key_budget_exceeded");

    const candidates = [];
    for (const { name } of page.keys) {
      if (!name.startsWith(prefix)) {
        if (strictDiscovery) return unavailable("snapshot_pagination_invalid");
        continue;
      }
      if (seenKeys.has(name)) {
        if (strictDiscovery && name.endsWith(`:${windowId}`)) return unavailable("duplicate_snapshot_identity");
        continue;
      }
      seenKeys.add(name);
      const parts = name.slice(prefix.length).split(":");
      if (parts.length !== 2 || parts[1] !== windowId) continue;
      let postId;
      try { postId = decodeURIComponent(parts[0]); } catch { continue; }
      const expected = { ...identity, postId };
      if (snapshotKey(expected, windowId) === name) candidates.push({ name, identity: expected });
    }
    for (let start = 0; start < candidates.length; start += 100) {
      if (counts.bulkReadCalls >= 50) return unavailable("snapshot_bulk_budget_exceeded");
      const batch = candidates.slice(start, start + 100);
      let values;
      try {
        counts.bulkReadCalls += 1;
        values = await env.THREADS_KV.get(batch.map((item) => item.name), "json");
      } catch {
        return unavailable("snapshot_bulk_read_failed");
      }
      if (!(values instanceof Map) || batch.some((item) => !values.has(item.name))) {
        return unavailable("snapshot_bulk_read_failed");
      }
      for (const item of batch) {
        const snapshot = normalizeStoredSnapshot(values.get(item.name), item.identity, windowId);
        if (snapshot) snapshots.push(snapshot);
        else if (strictDiscovery) counts.invalidSnapshotCount += 1;
      }
    }
    if (page.list_complete) return { available: true, reason: null, snapshots, ...counts };
    if (!nonblank(page.cursor) || cursors.has(page.cursor)) return unavailable("snapshot_pagination_invalid");
    cursors.add(page.cursor);
    cursor = page.cursor;
  }
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
