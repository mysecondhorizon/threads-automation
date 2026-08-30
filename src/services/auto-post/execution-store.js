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

export async function listRecentExecutions(
  env,
  { limit = 12 } = {}
) {
  const maximum = Math.min(
    Math.max(
      Number.isSafeInteger(limit)
        ? limit
        : 12,
      1
    ),
    24
  );

  const listed =
    await env.THREADS_KV.list({
      prefix:
        AUTO_POST_EXECUTION_PREFIX,
    });

  const keys = Array.isArray(listed?.keys)
    ? listed.keys
      .map((item) => String(item?.name || ""))
      .filter((key) => key.startsWith(AUTO_POST_EXECUTION_PREFIX))
      .slice(0, 64)
    : [];

  const executions = await Promise.all(
    keys.map((key) =>
      getJson(env, key)
    )
  );

  return executions
    .filter((execution) => execution && typeof execution === "object")
    .sort((left, right) =>
      String(right.startedAt || "").localeCompare(
        String(left.startedAt || "")
      )
    )
    .slice(0, maximum);
}
