import { requireAdminApiSession } from "../middleware/auth.js";
import { getJson, putJson } from "../services/kv.js";
import {
  getPostInsights,
  ThreadsInsightsError,
} from "../services/insights.js";
import { ok, fail } from "../utils/response.js";

export async function handlePostInsights(
  request,
  env,
  url
) {
  const adminAuth = await requireAdminApiSession(
    request,
    env
  );

  if (!adminAuth.ok) {
    return adminAuth.response;
  }

  const postId = String(
    url.searchParams.get("post_id") || ""
  ).trim();

  if (!postId) {
    return fail("post_id가 필요합니다.", 400);
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

  try {
    const insights = await getPostInsights(
      threadsAuth.access_token,
      postId
    );

    await putJson(
      env,
      `post_insight:${postId}`,
      insights
    );

    return ok({
      insights,
    });
  } catch (error) {
    if (error instanceof ThreadsInsightsError) {
      console.error("Threads insights failed", {
        message: error.message,
        details: error.details,
      });

      return fail(
        "게시물 인사이트 조회에 실패했습니다.",
        400,
        {
          details: error.details,
        }
      );
    }

    return fail(
      "Unexpected server error",
      500
    );
  }
}
