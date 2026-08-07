import {
  getJson,
  putJson,
} from "./kv.js";

import {
  getPostLogEntries,
  markPostLogDeleted,
  syncPostLogFromThreads,
} from "./logger.js";

import {
  getUserThreads,
  ThreadsApiError,
} from "./threads.js";

import {
  getPostInsights,
  ThreadsInsightsError,
} from "./insights.js";

const MAX_POSTS_PER_REFRESH =
  20;

const THREADS_FETCH_LIMIT =
  100;

function isPublishedLog(
  log
) {
  return (
    log &&
    log.status === "published" &&
    log.post_id
  );
}

function createThreadMap(
  threads
) {
  const map =
    new Map();

  for (
    const thread of
    threads
  ) {
    if (!thread?.id) {
      continue;
    }

    map.set(
      String(
        thread.id
      ),
      thread
    );
  }

  return map;
}

function normalizeText(
  value
) {
  return String(
    value || ""
  ).trim();
}

function hasTextChanged(
  log,
  thread
) {
  return (
    normalizeText(
      log?.text
    ) !==
    normalizeText(
      thread?.text
    )
  );
}

export async function syncThreadsData(
  env
) {
  const threadsAuth =
    await getJson(
      env,
      "threads_auth"
    );

  if (
    !threadsAuth?.access_token
  ) {
    throw new Error(
      "Threads 연결 정보가 없습니다."
    );
  }

  let currentThreads;

  try {
    const response =
      await getUserThreads(
        threadsAuth.access_token,
        {
          limit:
            THREADS_FETCH_LIMIT,
        }
      );

    currentThreads =
      response.data;
  } catch (
    error
  ) {
    if (
      error instanceof
      ThreadsApiError
    ) {
      throw error;
    }

    throw error;
  }

  const threadMap =
    createThreadMap(
      currentThreads
    );

  const logEntries =
    await getPostLogEntries(
      env
    );

  const publishedEntries =
    logEntries.filter(
      (
        entry
      ) =>
        isPublishedLog(
          entry.log
        )
    );

  let deletedCount =
    0;

  let updatedCount =
    0;

  let unchangedCount =
    0;

  const syncResults =
    [];

  for (
    const entry of
    publishedEntries
  ) {
    const log =
      entry.log;

    const postId =
      String(
        log.post_id
      );

    const currentThread =
      threadMap.get(
        postId
      );

    if (!currentThread) {
      await markPostLogDeleted(
        env,
        entry.key
      );

      deletedCount +=
        1;

      syncResults.push({
        post_id:
          postId,

        status:
          "deleted",
      });

      continue;
    }

    const textChanged =
      hasTextChanged(
        log,
        currentThread
      );

    await syncPostLogFromThreads(
      env,
      entry.key,
      currentThread
    );

    if (
      textChanged
    ) {
      updatedCount +=
        1;

      syncResults.push({
        post_id:
          postId,

        status:
          "updated",
      });
    } else {
      unchangedCount +=
        1;

      syncResults.push({
        post_id:
          postId,

        status:
          "unchanged",
      });
    }
  }

  const activeEntries =
    publishedEntries
      .filter(
        (
          entry
        ) =>
          threadMap.has(
            String(
              entry.log.post_id
            )
          )
      )
      .slice(
        0,
        MAX_POSTS_PER_REFRESH
      );

  const insightResults =
    [];

  for (
    const entry of
    activeEntries
  ) {
    const postId =
      String(
        entry.log.post_id
      );

    const currentThread =
      threadMap.get(
        postId
      );

    try {
      const insights =
        await getPostInsights(
          threadsAuth.access_token,
          postId
        );

      await putJson(
        env,
        `post_insight:${postId}`,
        {
          ...insights,

          text:
            currentThread
              ?.text ||
            entry.log.text ||
            "",

          username:
            currentThread
              ?.username ||
            entry.log.username ||
            "",

          publishedAt:
            currentThread
              ?.timestamp ||
            entry.log
              .created_at ||
            null,

          permalink:
            currentThread
              ?.permalink ||
            null,

          syncedAt:
            new Date()
              .toISOString(),
        }
      );

      insightResults.push({
        ok:
          true,

        post_id:
          postId,

        insights,
      });
    } catch (
      error
    ) {
      if (
        error instanceof
        ThreadsInsightsError
      ) {
        insightResults.push({
          ok:
            false,

          post_id:
            postId,

          error:
            error.message,

          details:
            error.details,
        });

        continue;
      }

      insightResults.push({
        ok:
          false,

        post_id:
          postId,

        error:
          "Unexpected server error",
      });
    }
  }

  const refreshed =
    insightResults.filter(
      (
        result
      ) =>
        result.ok
    ).length;

  const failed =
    insightResults.length -
    refreshed;

  return {
    threadsFetched:
      currentThreads.length,

    localPublishedLogs:
      publishedEntries.length,

    sync: {
      deleted:
        deletedCount,

      updated:
        updatedCount,

      unchanged:
        unchangedCount,

      results:
        syncResults,
    },

    insights: {
      requested:
        activeEntries.length,

      refreshed,

      failed,

      results:
        insightResults,
    },
  };
}