import {
  getLatestExecution,
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

export async function getAutoPostStatus(
  env
) {
  const [
    activeLock,
    latestExecution,
  ] = await Promise.all([
    getExecutionLock(
      env
    ),

    getLatestExecution(
      env
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
        ? {
            id:
              latestExecution.id,

            source:
              latestExecution.source ||
              "auto_post",

            status:
              latestExecution.status,

            step:
              latestExecution.step,

            startedAt:
              latestExecution.startedAt,

            updatedAt:
              latestExecution.updatedAt,

            completedAt:
              latestExecution.completedAt,

            postId:
              latestExecution.postId,

            username:
              latestExecution.username,

            postType:
              latestExecution.postType ||
              null,

            textLength:
              latestExecution.textLength,

            generation:
              normalizeGenerationStatus(
                latestExecution.generation
              ),

            similarity:
              normalizeSimilarityStatus(
                latestExecution.similarity
              ),

            firstComment:
              normalizeFirstCommentStatus(
                latestExecution.firstComment
              ),

            error:
              latestExecution.error,
          }
        : null,
  };
}