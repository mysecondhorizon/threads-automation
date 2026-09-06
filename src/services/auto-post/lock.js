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

function lockKey(workspaceId = null) {
  return typeof workspaceId === "string" && workspaceId.trim()
    ? `${AUTO_POST_LOCK_KEY}:${workspaceId.trim()}`
    : AUTO_POST_LOCK_KEY;
}

export async function acquireExecutionLock(
  env,
  executionId,
  workspaceId = null
) {
  const currentLock =
    await getJson(
      env,
      lockKey(workspaceId)
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
      lockKey(workspaceId),
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
  executionId,
  workspaceId = null
) {
  const currentLock =
    await getJson(
      env,
      lockKey(workspaceId)
    );

  if (
    currentLock?.executionId ===
    executionId
  ) {
    await deleteKey(
      env,
      lockKey(workspaceId)
    );
  }
}

export async function getExecutionLock(
  env,
  workspaceId = null
) {
  return getJson(
    env,
    lockKey(workspaceId)
  );
}
