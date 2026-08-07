import {
  executeAutoPost,
  AutoPostEngineError,
} from "./engine.js";

import {
  checkScheduleGuard,
  ScheduleGuardError,
} from "./schedule-guard.js";

const MINIMUM_INTERVAL_MINUTES =
  90;

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

export async function runScheduledAutoPost(
  env,
  {
    cron = null,
    scheduledTime = null,
  } = {}
) {
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
    }
  );

  try {
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

    const result =
      await executeAutoPost(
        env,
        {
          source:
            "cron",
        }
      );

    console.log(
      "Scheduled auto post completed",
      {
        source:
          result.source,

        cron,

        scheduledTime,

        executionId:
          result.executionId,

        postId:
          result.post_id,

        generation:
          result.generation,

        similarity:
          result.similarity,

        firstComment:
          result.firstComment,
      }
    );

    return {
      ok:
        true,

      skipped:
        false,

      source:
        "cron",

      cron,

      scheduledTime,

      startedAt,

      completedAt:
        new Date().toISOString(),

      guard,

      result,
    };
  } catch (
    error
  ) {
    if (
      error instanceof
      ScheduleGuardError
    ) {
      const serializedError =
        serializeSchedulerError(
          error
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

        completedAt:
          new Date().toISOString(),

        reason:
          serializedError,
      };
    }

    const serializedError =
      serializeSchedulerError(
        error
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