import {
  requireAdminApiSession,
} from "../middleware/auth.js";

import {
  executeAutoPost,
  AutoPostEngineError,
} from "../services/auto-post-engine.js";

import {
  ok,
  fail,
} from "../utils/response.js";

export async function handleAutoPost(
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
      await executeAutoPost(
        env
      );

    return ok(
      result
    );
  } catch (error) {
    if (
      error instanceof
      AutoPostEngineError
    ) {
      return fail(
        error.message,
        error.status,
        {
          code:
            error.code,

          step:
            error.step,

          details:
            error.details,
        }
      );
    }

    console.error(
      "Unexpected auto post route error",
      error
    );

    return fail(
      "Unexpected server error",
      500
    );
  }
}