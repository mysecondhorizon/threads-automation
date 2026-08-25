import {
  executeAutoPost,
  AutoPostEngineError,
} from "./engine.js";

import {
  checkScheduleGuard,
  ScheduleGuardError,
} from "./schedule-guard.js";

import {
  checkDailyAutoPostLimit,
  DailyLimitGuardError,
} from "./daily-limit-guard.js";

import {
  saveScheduleRun,
} from "./schedule-store.js";

import {
  syncThreadsData,
} from "../threads-sync.js";

import {
  generateProductReviewCandidate,
} from "../product-review.js";

import {
  buildAiCandidatePackage,
} from "../ai-candidate-package.js";

import {
  selectAiCandidate,
} from "../ai-candidate-selector.js";

const MINIMUM_INTERVAL_MINUTES =
  90;

const DAILY_AUTO_POST_LIMIT =
  4;

function isShadowSelectionEnabled(env) {
  const value =
    String(env?.CRON_AI_SELECTION_SHADOW || "")
      .trim()
      .toLowerCase();

  return value === "true" || value === "1" || value === "on";
}

export async function runCronAiSelectionShadow(
  env,
  {
    services = {},
    at = new Date(),
  } = {}
) {
  if (!isShadowSelectionEnabled(env)) {
    return {
      enabled: false,
      skipped: true,
      reason: "disabled",
    };
  }

  try {
    const buildPackage =
      services.buildAiCandidatePackage ||
      buildAiCandidatePackage;
    const selectCandidate =
      services.selectAiCandidate ||
      selectAiCandidate;

    const candidatePackage =
      await buildPackage(env, { at });

    if (!candidatePackage.candidates.length) {
      console.log(
        "Cron AI selection shadow skipped",
        {
          source: "cron_ai_selection_shadow",
          reason: "no_eligible_candidates",
        }
      );

      return {
        enabled: true,
        skipped: true,
        reason: "no_eligible_candidates",
      };
    }

    const result =
      await selectCandidate(env, {
        candidatePackage,
      });
    const selection = result.selection || {};

    console.log(
      "Cron AI selection shadow completed",
      {
        source: "cron_ai_selection_shadow",
        selectionSource: result.source,
        candidateId: selection.candidateId || null,
        productId: selection.productId || null,
        mediaId: selection.mediaId || null,
        contentType: selection.contentType || null,
        reason:
          result.source === "fallback"
            ? result.fallback?.category || "deterministic_scoring_fallback"
            : "ai_selection",
      }
    );

    return {
      enabled: true,
      skipped: false,
      source: result.source,
      selection: {
        candidateId: selection.candidateId || null,
        productId: selection.productId || null,
        mediaId: selection.mediaId || null,
        contentType: selection.contentType || null,
      },
      reason:
        result.source === "fallback"
          ? result.fallback?.category || "deterministic_scoring_fallback"
          : "ai_selection",
    };
  } catch (error) {
    console.error(
      "Cron AI selection shadow failed",
      {
        source: "cron_ai_selection_shadow",
        reason: "shadow_pipeline_failed",
        category: error?.details?.category || error?.code || "unknown",
      }
    );

    return {
      enabled: true,
      skipped: true,
      reason: "shadow_pipeline_failed",
      category: error?.details?.category || error?.code || "unknown",
    };
  }
}

export const PRODUCT_REVIEW_CRON =
  "30 11 * * *";

export function getScheduledOperation(cron) {
  return String(cron || "").trim() === PRODUCT_REVIEW_CRON
    ? "product_review"
    : "auto_general";
}

function serializeSchedulerError(
  error
) {
  if (
    error instanceof
    AutoPostEngineError
  ) {
    return {
      name:
        error.name,

      code:
        error.code,

      status:
        error.status,

      step:
        error.step,

      message:
        error.message,

      details:
        error.details,
    };
  }

  if (
    error instanceof
    ScheduleGuardError
  ) {
    return {
      name:
        error.name,

      code:
        error.code,

      status:
        409,

      step:
        "schedule_guard",

      message:
        error.message,

      details:
        error.details,
    };
  }

  if (
    error instanceof
    DailyLimitGuardError
  ) {
    return {
      name:
        error.name,

      code:
        error.code,

      status:
        409,

      step:
        "daily_limit_guard",

      message:
        error.message,

      details:
        error.details,
    };
  }

  if (
    error instanceof Error
  ) {
    return {
      name:
        error.name,

      code:
        null,

      status:
        null,

      step:
        null,

      message:
        error.message,

      details:
        null,
    };
  }

  return {
    name:
      "UnknownError",

    code:
      null,

    status:
      null,

    step:
      null,

    message:
      String(error),

    details:
      null,
  };
}

async function safeSaveScheduleRun(
  env,
  input
) {
  try {
    return await saveScheduleRun(
      env,
      input
    );
  } catch (
    error
  ) {
    console.error(
      "Failed to save schedule run",
      error
    );

    return null;
  }
}

