import {
  getLatestExecution,
  listRecentExecutions,
} from "./execution-store.js";

import {
  getExecutionLock,
} from "./lock.js";

function normalizeFirstCommentStatus(
  firstComment
) {
  if (!firstComment) {
    return {
      requested:
        false,

      published:
        false,

      replyId:
        null,

      text:
        "",

      error:
        null,
    };
  }

  return {
    requested:
      Boolean(
        firstComment.requested
      ),

    published:
      Boolean(
        firstComment.published
      ),

    replyId:
      firstComment.replyId ||
      null,

    text:
      String(
        firstComment.text || ""
      ),

    error:
      firstComment.error ||
      null,
  };
}

function normalizeGenerationStatus(
  generation
) {
  return {
    attempts:
      Number(
        generation?.attempts ||
        0
      ),

    regenerated:
      Boolean(
        generation?.regenerated
      ),
  };
}

function normalizeSimilarityStatus(
  similarity
) {
  return {
    checkedPostCount:
      Number(
        similarity
          ?.checkedPostCount ||
        0
      ),

    threshold:
      Number(
        similarity?.threshold ||
        0
      ),

    highestScore:
      Number(
        similarity?.highestScore ||
        0
      ),

    matchedPostId:
      similarity
        ?.matchedPostId ||
      null,
  };
}

function safeText(value, maximum = 500) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function safeDraftText(value, maximum = 500) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maximum);
}

function normalizeError(error) {
  if (!error || typeof error !== "object") {
    return null;
  }

  const details = error.details;

  return {
    code:
      safeText(error.code, 120) ||
      "auto_post_failed",
    message:
      safeText(error.message, 280) ||
      "자동 게시 실행이 실패했습니다.",
    details: {
      reasons:
        Array.isArray(details?.reasons)
          ? details.reasons
            .map((reason) => safeText(reason, 120))
            .filter(Boolean)
            .slice(0, 8)
          : [],
      attempts:
        Number.isSafeInteger(details?.attempts)
          ? details.attempts
          : null,
    },
  };
}

function normalizeDiagnostic(diagnostic) {
  if (!diagnostic || typeof diagnostic !== "object") {
    return null;
  }

  const currentTopic = diagnostic.currentTopic;
  const attempts = Array.isArray(diagnostic.attempts)
    ? diagnostic.attempts
    : [];

  const provenance = diagnostic.provenance;
  const contentBasis = [
    "PERSONA",
    "CURRENT_TOPIC",
    "CONTENT_POOL",
  ].includes(provenance?.contentBasis)
    ? provenance.contentBasis
    : null;

  const mediaBasis = [
    "NONE",
    "DAILY_IMAGE",
    "DAILY_VIDEO",
  ].includes(provenance?.mediaBasis)
    ? provenance.mediaBasis
    : null;

  return {
    currentTopic: currentTopic && typeof currentTopic === "object"
      ? {
        mode:
          safeText(currentTopic.mode, 80) ||
          "everyday_personal",
        topicId:
          safeText(currentTopic.topicId, 160) ||
          null,
        category:
          safeText(currentTopic.category, 80) ||
          null,
        subject:
          safeText(currentTopic.subject, 240) ||
          null,
        selectedAngle:
          safeText(currentTopic.selectedAngle, 240) ||
          null,
        fallbackReason:
          safeText(currentTopic.fallbackReason, 160) ||
          null,
      }
      : null,
    provenance: contentBasis
      ? {
        contentBasis,
        mediaBasis,
      }
      : null,
    attempts: attempts.slice(0, 2).map((attempt, index) => ({
      attempt:
        Number.isSafeInteger(attempt?.attempt) && attempt.attempt > 0
          ? attempt.attempt
          : index + 1,
      draftText:
        safeDraftText(attempt?.draftText),
      format: attempt?.format && typeof attempt.format === "object"
        ? {
          signature:
            safeText(attempt.format.signature, 120) || null,
          paragraphCount:
            Number.isSafeInteger(attempt.format.paragraphCount)
              ? attempt.format.paragraphCount
              : null,
          sentencePattern:
            Array.isArray(attempt.format.sentencePattern)
              ? attempt.format.sentencePattern
                .filter(Number.isSafeInteger)
                .slice(0, 8)
              : [],
        }
        : null,
      targetFormat: attempt?.targetFormat && typeof attempt.targetFormat === "object"
        ? {
          id:
            safeText(attempt.targetFormat.id, 120) || null,
          name:
            safeText(attempt.targetFormat.name, 160) || null,
        }
        : null,
      stage:
        safeText(attempt?.stage, 120) || "unknown",
      errorCode:
        safeText(attempt?.errorCode, 120) || null,
      reasons:
        Array.isArray(attempt?.reasons)
          ? attempt.reasons
            .map((reason) => safeText(reason, 120))
            .filter(Boolean)
            .slice(0, 8)
          : [],
      similarity: attempt?.similarity && typeof attempt.similarity === "object"
        ? {
          highestScore:
            Number.isFinite(attempt.similarity.highestScore)
              ? attempt.similarity.highestScore
              : null,
          matchedPostId:
            safeText(attempt.similarity.matchedPostId, 160) || null,
          matchedPostText:
            safeDraftText(attempt.similarity.matchedPostText) || null,
        }
        : null,
      regenerated:
        Boolean(attempt?.regenerated),
      retrying:
        Boolean(attempt?.retrying),
    })),
  };
}

function normalizeExecution(execution) {
  return {
    id:
      safeText(execution.id, 160) ||
      null,
    source:
      safeText(execution.source, 120) ||
      "auto_post",
    status:
      safeText(execution.status, 80) ||
      "unknown",
    step:
      safeText(execution.step, 120) ||
      null,
    startedAt:
      execution.startedAt || null,
    updatedAt:
      execution.updatedAt || null,
    completedAt:
      execution.completedAt || null,
    postId:
      safeText(execution.postId, 160) ||
      null,
    username:
      safeText(execution.username, 160) ||
      null,
    postType:
      safeText(execution.postType, 120) ||
      null,
    textLength:
      Number.isSafeInteger(execution.textLength)
        ? execution.textLength
        : null,
    generation:
      normalizeGenerationStatus(execution.generation),
    similarity:
      normalizeSimilarityStatus(execution.similarity),
    firstComment:
      normalizeFirstCommentStatus(execution.firstComment),
    error:
      normalizeError(execution.error),
    diagnostic:
      normalizeDiagnostic(execution.diagnostic),
  };
}

export async function getAutoPostStatus(
  env
) {
  const [
    activeLock,
    latestExecution,
    executions,
  ] = await Promise.all([
    getExecutionLock(
      env
    ),

    getLatestExecution(
      env
    ),

    listRecentExecutions(
      env,
      { limit: 24 }
    ),
  ]);

  return {
    isRunning:
      Boolean(
        activeLock?.executionId
      ),

    activeExecution:
      activeLock
        ? {
            executionId:
              activeLock.executionId,

            startedAt:
              activeLock.startedAt,
          }
        : null,

    latestExecution:
      latestExecution
        ? normalizeExecution(latestExecution)
        : null,

    recentGeneralAutoExecutions:
      executions
        .filter((execution) =>
          execution.source === "cron_auto_general"
        )
        .sort((left, right) => {
          const statusDifference =
            Number(right.status === "failed") -
            Number(left.status === "failed");

          return statusDifference ||
            String(right.startedAt || "").localeCompare(
              String(left.startedAt || "")
            );
        })
        .slice(0, 8)
        .map(normalizeExecution),
  };
}
