import { getPostLogs } from "./logger.js";
import { listPosts } from "./posts.js";
import { listProductReviewCandidates } from "./product-review.js";
import { getScheduleRuns } from "./auto-post/schedule-store.js";
import { getAutoPostStatus } from "./auto-post/status.js";
import { normalizeScheduleFailure } from "./schedule-operations.js";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;
// Schedule and Product Review candidate stores already retain at most 50 items.
// Post logs are read in full so hasMore reflects all activity currently persisted.

function iso(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null;
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeIdentifier(value) {
  const normalized = text(value);
  return normalized && normalized.length <= 200 && /^[a-zA-Z0-9._:-]+$/u.test(normalized) ? normalized : null;
}

function safeExternalPostId(value) {
  return safeIdentifier(value);
}

function safeGeneralAutoProvenance(value) {
  if (!value || typeof value !== "object") return null;
  const contentBasis = ["PERSONA", "CURRENT_TOPIC", "CONTENT_POOL"].includes(value.contentBasis)
    ? value.contentBasis
    : null;
  const mediaBasis = ["NONE", "DAILY_IMAGE", "DAILY_VIDEO"].includes(value.mediaBasis)
    ? value.mediaBasis
    : null;
  return contentBasis || mediaBasis ? { contentBasis, mediaBasis } : null;
}

function activityId(source, sourceId, occurredAt, index = 0, suffix = "") {
  const safeSourceId = safeIdentifier(sourceId);
  const safeTime = iso(occurredAt)?.replace(/[^a-zA-Z0-9._:-]/gu, "-") || "unknown";
  const fallback = `${safeTime}:${index}`;
  return safeIdentifier(`${source}:${safeSourceId || fallback}${suffix}`);
}

function item({ id, occurredAt, type, status, summary, failure = null, externalPostId = null, diagnostic = null }) {
  const timestamp = iso(occurredAt);
  const safeId = safeIdentifier(id);
  if (!safeId || !timestamp) return null;
  const normalized = { id: safeId, occurredAt: timestamp, type, status, summary, failure, externalPostId: externalPostId ? externalPostId : null };
  if (diagnostic) normalized.diagnostic = diagnostic;
  return normalized;
}

export function normalizeActivityLimit(value) {
  if (value === undefined || value === null || String(value).trim() === "") return DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.floor(parsed), MAX_LIMIT));
}

function scheduleType(run) {
  return run?.operation === "product_review" || run?.cron === "30 11 * * *" ? "PRODUCT_REVIEW" : "GENERAL_AUTO";
}

function safeScheduleFailure(run) {
  const failure = normalizeScheduleFailure(run);
  return failure ? { stage: failure.stage, code: failure.code, message: failure.message } : null;
}

export function normalizeScheduleActivity(run, index = 0) {
  const type = scheduleType(run);
  const occurredAt = iso(run?.completedAt) || iso(run?.scheduledTime) || iso(run?.startedAt);
  if (!occurredAt) return null;
  if (run?.status === "failed") {
    return item({ id: activityId("schedule", run?.id, occurredAt, index), occurredAt, type, status: "FAILED", summary: type === "PRODUCT_REVIEW" ? "제품 후기 자동 작업이 실패했습니다." : "General AUTO 작업이 실패했습니다.", failure: safeScheduleFailure(run) || { stage: "UNKNOWN", code: "unknown_schedule_failure", message: "자동 작업 처리 중 문제가 발생했습니다." } });
  }
  if (run?.status === "skipped" || run?.skipped === true) {
    return item({ id: activityId("schedule", run?.id, occurredAt, index), occurredAt, type, status: "SKIPPED", summary: type === "PRODUCT_REVIEW" ? "제품 후기 자동 작업을 건너뛰었습니다." : "General AUTO 작업을 건너뛰었습니다." });
  }
  if (type === "PRODUCT_REVIEW" && run?.status === "review_ready") {
    return item({ id: activityId("schedule", run?.id, occurredAt, index), occurredAt, type, status: "CANDIDATE_GENERATED", summary: "제품 후기 후보를 생성했습니다." });
  }
  if (run?.status === "completed") {
    const externalPostId = safeExternalPostId(run.postId);
    return item({ id: activityId("schedule", run?.id, occurredAt, index), occurredAt, type, status: externalPostId ? "PUBLISHED" : "SUCCESS", summary: type === "PRODUCT_REVIEW" ? (externalPostId ? "제품 후기 게시를 완료했습니다." : "제품 후기 작업을 완료했습니다.") : (externalPostId ? "General AUTO 게시를 완료했습니다." : "General AUTO 실행을 완료했습니다."), externalPostId });
  }
  return null;
}

