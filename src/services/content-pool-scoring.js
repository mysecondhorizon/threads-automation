import { listContentPool } from "./content-pool.js";

const DAY_MS = 86400000;
const MAX_RECENCY_DAYS = 365;

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function timestamp(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function compareText(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  return a < b ? -1 : a > b ? 1 : 0;
}

function eligibility(item, atMs) {
  if (item?.active === false) return { eligible: false, reason: "inactive" };

  const availableFrom = timestamp(item.availableFrom);
  if (item.availableFrom && availableFrom === null) {
    return { eligible: false, reason: "available_from_invalid" };
  }
  if (availableFrom !== null && availableFrom > atMs) {
    return { eligible: false, reason: "available_from_future" };
  }

  const availableUntil = timestamp(item.availableUntil);
  if (item.availableUntil && availableUntil === null) {
    return { eligible: false, reason: "available_until_invalid" };
  }
  if (availableUntil !== null && availableUntil < atMs) {
    return { eligible: false, reason: "available_until_expired" };
  }

  const maxUses = finiteNumber(item.maxUses, 0);
  const usedCount = finiteNumber(item.usedCount, 0);
  if (maxUses > 0 && usedCount >= maxUses) {
    return { eligible: false, reason: "max_uses_reached" };
  }

  const lastUsedAt = timestamp(item.lastUsedAt);
  if (item.lastUsedAt && lastUsedAt === null) {
    return { eligible: false, reason: "last_used_at_invalid" };
  }
  const cooldownDays = Math.max(0, finiteNumber(item.cooldownDays, 0));
  if (lastUsedAt !== null && cooldownDays > 0 && lastUsedAt + cooldownDays * DAY_MS > atMs) {
    return { eligible: false, reason: "cooldown_active" };
  }

  return { eligible: true, reason: null };
}

export function scoreContentPoolCandidate(item, options = {}) {
  const at = new Date(options.at || new Date());
  const atMs = at.getTime();
  if (Number.isNaN(atMs)) {
    return {
      candidate: item,
      eligible: false,
      score: null,
      scoreBreakdown: {},
      ineligibleReason: "evaluation_time_invalid",
    };
  }

  const status = eligibility(item, atMs);
  if (!status.eligible) {
    return {
      candidate: item,
      eligible: false,
      score: null,
      scoreBreakdown: {},
      ineligibleReason: status.reason,
    };
  }

  const priority = finiteNumber(item.priority, 0);
  const maxUses = finiteNumber(item.maxUses, 0);
  const usedCount = Math.max(0, finiteNumber(item.usedCount, 0));
  const usageHeadroom = maxUses > 0 ? Math.max(0, (maxUses - usedCount) / maxUses) : 0;
  const lastUsedAt = timestamp(item.lastUsedAt);
  const recencyDays = lastUsedAt === null
    ? MAX_RECENCY_DAYS
    : Math.max(0, Math.min(MAX_RECENCY_DAYS, (atMs - lastUsedAt) / DAY_MS));
  const allowedTypes = Array.isArray(item.allowedContentTypes)
    ? item.allowedContentTypes.map((value) => String(value))
    : [];
  const contentTypeMatch = options.contentType && allowedTypes.includes(String(options.contentType))
    ? 25
    : 0;

  const breakdown = {
    priority: priority * 1000,
    usageHeadroom: usageHeadroom * 100,
    recency: recencyDays * 0.1,
    contentTypeMatch,
  };
  const score = Number(Object.values(breakdown).reduce((sum, value) => sum + value, 0).toFixed(4));

  return {
    candidate: item,
    eligible: true,
    score,
    scoreBreakdown: breakdown,
    ineligibleReason: null,
  };
}

function compareScored(left, right) {
  if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
  if (left.eligible && right.eligible && left.score !== right.score) return right.score - left.score;

  const leftLast = timestamp(left.candidate?.lastUsedAt);
  const rightLast = timestamp(right.candidate?.lastUsedAt);
  if ((leftLast ?? -Infinity) !== (rightLast ?? -Infinity)) {
    return (leftLast ?? -Infinity) - (rightLast ?? -Infinity);
  }
  const leftCreated = timestamp(left.candidate?.createdAt);
  const rightCreated = timestamp(right.candidate?.createdAt);
  if ((leftCreated ?? Infinity) !== (rightCreated ?? Infinity)) {
    return (leftCreated ?? Infinity) - (rightCreated ?? Infinity);
  }
  return compareText(left.candidate?.id, right.candidate?.id);
}

export function scoreContentPoolCandidates(items, options = {}) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => scoreContentPoolCandidate(item, options))
    .sort(compareScored);
}

export async function getScoredContentPoolCandidates(env, options = {}) {
  const items = await listContentPool(env, { type: options.type }, options.workspaceId);
  const scored = scoreContentPoolCandidates(items, options);
  return options.limit === undefined
    ? scored
    : scored.slice(0, Math.max(1, Math.trunc(Number(options.limit) || 1)));
}
