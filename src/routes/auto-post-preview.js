import {
  requireAdminApiSession,
} from "../middleware/auth.js";

import {
  buildThreadContext,
} from "../services/thread-context.js";

import {
  AiServiceError,
} from "../services/ai.js";

import {
  validateAutoPostText,
  validateAutoPostPolicy,
  AutoPostValidationError,
} from "../services/auto-post-validator.js";

import {
  PostSimilarityError,
} from "../services/post-similarity.js";

import {
  generateDistinctThreadPost,
} from "../services/post-regenerator.js";

import {
  ok,
  fail,
} from "../utils/response.js";

const DEFAULT_GOAL =
  "현재 시간과 최근 게시 성과를 반영한 Threads 게시글 1개를 작성한다.";

const DEFAULT_TONE =
  "40대 직장인의 현실적인 말투";

const SIMILARITY_THRESHOLD =
  0.62;

const MAX_SIMILARITY_POSTS =
  20;

const MAX_GENERATION_ATTEMPTS =
  2;

async function readRequestOptions(
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
    return {
      goal:
        DEFAULT_GOAL,

      tone:
        DEFAULT_TONE,
    };
  }

  let body;

  try {
    body =
      await request.json();
  } catch {
    return {
      goal:
        DEFAULT_GOAL,

      tone:
        DEFAULT_TONE,
    };
  }

  const goal =
    String(
      body?.goal || ""
    ).trim();

  const tone =
    String(
      body?.tone || ""
    ).trim();

  return {
    goal:
      goal ||
      DEFAULT_GOAL,

    tone:
      tone ||
      DEFAULT_TONE,
  };
}

function normalizeFirstComment(
  value
) {
  const text =
    String(
      value || ""
    ).trim();

  return {
    requested:
      Boolean(text),

    text,
  };
}

function buildSimilaritySummary(
  similarity
) {
  return {
    checkedPostCount:
      similarity.checkedPostCount,

    threshold:
      similarity.threshold,

    duplicated:
      similarity.duplicated,

    highestScore:
      Number(
        similarity.highestScore
          .toFixed(4)
      ),

    highestMatch:
      similarity.highestMatch
        ? {
            postId:
              similarity
                .highestMatch
                .postId,

            createdAt:
              similarity
                .highestMatch
                .createdAt,

            score:
              Number(
                similarity
                  .highestMatch
                  .score
                  .toFixed(4)
              ),

            text:
              similarity
                .highestMatch
                .text,
          }
        : null,
  };
}

export async function handleAutoPostPreview(
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
    const options =
      await readRequestOptions(
        request
      );

    const context =
      await buildThreadContext(
        env
      );

    context.publishing.goal =
      options.goal;

    context.publishing.requestedTone =
      options.tone;

    const generation =
      await generateDistinctThreadPost(
        env,
        context,
        {
          threshold:
            SIMILARITY_THRESHOLD,

          maxRecentPosts:
            MAX_SIMILARITY_POSTS,

          maxAttempts:
            MAX_GENERATION_ATTEMPTS,
        }
      );

    const {
      generatedPost,
      validation,
      similarity,
      attempts,
      regenerated,
    } = generation;

    const policyValidation =
      validateAutoPostPolicy(
        generatedPost,
        context
      );

    const firstComment =
      normalizeFirstComment(
        generatedPost
          ?.firstComment
      );

    return ok({
      preview:
        true,

      published:
        false,

      text:
        validation.text,

      postType:
        generatedPost
          .postType,

      contentType:
        generatedPost
          .contentType,

      topic:
        generatedPost
          .topic,

      emotion:
        generatedPost
          .emotion,

      hookStyle:
        generatedPost
          .hookStyle,

      endingStyle:
        generatedPost
          .endingStyle,

      questionUsed:
        generatedPost
          .questionUsed,

      productId:
        generatedPost
          .productId,

      productConnected:
        generatedPost
          .productConnected,

      affiliateLinkUsed:
        generatedPost
          .affiliateLinkUsed,

      affiliateDisclosureRequired:
        generatedPost
          .affiliateDisclosureRequired,

      firstComment,

      validation: {
        length:
          validation.length,

        maxLength:
          validation.maxLength,
      },

      policyValidation,

      similarity:
        buildSimilaritySummary(
          similarity
        ),

      generation: {
        attempts,

        regenerated,

        formatSignature:
          generation.format
            ?.signature ||
          null,

        targetFormatId:
          generation.targetFormat
            ?.id ||
          null,
      },

      metadata:
        generatedPost
          .metadata,

      request: {
        goal:
          options.goal,

        tone:
          options.tone,
      },

      context: {
        version:
          context.meta
            .version,

        generatedAt:
          context.meta
            .generatedAt,

        publishSequence:
          context.publishing
            .publishSequence,

        recentPostCount:
          context.history
            .recentPostCount,

        performanceLevel:
          context.analytics
            .performanceLevel,
      },
    });
  } catch (error) {
    if (
      error instanceof
      PostSimilarityError
    ) {
      console.error(
        "Auto post preview similarity validation failed",
        {
          code:
            error.code,

          message:
            error.message,

          details:
            error.details,
        }
      );

      return fail(
        error.message,
        409,
        {
          code:
            error.code,

          step:
            "similarity_validation",

          details:
            error.details,
        }
      );
    }

    if (
      error instanceof
      AutoPostValidationError
    ) {
      console.error(
        "Auto post preview validation failed",
        {
          code:
            error.code,

          message:
            error.message,

          details:
            error.details,
        }
      );

      return fail(
        error.message,
        502,
        {
          code:
            error.code,

          step:
            "validation",

          details:
            error.details,
        }
      );
    }

    if (
      error instanceof
      AiServiceError
    ) {
      console.error(
        "Auto post preview AI generation failed",
        {
          message:
            error.message,

          details:
            error.details,
        }
      );

      return fail(
        "자동 게시 미리보기 생성에 실패했습니다.",
        502,
        {
          code:
            "ai_generation_failed",

          step:
            "ai_generation",

          reason:
            error.message,

          details:
            error.details,
        }
      );
    }

    console.error(
      "Unexpected auto post preview error",
      error
    );

    return fail(
      "Unexpected server error",
      500
    );
  }
}