export async function runScheduledAutoPost(
  env,
  {
    cron = null,
    scheduledTime = null,
    operation: requestedOperation = null,
    services = {},
  } = {}
) {
  const operation =
    requestedOperation ||
    getScheduledOperation(cron);

  const generateProductReview =
    services.generateProductReviewCandidate ||
    generateProductReviewCandidate;

  const executeScheduledAutoPost =
    services.executeAutoPost ||
    executeAutoPost;

  const startedAt =
    new Date().toISOString();

  console.log(
    "Scheduled auto post started",
    {
      source:
        "cron",

      cron,

      scheduledTime,

      startedAt,

      operation,
    }
  );

  try {
    if (operation === "product_review") {
      const candidate =
        await generateProductReview(
          env,
          {
            source: "cron_product_review",
            cron,
            scheduledTime,
          }
        );

      const completedAt =
        new Date().toISOString();

      await safeSaveScheduleRun(
        env,
        {
          operation,
          cron,
          scheduledTime,
          startedAt,
          completedAt,
          status: "review_ready",
          skipped: false,
          published: false,
          candidateId: candidate.id,
          postId: null,
          generation: candidate.generation,
          error: null,
        }
      );

      return {
        ok: true,
        skipped: false,
        published: false,
        operation,
        source: "cron_product_review",
        cron,
        scheduledTime,
        startedAt,
        completedAt,
        candidate,
      };
    }

    const syncResult =
      await syncThreadsData(
        env
      );

    console.log(
      "Scheduled Threads sync completed",
      {
        deleted:
          syncResult.sync
            ?.deleted ||
          0,

        updated:
          syncResult.sync
            ?.updated ||
          0,

        unchanged:
          syncResult.sync
            ?.unchanged ||
          0,

        refreshed:
          syncResult.insights
            ?.refreshed ||
          0,

        failed:
          syncResult.insights
            ?.failed ||
          0,
      }
    );

    const dailyLimit =
      await checkDailyAutoPostLimit(
        env,
        {
          dailyLimit:
            DAILY_AUTO_POST_LIMIT,
        }
      );

    console.log(
      "Daily auto post limit guard passed",
      {
        dailyLimit:
          dailyLimit.dailyLimit,

        todayPostCount:
          dailyLimit.todayPostCount,

        remaining:
          dailyLimit.remaining,
      }
    );

    const guard =
      await checkScheduleGuard(
        env,
        {
          minimumIntervalMinutes:
            MINIMUM_INTERVAL_MINUTES,
        }
      );

    console.log(
      "Scheduled auto post guard passed",
      {
        cron,

        scheduledTime,

        minimumIntervalMinutes:
          guard.minimumIntervalMinutes,

        minutesSinceLatestPost:
          guard.minutesSinceLatestPost,

        latestPostId:
          guard.latestPostId,
      }
    );

    await runCronAiSelectionShadow(
      env,
      {
        services,
        at: scheduledTime || new Date(),
      }
    );

    const publishResult =
      await executeScheduledAutoPost(
        env,
        {
          source:
            "cron_auto_general",

          generalOnly:
            true,
        }
      );

    const completedAt =
      new Date().toISOString();

    await safeSaveScheduleRun(
      env,
      {
        operation,

        cron,

        scheduledTime,

        startedAt,

        completedAt,

        status:
          "completed",

        skipped:
          false,

        executionId:
          publishResult.executionId,

        postId:
          publishResult.post_id,

        generation:
          publishResult.generation,

        similarity:
          publishResult.similarity,

        sync: {
          deleted:
            syncResult.sync
              ?.deleted ||
            0,

          updated:
            syncResult.sync
              ?.updated ||
            0,

          unchanged:
            syncResult.sync
              ?.unchanged ||
            0,

          refreshed:
            syncResult.insights
              ?.refreshed ||
            0,

          failed:
            syncResult.insights
              ?.failed ||
            0,
        },

        error:
          null,
      }
    );

    console.log(
      "Scheduled auto post completed",
      {
        source:
          publishResult.source,

        cron,

        scheduledTime,

        executionId:
          publishResult.executionId,

        postId:
          publishResult.post_id,

        generation:
          publishResult.generation,

        similarity:
          publishResult.similarity,

        firstComment:
          publishResult.firstComment,
      }
    );

    return {
      ok:
        true,

      skipped:
        false,

      source:
        "cron_auto_general",

      operation,

      cron,

      scheduledTime,

      startedAt,

      completedAt,

      sync:
        syncResult,

      dailyLimit,

      guard,

      result: publishResult,
    };
  } catch (
    error
  ) {
    if (
      error instanceof
        ScheduleGuardError ||
      error instanceof
        DailyLimitGuardError
    ) {
      const serializedError =
        serializeSchedulerError(
          error
        );

      const completedAt =
        new Date().toISOString();

      await safeSaveScheduleRun(
        env,
        {
          operation,

          cron,

          scheduledTime,

          startedAt,

          completedAt,

          status:
            "skipped",

          skipped:
            true,

          skipReason:
            serializedError,

          executionId:
            null,

          postId:
            null,

          generation:
            null,

          similarity:
            null,

          error:
            null,
        }
      );

      console.log(
        "Scheduled auto post skipped",
        {
          source:
            "cron",

          cron,

          scheduledTime,

          startedAt,

          reason:
            serializedError,
        }
      );

      return {
        ok:
          true,

        skipped:
          true,

        source:
          "cron",

        cron,

        scheduledTime,

        startedAt,

        completedAt,

        reason:
          serializedError,
      };
    }

    const serializedError =
      serializeSchedulerError(
        error
      );

    const completedAt =
      new Date().toISOString();

    await safeSaveScheduleRun(
      env,
      {
        operation,

        cron,

        scheduledTime,

        startedAt,

        completedAt,

        status:
          "failed",

        skipped:
          false,

        executionId:
          null,

        postId:
          null,

        generation:
          null,

        similarity:
          null,

        error:
          serializedError,
      }
    );

    console.error(
      "Scheduled auto post failed",
      {
        source:
          "cron",

        cron,

        scheduledTime,

        startedAt,

        error:
          serializedError,
      }
    );

    throw error;
  }
}
