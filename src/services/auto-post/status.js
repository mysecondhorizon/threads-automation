import {
  getLatestExecution,
} from "./execution-store.js";

import {
  getExecutionLock,
} from "./lock.js";

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

            textLength:
              latestExecution.textLength,

            error:
              latestExecution.error,
          }
        : null,
  };
}