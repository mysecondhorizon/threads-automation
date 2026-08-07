import {
  requireAdminApiSession,
} from "../middleware/auth.js";

import {
  getJson,
  putJson,
} from "../services/kv.js";

import {
  getPostLogEntries,
  markPostLogDeleted,
  syncPostLogFromThreads,
} from "../services/logger.js";

import {
  getUserThreads,
  ThreadsApiError,
} from "../services/threads.js";

import {
  getPostInsights,
  ThreadsInsightsError,
} from "../services/insights.js";

import {
  ok,
  fail,
} from "../utils/response.js";

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

export async function handleRefreshInsights(
  request,
  env
) {
  const adminAuth =
    await requireAdminApiSession(
      request,
      env
    );

  if (!adminAuth.ok) {
    return adminAuth.response;
  }

  const threadsAuth =
    await getJson(
      env,
      "threads_auth"
    );

  if (
    !threadsAuth?.access_token
  ) {
    return fail(
      "Threads 연결 정보가 없습니다.",
      400
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
    console.error(
      "Threads list sync failed",
      error
    );

    if (
      error instanceof
      ThreadsApiError
    ) {
      return fail(
        "현재 Threads 게시물 목록을 불러오지 못했습니다.",
        502,
        {
          step:
            error.step,

          details:
            error.details,
        }
      );
    }

    return fail(
      "Unexpected server error",
      500
    );
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

        oldText:
          normalizeText(
            log.text
          ),

        newText:
          normalizeText(
            currentThread.text
          ),
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

  return ok({
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
  });
}