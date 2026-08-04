import {
  requireAdminApiSession,
} from "../middleware/auth.js";

import {
  buildThreadContext,
} from "../services/thread-context.js";

import {
  ok,
  fail,
} from "../utils/response.js";

export async function handleThreadContext(
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
    const context =
      await buildThreadContext(env);

    return ok({
      context,
    });
  } catch (error) {
    console.error(
      "Thread context generation failed",
      error
    );

    return fail(
      "Thread Context 생성에 실패했습니다.",
      500
    );
  }
}