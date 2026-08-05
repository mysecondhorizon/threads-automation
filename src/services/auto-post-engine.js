import {
  buildThreadContext,
} from "./thread-context.js";

import {
  generateThreadPost,
  AiServiceError,
} from "./ai.js";

import {
  getThreadsProfile,
  publishTextPost,
  ThreadsApiError,
} from "./threads.js";

import {
  getJson,
  putJson,
  deleteKey,
} from "./kv.js";

import {
  logPostSuccess,
  logPostFailure,
} from "./logger.js";

const AUTO_POST_LOCK_KEY =
  "auto_post:active_execution";

const AUTO_POST_LATEST_EXECUTION_KEY =
  "auto_post:latest_execution";

const AUTO_POST_LOCK_TTL_SECONDS =
  120;

const AUTO_POST_EXECUTION_TTL_SECONDS =
  60 * 60 * 24 * 7;

const AUTO_POST_GOAL =
  "현재 시간과 최근 게시 성과를 반영한 Threads 게시글 1개를 작성한다.";

const AUTO_POST_TONE =
  "40대 직장인의 현실적인 말투";

let activeExecutionPromise = null;

export class AutoPostEngineError extends Error {
  constructor(
    message,
    {
      code = "auto_post_failed",
      status = 500,
      step = "unknown",
      details = null,
      text = "",
      cause = null,
    } = {}
  ) {
    super(
      message,
      cause
        ? {
            cause,
          }
        : undefined
    );

    this.name =
      "AutoPostEngineError";

    this.code =
      code;

    this.status =
      status;

    this.step =
      step;

    this.details =
      details;

    this.text =
      text;
  }
}

