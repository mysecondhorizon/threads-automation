import {
  executeAutoPost,
  AutoPostEngineError,
} from "./engine.js";

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
      cron,

      scheduledTime,

      startedAt,
    }
  );

  try {
    const result =
      await executeAutoPost(
        env
      );

    console.log(
      "Scheduled auto post completed",
      {
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
      }
    );

    return {
      ok:
        true,

      source:
        "cron",

      cron,

      scheduledTime,

      startedAt,

      completedAt:
        new Date().toISOString(),

      result,
    };
  } catch (
    error
  ) {
    const serializedError =
      serializeSchedulerError(
        error
      );

    console.error(
      "Scheduled auto post failed",
      {
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