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

const DEFAULT_SIMILARITY_THRESHOLD =
  0.62;

const DEFAULT_MAX_RECENT_POSTS =
  20;

const DEFAULT_MAX_ATTEMPTS =
  2;

function buildRetryGoal(
  originalGoal,
  similarityError
) {
  const details =
    similarityError
      ?.details ||
    {};

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
  } = {}
) {
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

    if (
      attempt > 1 &&
      lastSimilarityError
    ) {
      attemptContext
        .publishing
        .goal =
        buildRetryGoal(
          originalGoal,
          lastSimilarityError
        );
    }

    const generatedPost =
      await generateThreadPost(
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