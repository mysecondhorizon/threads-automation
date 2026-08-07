import {
  requireAdminApiSession,
} from "../middleware/auth.js";

import {
  getScheduleRuns,
  getLatestScheduleRun,
} from "../services/auto-post/schedule-store.js";

import {
  ok,
  fail,
} from "../utils/response.js";

function normalizeLimit(
  value
) {
  const parsed =
    Number(
      value
    );

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return 20;
  }

  return Math.max(
    1,
    Math.min(
      Math.floor(
        parsed
      ),
      50
    )
  );
}

export async function handleScheduleStatus(
  request,
  env,
  url
) {
  const auth =
    await requireAdminApiSession(
      request,
      env
    );

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const limit =
      normalizeLimit(
        url.searchParams.get(
          "limit"
        )
      );

    const [
      latestRun,
      runs,
    ] = await Promise.all([
      getLatestScheduleRun(
        env
      ),

      getScheduleRuns(
        env,
        limit
      ),
    ]);

    return ok({
      latestRun,

      count:
        runs.length,

      runs,
    });
  } catch (
    error
  ) {
    console.error(
      "Schedule status lookup failed",
      error
    );

    return fail(
      "예약 게시 실행 이력을 불러오지 못했습니다.",
      500
    );
  }
}