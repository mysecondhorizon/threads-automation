import {
  getJson,
  putJson,
  deleteKey,
} from "../kv.js";

import {
  AutoPostEngineError,
} from "./errors.js";

const AUTO_POST_LOCK_KEY =
  "auto_post:active_execution";

const AUTO_POST_LOCK_TTL_SECONDS =
  120;

export async function acquireExecutionLock(
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

export async function releaseExecutionLock(
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

export async function getExecutionLock(
  env
) {
  return getJson(
    env,
    AUTO_POST_LOCK_KEY
  );
}