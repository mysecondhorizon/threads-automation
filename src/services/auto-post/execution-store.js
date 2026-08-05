import {
  getJson,
  putJson,
} from "../kv.js";

const AUTO_POST_LATEST_EXECUTION_KEY =
  "auto_post:latest_execution";

const AUTO_POST_EXECUTION_PREFIX =
  "auto_post_execution:";

const AUTO_POST_EXECUTION_TTL_SECONDS =
  60 * 60 * 24 * 7;

function getExecutionKey(
  executionId
) {
  return (
    AUTO_POST_EXECUTION_PREFIX +
    executionId
  );
}

export async function saveExecution(
  env,
  executionId,
  execution
) {
  await Promise.all([
    putJson(
      env,
      getExecutionKey(
        executionId
      ),
      execution,
      {
        expirationTtl:
          AUTO_POST_EXECUTION_TTL_SECONDS,
      }
    ),

    putJson(
      env,
      AUTO_POST_LATEST_EXECUTION_KEY,
      execution
    ),
  ]);
}

export async function updateExecution(
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

  return execution;
}

export async function getExecution(
  env,
  executionId
) {
  return getJson(
    env,
    getExecutionKey(
      executionId
    )
  );
}

export async function getLatestExecution(
  env
) {
  return getJson(
    env,
    AUTO_POST_LATEST_EXECUTION_KEY
  );
}