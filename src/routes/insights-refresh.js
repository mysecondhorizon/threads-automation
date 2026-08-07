import {
  requireAdminApiSession,
} from "../middleware/auth.js";

import {
  syncThreadsData,
} from "../services/threads-sync.js";

import {
  ThreadsApiError,
} from "../services/threads.js";

import {
  ok,
  fail,
} from "../utils/response.js";

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

  try {
    const result =
      await syncThreadsData(
        env
      );

    return ok(
      result
    );
  } catch (
    error
  ) {
    console.error(
      "Threads sync failed",
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

    if (
      error instanceof Error &&
      error.message ===
        "Threads 연결 정보가 없습니다."
    ) {
      return fail(
        error.message,
        400
      );
    }

    return fail(
      "Unexpected server error",
      500
    );
  }
}