export function normalizeProductReviewActivity(candidate, index = 0) {
  if (!text(candidate?.id)) return [];
  const generated = item({ id: activityId("product-review", candidate.id, candidate.createdAt, index, ":generated"), occurredAt: candidate.createdAt, type: "PRODUCT_REVIEW", status: "CANDIDATE_GENERATED", summary: "제품 후기 후보를 생성했습니다." });
  const published = candidate.status === "published" ? item({ id: activityId("product-review", candidate.id, candidate.publishedAt || candidate.updatedAt, index, ":published"), occurredAt: candidate.publishedAt || candidate.updatedAt, type: "PRODUCT_REVIEW", status: "CANDIDATE_PUBLISHED", summary: "제품 후기 후보가 게시되었습니다.", externalPostId: safeExternalPostId(candidate.postId) }) : null;
  return [generated, published].filter(Boolean);
}

export function normalizeManualPostActivity(post, index = 0) {
  if (post?.status !== "PUBLISHED" || !text(post?.id)) return null;
  return item({ id: activityId("operator-post", post.id, post.publishedAt, index), occurredAt: post.publishedAt, type: "MANUAL_PUBLISH", status: "PUBLISHED", summary: "직접 작성한 게시물을 게시했습니다.", externalPostId: safeExternalPostId(post.publishedPostId) });
}

function postLogType(log) {
  const source = text(log?.metadata?.source);
  if (source === "cron_auto_general") return "GENERAL_AUTO";
  if (source === "manual_product_test") return "PRODUCT_REVIEW";
  if (source === "OPERATOR") return "MANUAL_PUBLISH";
  return "OTHER_PUBLISH";
}

function safePostLogFailure(log) {
  const step = text(log?.step);
  if (step === "similarity_validation" || step === "validation") return { stage: "CONTENT_FORMAT_VALIDATION", code: "post_format_validation_failed", message: "게시물 형식 검증을 통과하지 못했습니다." };
  if (step === "ai_generation") return { stage: "AI_GENERATION", code: "ai_generation_failed", message: "AI 글 생성에 실패했습니다." };
  if (step === "loading_auth") return { stage: "THREADS_AUTH", code: "threads_auth_missing", message: "Threads 계정 연결을 확인해야 합니다." };
  if (step && /^(?:create|publish)_/u.test(step)) return { stage: "PUBLISHING", code: "threads_publish_failed", message: "Threads 게시 처리에 실패했습니다." };
  return { stage: "UNKNOWN", code: "unknown_publish_failure", message: "게시 처리 중 문제가 발생했습니다." };
}

export function normalizePostLogActivity(log, index = 0) {
  const occurredAt = iso(log?.created_at);
  if (!occurredAt) return null;
  const type = postLogType(log);
  if (log?.status === "published") {
    const externalPostId = safeExternalPostId(log.post_id);
    return item({ id: activityId("post-log", externalPostId, occurredAt, index), occurredAt, type, status: "PUBLISHED", summary: type === "GENERAL_AUTO" ? "General AUTO 게시를 완료했습니다." : type === "PRODUCT_REVIEW" ? "제품 후기 게시를 완료했습니다." : type === "MANUAL_PUBLISH" ? "직접 작성한 게시물을 게시했습니다." : "게시를 완료했습니다.", externalPostId });
  }
  if (log?.status === "failed") {
    return item({ id: activityId("post-log:failed", null, occurredAt, index), occurredAt, type, status: "FAILED", summary: type === "GENERAL_AUTO" ? "General AUTO 작업이 실패했습니다." : "게시 작업이 실패했습니다.", failure: safePostLogFailure(log) });
  }
  return null;
}

function sortNewest(items) {
  return items.sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt) || left.id.localeCompare(right.id));
}

export function summarizeGeneralAutoActivity(items) {
  const summary = {
    totalExecutions: 0,
    successfulPublishes: 0,
    failedExecutions: 0,
    textCount: 0,
    imageCount: 0,
    personaCount: 0,
    currentTopicCount: 0,
    imageUsagePercent: null,
  };

  for (const activity of Array.isArray(items) ? items : []) {
    if (activity?.type !== "GENERAL_AUTO") continue;
    summary.totalExecutions += 1;
    if (activity.status === "PUBLISHED") summary.successfulPublishes += 1;
    if (activity.status === "FAILED") summary.failedExecutions += 1;
    if (activity.contentBasis === "PERSONA") summary.personaCount += 1;
    if (activity.contentBasis === "CURRENT_TOPIC") summary.currentTopicCount += 1;
    if (activity.mediaBasis === "NONE") summary.textCount += 1;
    if (activity.mediaBasis === "DAILY_IMAGE") summary.imageCount += 1;
  }

  const knownTextOrImage = summary.textCount + summary.imageCount;
  if (knownTextOrImage) {
    summary.imageUsagePercent = Math.round((summary.imageCount / knownTextOrImage) * 100);
  }
  return summary;
}

