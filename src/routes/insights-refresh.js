import { requireAdminApiSession } from "../middleware/auth.js";
import { getJson, putJson } from "../services/kv.js";
import { getPostLogs } from "../services/logger.js";
import {
  getPostInsights,
  ThreadsInsightsError,
} from "../services/insights.js";
import { ok, fail } from "../utils/response.js";

const MAX_POSTS_PER_REFRESH = 20;

export async function handleRefreshInsights(
  request,
  env
) {
  const adminAuth = await requireAdminApiSession(
    request,
    env
  );

  if (!adminAuth.ok) {
    return adminAuth.response;
  }

  const threadsAuth = await getJson(
    env,
    "threads_auth"
  );

  if (!threadsAuth?.access_token) {
    return fail(
      "Threads 연결 정보가 없습니다.",
      400
    );
  }

  const logs = await getPostLogs(env);

  const publishedLogs = logs
    .filter(
      (log) =>
        log?.status === "published" &&
        log?.post_id
    )
    .slice(0, MAX_POSTS_PER_REFRESH);

  if (publishedLogs.length === 0) {
    return ok({
      refreshed: 0,
      failed: 0,
      results: [],
    });
  }

  const results = [];

  for (const log of publishedLogs) {
    try {
      const insights = await getPostInsights(
        threadsAuth.access_token,
        log.post_id
      );

      await putJson(
        env,
        `post_insight:${log.post_id}`,
        {
          ...insights,
          text: log.text || "",
          username: log.username || "",
          publishedAt: log.created_at || null,
        }
      );

      results.push({
        ok: true,
        post_id: log.post_id,
        insights,
      });
    } catch (error) {
      if (error instanceof ThreadsInsightsError) {
        results.push({
          ok: false,
          post_id: log.post_id,
          error: error.message,
          details: error.details,
        });

        continue;
      }

      results.push({
        ok: false,
        post_id: log.post_id,
        error: "Unexpected server error",
      });
    }
  }

  const refreshed = results.filter(
    (result) => result.ok
  ).length;

  const failed = results.length - refreshed;

  return ok({
    requested: publishedLogs.length,
    refreshed,
    failed,
    results,
  });
}
