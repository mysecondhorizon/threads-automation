import {
  generateThreadPost,
} from "./ai.js";

import {
  validateAutoPostText,
} from "./auto-post-validator.js";

import {
  validatePostSimilarity,
  PostSimilarityError,
} from "./post-similarity.js";

import {
  selectTargetPostFormat,
  validatePostFormat,
  getContextFormatDisclosures,
} from "./post-format.js";

const DEFAULT_SIMILARITY_THRESHOLD =
  0.62;

const DEFAULT_MAX_RECENT_POSTS =
  20;

const DEFAULT_MAX_ATTEMPTS =
  2;

function buildRetryGoal(
  originalGoal,
  generationError,
  targetFormat
) {
  const details =
    generationError
      ?.details ||
    {};

  if (
    generationError?.code ===
      "post_format_validation_failed"
  ) {
    return [
      originalGoal,
      "",
      "중요 추가 지시:",
      "방금 생성한 초안은 최근 글과 문장·문단 구조가 겹치거나 목표 포맷에서 벗어났다.",
      `실패한 포맷: ${details.signature || "확인 불가"}`,
      `반드시 적용할 포맷: ${targetFormat?.prompt || details.targetPrompt || "publishing.targetFormat을 따른다."}`,
      "첫 문장 단독 문단과 마지막 한 줄 결론을 습관적으로 만들지 않는다.",
      "본문에 포맷 설명이나 signature를 출력하지 않는다.",
    ].join("\n");
  }

  const matchedText =
    String(
      details.matchedText ||
      ""
    ).trim();

  const highestScore =
    Number(
      details.highestScore ||
      0
    );

  const lines = [
    originalGoal,
    "",
    "중요 추가 지시:",
    "방금 생성한 초안은 최근 게시글과 너무 유사해 사용할 수 없었다.",
    "이번에는 소재, 도입부, 문장 구조, 결론을 명확히 다르게 작성한다.",
    "최근 글의 핵심 표현을 재사용하지 않는다.",
    `이전 유사도 점수: ${highestScore.toFixed(4)}`,
  ];

  if (matchedText) {
    lines.push(
      "",
      "특히 아래 최근 게시글과 겹치지 않게 작성한다.",
      "[유사 게시글]",
      matchedText,
      "[/유사 게시글]"
    );
  }

  return lines.join(
    "\n"
  );
}

function cloneContext(
  context
) {
  return {
    ...context,

    publishing: {
      ...context.publishing,
    },
  };
}

export async function generateDistinctThreadPost(
  env,
  context,
  {
    threshold =
      DEFAULT_SIMILARITY_THRESHOLD,

    maxRecentPosts =
      DEFAULT_MAX_RECENT_POSTS,

    maxAttempts =
      DEFAULT_MAX_ATTEMPTS,

    reselectTargetOnRecentPatternConflict =
      false,

    excludeInfeasibleTargets =
      false,

    generatePost =
      generateThreadPost,
  } = {}
) {
  const recentFormats =
    Array.isArray(
      context?.history
        ?.recentFormats
    ) &&
    context.history
      .recentFormats
      .length
      ? context.history
          .recentFormats
      : context?.history
          ?.recentFormatSignatures ||
        [];

  if (
    !context.publishing
      .targetFormat
  ) {
    const initialTargetFormat =
      selectTargetPostFormat(
        recentFormats,
        {
          sequence:
            context.publishing
              .publishSequence ||
            1,

          excludeInfeasibleTargets,
        }
      );

    if (!initialTargetFormat) {
      throw new PostSimilarityError(
        "No feasible post format target is available",
        {
          code:
            "post_format_validation_failed",

          details: {
            reasons: [
              "no_feasible_target_format",
            ],

            signature:
              null,

            targetFormatId:
              null,

            targetPrompt:
              null,

            matchedSignature:
              null,

            attempts:
              0,

            regenerated:
              false,
          },
        }
      );
    }

    context.publishing
      .targetFormat =
      initialTargetFormat;
  }

  let targetFormat =
    context.publishing
      .targetFormat;

  const failedTargetFormatIds =
    new Set();

  const disclosures =
    getContextFormatDisclosures(
      context
    );

  const originalGoal =
    String(
      context?.publishing
        ?.goal ||
      "Threads 게시글 작성"
    ).trim();

  let lastSimilarityError =
    null;

  let lastGeneratedPost =
    null;

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt += 1
  ) {
    const attemptContext =
      cloneContext(
        context
      );

    attemptContext
      .publishing
      .targetFormat =
      targetFormat;

    if (
      attempt > 1 &&
      lastSimilarityError
    ) {
      attemptContext
        .publishing
        .goal =
        buildRetryGoal(
          originalGoal,
          lastSimilarityError,
          targetFormat
        );
    }

    const generatedPost =
      await generatePost(
        env,
        attemptContext
      );

    lastGeneratedPost =
      generatedPost;

    const validation =
      validateAutoPostText(
        generatedPost?.body
      );

    try {
      const format =
        validatePostFormat(
          validation.text,
          {
            targetFormat,
            recentFormats,
            disclosures,
          }
        );

      const similarity =
        validatePostSimilarity(
          validation.text,
          context.history
            .recentSevenDayPosts,
          {
            threshold,

            maxRecentPosts,
          }
        );

      return {
        generatedPost,

        validation,

        similarity,

        format,

        targetFormat,

        attempts:
          attempt,

        regenerated:
          attempt > 1,
      };
    } catch (
      error
    ) {
      if (
        !(
          error instanceof
          PostSimilarityError
        )
      ) {
        throw error;
      }

      lastSimilarityError =
        error;

      const reasons =
        Array.isArray(
          error?.details?.reasons
        )
          ? error.details.reasons
          : [];

      if (
        reselectTargetOnRecentPatternConflict &&
        error?.code ===
          "post_format_validation_failed" &&
        reasons.includes(
          "recent_pattern_too_similar"
        ) &&
        targetFormat?.id
      ) {
        failedTargetFormatIds.add(
          targetFormat.id
        );

        const nextTargetFormat =
          selectTargetPostFormat(
            recentFormats,
            {
              sequence:
                context.publishing
                  .publishSequence ||
                1,
              excludedFormatIds: [
                ...failedTargetFormatIds,
              ],

              excludeInfeasibleTargets,
            }
          );

        if (nextTargetFormat) {
          targetFormat =
            nextTargetFormat;
        } else {
          error.details = {
            ...error.details,

            attempts:
              attempt,

            regenerated:
              attempt > 1,
          };

          throw error;
        }
      }

      if (
        attempt >=
        maxAttempts
      ) {
        error.details = {
          ...error.details,

          attempts:
            attempt,

          regenerated:
            attempt > 1,
        };

        throw error;
      }
    }
  }

  throw new PostSimilarityError(
    "최근 게시글과 충분히 다른 글을 생성하지 못했습니다.",
    {
      code:
        "distinct_post_generation_failed",

      details: {
        attempts:
          maxAttempts,

        generatedText:
          String(
            lastGeneratedPost
              ?.body ||
            ""
          ),
      },
    }
  );
}
