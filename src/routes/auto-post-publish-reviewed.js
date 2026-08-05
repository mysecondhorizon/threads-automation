import {
  requireAdminApiSession,
} from "../middleware/auth.js";

import {
  publishReviewedAutoPost,
} from "../services/auto-post/reviewed-publisher.js";

import {
  AutoPostEngineError,
} from "../services/auto-post/errors.js";

import {
  ok,
  fail,
} from "../utils/response.js";

async function readJsonBody(
  request
) {
  const contentType =
    request.headers.get(
      "content-type"
    ) || "";

  if (
    !contentType.includes(
      "application/json"
    )
  ) {
    throw new AutoPostEngineError(
      "JSON 요청 본문이 필요합니다.",
      {
        code:
          "invalid_content_type",

        status:
          400,

        step:
          "request_validation",
      }
    );
  }

  try {
    return await request.json();
  } catch {
    throw new AutoPostEngineError(
      "JSON 요청 본문을 읽지 못했습니다.",
      {
        code:
          "invalid_json_body",

        status:
          400,

        step:
          "request_validation",
      }
    );
  }
}

function normalizeRequestBody(
  body
) {
  const text =
    String(
      body?.text || ""
    ).trim();

  const postType =
    String(
      body?.postType || ""
    ).trim();

  const firstComment =
    String(
      body?.firstComment || ""
    ).trim();

  if (!text) {
    throw new AutoPostEngineError(
      "게시할 본문이 없습니다.",
      {
        code:
          "missing_reviewed_text",

        status:
          400,

        step:
          "request_validation",
      }
    );
  }

  return {
    text,
    postType,
    firstComment,
  };
}

export async function handlePublishReviewedAutoPost(
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
    const body =
      await readJsonBody(
        request
      );

    const input =
      normalizeRequestBody(
        body
      );

    const result =
      await publishReviewedAutoPost(
        env,
        input
      );

    return ok(
      result
    );
  } catch (
    error
  ) {
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
      "Unexpected reviewed auto post route error",
      error
    );

    return fail(
      "Unexpected server error",
      500
    );
  }
}