export async function getOperatorActivity(env, { limit, dependencies = {} } = {}) {
  const readSchedules = dependencies.getScheduleRuns || getScheduleRuns;
  const readCandidates = dependencies.listProductReviewCandidates || listProductReviewCandidates;
  const readPosts = dependencies.listPosts || listPosts;
  const readLogs = dependencies.getPostLogs || getPostLogs;
  const readAutoStatus = dependencies.getAutoPostStatus || getAutoPostStatus;
  const reads = await Promise.allSettled([
    readSchedules(env, MAX_LIMIT),
    readCandidates(env, MAX_LIMIT),
    readPosts(env, { status: "PUBLISHED" }),
    readLogs(env),
    readAutoStatus(env),
  ]);
  if (reads.slice(0, 4).every((result) => result.status === "rejected")) throw new Error("All activity sources are unavailable");
  const [runs, candidates, posts, logs, autoStatus] = reads.map((result) => result.status === "fulfilled" ? result.value : []);
  const partial = reads.some((result) => result.status === "rejected");

  const generalAutoExecutions = (Array.isArray(autoStatus?.recentGeneralAutoExecutions) ? autoStatus.recentGeneralAutoExecutions : [])
    .filter((execution) => safeIdentifier(execution?.id) && execution?.diagnostic);
  const diagnosticsByExecutionId = new Map(generalAutoExecutions.map((execution) => [execution.id, execution.diagnostic]));
  const matchedExecutionIds = new Set();

  function generalAutoDiagnostic(run) {
    const executionId = safeIdentifier(run?.executionId);
    if (executionId && diagnosticsByExecutionId.has(executionId)) {
      matchedExecutionIds.add(executionId);
      return diagnosticsByExecutionId.get(executionId);
    }
    const runAt = Date.parse(run?.completedAt || run?.startedAt || run?.scheduledTime || "");
    if (!Number.isFinite(runAt)) return null;
    const closest = generalAutoExecutions
      .filter((execution) => !matchedExecutionIds.has(execution.id))
      .map((execution) => ({ execution, difference: Math.abs(Date.parse(execution.completedAt || execution.updatedAt || execution.startedAt || "") - runAt) }))
      .filter(({ difference }) => Number.isFinite(difference) && difference <= 15 * 60 * 1000)
      .sort((left, right) => left.difference - right.difference)[0]?.execution;
    if (!closest) return null;
    matchedExecutionIds.add(closest.id);
    return closest.diagnostic;
  }

  const items = [];
  const externalPostIds = new Set();
  const generatedCandidateIds = new Set();
  for (const [index, run] of (Array.isArray(runs) ? runs : []).entries()) {
    const normalized = normalizeScheduleActivity(run, index);
    if (!normalized) continue;
    const diagnostic = normalized.type === "GENERAL_AUTO" ? generalAutoDiagnostic(run) : null;
    const provenance = normalized.type === "GENERAL_AUTO"
      ? safeGeneralAutoProvenance(diagnostic?.provenance)
        || safeGeneralAutoProvenance(run?.provenance)
        || safeGeneralAutoProvenance(run?.generation?.provenance)
      : null;
    items.push(diagnostic || provenance ? {
      ...normalized,
      ...(diagnostic ? { diagnostic } : {}),
      ...(provenance?.contentBasis ? { contentBasis: provenance.contentBasis } : {}),
      ...(provenance?.mediaBasis ? { mediaBasis: provenance.mediaBasis } : {}),
    } : normalized);
    const externalPostId = normalized.externalPostId;
    if (externalPostId) externalPostIds.add(externalPostId);
    if (run?.status === "review_ready" && text(run?.candidateId)) generatedCandidateIds.add(text(run.candidateId));
  }
  for (const [index, candidate] of (Array.isArray(candidates) ? candidates : []).entries()) {
    const candidateId = text(candidate?.id);
    for (const normalized of normalizeProductReviewActivity(candidate, index)) {
      if (normalized.status === "CANDIDATE_GENERATED" && generatedCandidateIds.has(candidateId)) continue;
      const externalPostId = normalized.externalPostId;
      if (externalPostId && externalPostIds.has(externalPostId)) continue;
      items.push(normalized);
      if (externalPostId) externalPostIds.add(externalPostId);
    }
  }
  for (const [index, post] of (Array.isArray(posts) ? posts : []).entries()) {
    const normalized = normalizeManualPostActivity(post, index);
    if (!normalized || (normalized.externalPostId && externalPostIds.has(normalized.externalPostId))) continue;
    items.push(normalized);
    if (normalized.externalPostId) externalPostIds.add(normalized.externalPostId);
  }
  for (const [index, log] of (Array.isArray(logs) ? logs : []).entries()) {
    const normalized = normalizePostLogActivity(log, index);
    if (normalized?.type === "GENERAL_AUTO") continue;
    if (!normalized || (normalized.externalPostId && externalPostIds.has(normalized.externalPostId))) continue;
    items.push(normalized);
    if (normalized.externalPostId) externalPostIds.add(normalized.externalPostId);
  }

  const safeLimit = normalizeActivityLimit(limit);
  const sorted = sortNewest(items);
  const recentItems = sorted.slice(0, safeLimit);
  return {
    items: recentItems,
    generalAutoSummary: summarizeGeneralAutoActivity(recentItems),
    limit: safeLimit,
    hasMore: sorted.length > safeLimit,
    generatedAt: new Date().toISOString(),
    partial,
  };
}
