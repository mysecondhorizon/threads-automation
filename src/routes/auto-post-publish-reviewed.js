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
  ProductReviewError,
  getProductReviewCandidate,
  prepareProductReviewPublishInput,
  assertManualProductPublishAvailable,
  markProductReviewPublished,
} from "../services/product-review.js";

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

  const candidateId =
    String(
      body?.candidateId || ""
    ).trim() || null;

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

  const contentType =
    String(
      body?.contentType || ""
    ).trim();

  const topic =
    String(
      body?.topic || ""
    ).trim();

  const emotion =
    String(
      body?.emotion || ""
    ).trim();

  const hookStyle =
    String(
      body?.hookStyle || ""
    ).trim();

  const endingStyle =
    String(
      body?.endingStyle || ""
    ).trim();

  const productId =
    body?.productId === null
      ? null
      : String(
          body?.productId || ""
        ).trim() ||
        null;

  const questionUsed =
    Boolean(
      body?.questionUsed
    );

  const productConnected =
    Boolean(
      body?.productConnected
    );

  const affiliateLinkUsed =
    Boolean(
      body?.affiliateLinkUsed
    );

  const affiliateDisclosureRequired =
    Boolean(
      body
        ?.affiliateDisclosureRequired
    );

  return {
    text,

    postType,

    contentType,

    topic,

    emotion,

    hookStyle,

    endingStyle,

    questionUsed,

    productId,

    productConnected,

    affiliateLinkUsed,

    affiliateDisclosureRequired,

    firstComment,

    candidateId,
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

    let input =
      normalizeRequestBody(
        body
      );

    let productReviewCandidate =
      null;

    if (input.candidateId) {
      productReviewCandidate =
        await getProductReviewCandidate(
          env,
          input.candidateId
        );

      await assertManualProductPublishAvailable(
        env
      );

      input =
        prepareProductReviewPublishInput(
          productReviewCandidate,
          input
        );
    }

    const result =
      await publishReviewedAutoPost(
        env,
        input
      );

    if (productReviewCandidate) {
      await markProductReviewPublished(
        env,
        productReviewCandidate.id,
        result.post_id,
        result.firstComment
      );
    }

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

    if (
      error instanceof
      ProductReviewError
    ) {
      return fail(
        error.message,
        error.code === "manual_product_daily_limit_reached" ? 409 : 400,
        {
          code: error.code,
          details: error.details,
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
