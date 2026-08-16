import {
  getJson,
  putJson,
} from "../kv.js";

const SCHEDULE_HISTORY_KEY =
  "auto_post_schedule_history";

const MAX_HISTORY_ITEMS =
  50;

function normalizeArray(
  value
) {
  return Array.isArray(
    value
  )
    ? value
    : [];
}

function createScheduleRunId() {
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

function normalizeSync(
  sync
) {
  if (!sync) {
    return null;
  }

  return {
    deleted:
      Number(
        sync.deleted || 0
      ),

    updated:
      Number(
        sync.updated || 0
      ),

    unchanged:
      Number(
        sync.unchanged || 0
      ),

    refreshed:
      Number(
        sync.refreshed || 0
      ),

    failed:
      Number(
        sync.failed || 0
      ),
  };
}

async function readStore(
  env
) {
  const stored =
    await getJson(
      env,
      SCHEDULE_HISTORY_KEY
    );

  return {
    version:
      Number(
        stored?.version ||
        1
      ),

    updatedAt:
      stored?.updatedAt ||
      null,

    runs:
      normalizeArray(
        stored?.runs
      ),
  };
}

async function writeStore(
  env,
  runs
) {
  const value = {
    version:
      2,

    updatedAt:
      new Date().toISOString(),

    runs:
      runs.slice(
        0,
        MAX_HISTORY_ITEMS
      ),
  };

  await putJson(
    env,
    SCHEDULE_HISTORY_KEY,
    value
  );

  return value;
}

export async function saveScheduleRun(
  env,
  input
) {
  const store =
    await readStore(
      env
    );

  const now =
    new Date().toISOString();

  const run = {
    id:
      input?.id ||
      createScheduleRunId(),

    source:
      "cron",

    operation:
      input?.operation ||
      "auto_general",

    cron:
      input?.cron ||
      null,

    scheduledTime:
      input?.scheduledTime ||
      null,

    startedAt:
      input?.startedAt ||
      now,

    completedAt:
      input?.completedAt ||
      now,

    status:
      input?.status ||
      "unknown",

    skipped:
      Boolean(
        input?.skipped
      ),

    skipReason:
      input?.skipReason ||
      null,

    executionId:
      input?.executionId ||
      null,

    postId:
      input?.postId ||
      null,

    candidateId:
      input?.candidateId ||
      null,

    published:
      input?.published === undefined
        ? Boolean(input?.postId)
        : Boolean(input.published),

    generation:
      input?.generation ||
      null,

    similarity:
      input?.similarity ||
      null,

    sync:
      normalizeSync(
        input?.sync
      ),

    error:
      input?.error ||
      null,
  };

  await writeStore(
    env,
    [
      run,
      ...store.runs,
    ]
  );

  return run;
}

export async function getScheduleRuns(
  env,
  limit = 20
) {
  const store =
    await readStore(
      env
    );

  const safeLimit =
    Math.max(
      1,
      Math.min(
        Number(
          limit ||
          20
        ),
        MAX_HISTORY_ITEMS
      )
    );

  return store.runs.slice(
    0,
    safeLimit
  );
}

export async function getLatestScheduleRun(
  env
) {
  const runs =
    await getScheduleRuns(
      env,
      1
    );

  return runs[0] ||
    null;
}