function createExecutionId() {
  if (
    globalThis.crypto &&
    typeof globalThis.crypto
      .randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return [
    Date.now().toString(36),
    Math.random()
      .toString(36)
      .slice(2, 12),
  ].join("-");
}

function getExecutionKey(
  executionId
) {
  return (
    "auto_post_execution:" +
    executionId
  );
}

function serializeError(
  error
) {
  if (
    error instanceof Error
  ) {
    return {
      name:
        error.name,

      message:
        error.message,
    };
  }

  return {
    name:
      "UnknownError",

    message:
      String(error),
  };
}

async function saveExecution(
  env,
  executionId,
  value
) {
  await Promise.all([
    putJson(
      env,
      getExecutionKey(
        executionId
      ),
      value,
      {
        expirationTtl:
          AUTO_POST_EXECUTION_TTL_SECONDS,
      }
    ),

    putJson(
      env,
      AUTO_POST_LATEST_EXECUTION_KEY,
      value
    ),
  ]);
}

async function updateExecution(
  env,
  execution,
  updates
) {
  Object.assign(
    execution,
    updates,
    {
      updatedAt:
        new Date().toISOString(),
    }
  );

  await saveExecution(
    env,
    execution.id,
    execution
  );
}

async function acquireExecutionLock(
  env,
  executionId
) {
  const currentLock =
    await getJson(
      env,
      AUTO_POST_LOCK_KEY
    );

  if (
    currentLock?.executionId
  ) {
    throw new AutoPostEngineError(
      "자동 게시가 이미 실행 중입니다.",
      {
        code:
          "auto_post_in_progress",

        status:
          409,

        step:
          "lock",

        details: {
          executionId:
            currentLock.executionId,

          startedAt:
            currentLock.startedAt,
        },
      }
    );
  }

  await putJson(
    env,
    AUTO_POST_LOCK_KEY,
    {
      executionId,

      startedAt:
        new Date().toISOString(),
    },
    {
      expirationTtl:
        AUTO_POST_LOCK_TTL_SECONDS,
    }
  );
}

async function releaseExecutionLock(
  env,
  executionId
) {
  const currentLock =
    await getJson(
      env,
      AUTO_POST_LOCK_KEY
    );

  if (
    currentLock?.executionId ===
    executionId
  ) {
    await deleteKey(
      env,
      AUTO_POST_LOCK_KEY
    );
  }
}

function validateGeneratedPost(
  generatedPost
) {
  const text =
    String(
      generatedPost?.body || ""
    ).trim();

  if (!text) {
    throw new AutoPostEngineError(
      "AI가 게시글을 생성하지 못했습니다.",
      {
        code:
          "empty_generated_post",

        status:
          502,

        step:
          "validation",
      }
    );
  }

  if (
    text.length > 500
  ) {
    throw new AutoPostEngineError(
      "AI가 생성한 본문이 500자를 초과했습니다.",
      {
        code:
          "generated_post_too_long",

        status:
          502,

        step:
          "validation",

        details: {
          length:
            text.length,
        },

        text,
      }
    );
  }

  return text;
}

async function safeLogFailure(
  env,
  step,
  text,
  details
) {
  try {
    await logPostFailure(
      env,
      step,
      text,
      details
    );
  } catch (
    logError
  ) {
    console.error(
      "Auto post failure logging failed",
      logError
    );
  }
}

function normalizeEngineError(
  error,
  generatedPost
) {
  const failedText =
    String(
      generatedPost?.body || ""
    );

  if (
    error instanceof
    AutoPostEngineError
  ) {
    if (!error.text) {
      error.text =
        failedText;
    }

    return error;
  }

  if (
    error instanceof
    AiServiceError
  ) {
    return new AutoPostEngineError(
      "자동 게시용 AI 글 생성에 실패했습니다.",
      {
        code:
          "ai_generation_failed",

        status:
          502,

        step:
          "ai_generation",

        details:
          error.details || {
            message:
              error.message,
          },

        text:
          failedText,

        cause:
          error,
      }
    );
  }

  if (
    error instanceof
    ThreadsApiError
  ) {
    return new AutoPostEngineError(
      "자동 Threads 게시에 실패했습니다.",
      {
        code:
          "threads_publish_failed",

        status:
          400,

        step:
          error.step,

        details:
          error.details,

        text:
          failedText,

        cause:
          error,
      }
    );
  }

  return new AutoPostEngineError(
    "Unexpected server error",
    {
      code:
        "unexpected_auto_post_error",

      status:
        500,

      step:
        "unexpected_auto_post_error",

      details:
        serializeError(
          error
        ),

      text:
        failedText,

      cause:
        error instanceof Error
          ? error
          : null,
    }
  );
}

function buildSuccessResult(
  executionId,
  profile,
  publishResult,
  generatedPost,
  context,
  text
) {
  return {
    executionId,

    username:
      profile.username,

    post_id:
      publishResult.postId,

    text,

    postType:
      generatedPost.postType,

    firstComment:
      generatedPost.firstComment,

    metadata:
      generatedPost.metadata,

    context: {
      version:
        context.meta.version,

      generatedAt:
        context.meta.generatedAt,

      publishSequence:
        context.publishing
          .publishSequence,

      recentPostCount:
        context.history
          .recentPostCount,

      performanceLevel:
        context.analytics
          .performanceLevel,
    },
  };
}

async function runExecution(
  env
) {
  const executionId =
    createExecutionId();

  const now =
    new Date().toISOString();

  const execution = {
    id:
      executionId,

    status:
      "starting",

    step:
      "initializing",

    startedAt:
      now,

    updatedAt:
      now,

    completedAt:
      null,

    postId:
      null,

    username:
      null,

    error:
      null,
  };

  let lockAcquired =
    false;

  let generatedPost =
    null;

  await saveExecution(
    env,
    executionId,
    execution
  );

  try {
    await acquireExecutionLock(
      env,
      executionId
    );

    lockAcquired =
      true;

    await updateExecution(
      env,
      execution,
      {
        status:
          "running",

        step:
          "loading_auth",
      }
    );

    const threadsAuth =
      await getJson(
        env,
        "threads_auth"
      );

    if (
      !threadsAuth?.access_token
    ) {
      throw new AutoPostEngineError(
        "Threads 연결 정보가 없습니다.",
        {
          code:
            "threads_auth_missing",

          status:
            400,

          step:
            "loading_auth",
        }
      );
    }

    await updateExecution(
      env,
      execution,
      {
        step:
          "building_context",
      }
    );

    const context =
      await buildThreadContext(
        env
      );

    context.publishing.goal =
      AUTO_POST_GOAL;

    context.publishing.requestedTone =
      AUTO_POST_TONE;

    await updateExecution(
      env,
      execution,
      {
        step:
          "generating_content",
      }
    );

    generatedPost =
      await generateThreadPost(
        env,
        context
      );

    await updateExecution(
      env,
      execution,
      {
        step:
          "validating_content",
      }
    );

    const text =
      validateGeneratedPost(
        generatedPost
      );

    await updateExecution(
      env,
      execution,
      {
        step:
          "loading_profile",
      }
    );

    const profile =
      await getThreadsProfile(
        threadsAuth.access_token
      );

    await updateExecution(
      env,
      execution,
      {
        step:
          "publishing",

        username:
          profile.username,
      }
    );

    const publishResult =
      await publishTextPost(
        threadsAuth.access_token,
        profile.id,
        text
      );

    await updateExecution(
      env,
      execution,
      {
        step:
          "logging_success",

        postId:
          publishResult.postId,
      }
    );

    await logPostSuccess(
      env,
      profile.username,
      publishResult.postId,
      text
    );

    await updateExecution(
      env,
      execution,
      {
        status:
          "completed",

        step:
          "completed",

        completedAt:
          new Date().toISOString(),

        postId:
          publishResult.postId,

        username:
          profile.username,

        error:
          null,
      }
    );

    return buildSuccessResult(
      executionId,
      profile,
      publishResult,
      generatedPost,
      context,
      text
    );
  } catch (
    error
  ) {
    const engineError =
      normalizeEngineError(
        error,
        generatedPost
      );

    console.error(
      "Auto post execution failed",
      {
        executionId,

        code:
          engineError.code,

        step:
          engineError.step,

        message:
          engineError.message,

        details:
          engineError.details,
      }
    );

    await safeLogFailure(
      env,
      engineError.step,
      engineError.text,
      engineError.details || {
        message:
          engineError.message,
      }
    );

    await updateExecution(
      env,
      execution,
      {
        status:
          "failed",

        step:
          engineError.step,

        completedAt:
          new Date().toISOString(),

        error: {
          code:
            engineError.code,

          message:
            engineError.message,

          details:
            engineError.details,
        },
      }
    );

    throw engineError;
  } finally {
    if (
      lockAcquired
    ) {
      try {
        await releaseExecutionLock(
          env,
          executionId
        );
      } catch (
        releaseError
      ) {
        console.error(
          "Auto post lock release failed",
          {
            executionId,

            error:
              serializeError(
                releaseError
              ),
          }
        );
      }
    }
  }
}

export async function executeAutoPost(
  env
) {
  if (
    activeExecutionPromise
  ) {
    throw new AutoPostEngineError(
      "자동 게시가 이미 실행 중입니다.",
      {
        code:
          "auto_post_in_progress",

        status:
          409,

        step:
          "lock",
      }
    );
  }

  activeExecutionPromise =
    runExecution(
      env
    );

  try {
    return await activeExecutionPromise;
  } finally {
    activeExecutionPromise =
      null;
  }
}

export async function getAutoPostStatus(
  env
) {
  const [
    activeLock,
    latestExecution,
  ] = await Promise.all([
    getJson(
      env,
      AUTO_POST_LOCK_KEY
    ),

    getJson(
      env,
      AUTO_POST_LATEST_EXECUTION_KEY
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

            error:
              latestExecution.error,
          }
        : null,
  };
}