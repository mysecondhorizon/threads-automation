import {
  requireAdminApiSession,
} from "../middleware/auth.js";

import {
  getAutoPostStatus,
} from "../services/auto-post-engine.js";

import {
  ok,
  fail,
} from "../utils/response.js";

export async function handleAutoPostStatus(
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
    const status =
      await getAutoPostStatus(
        env
      );

    return ok(
      status
    );
  } catch (error) {
    console.error(
      "Auto post status lookup failed",
      error
    );

    return fail(
      "자동 게시 상태를 불러오지 못했습니다.",
      500
    );
  }
}