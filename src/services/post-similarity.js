const DEFAULT_SIMILARITY_THRESHOLD =
  0.62;

const DEFAULT_MAX_RECENT_POSTS =
  20;

const MIN_TOKEN_LENGTH =
  2;

const STOP_WORDS =
  new Set([
    "그리고",
    "그래서",
    "그런데",
    "하지만",
    "그러면",
    "이렇게",
    "저렇게",
    "그렇게",
    "이것",
    "저것",
    "그것",
    "있는",
    "없는",
    "하는",
    "했다",
    "한다",
    "된다",
    "되었다",
    "같다",
    "조금",
    "정말",
    "너무",
    "그냥",
    "요즘",
    "오늘",
    "어제",
    "내일",
    "때문",
    "대한",
    "위한",
    "에서",
    "으로",
    "에게",
    "보다",
    "까지",
    "부터",
    "처럼",
    "만큼",
    "있다",
    "없다",
  ]);

export class PostSimilarityError extends Error {
  constructor(
    message,
    {
      code = "post_similarity_error",
      details = null,
    } = {}
  ) {
    super(message);

    this.name =
      "PostSimilarityError";

    this.code =
      code;

    this.details =
      details;
  }
}

function normalizeText(
  value
) {
  return String(
    value || ""
  )
    .normalize("NFKC")
    .toLowerCase()
    .replace(
      /https?:\/\/\S+/g,
      " "
    )
    .replace(
      /[^\p{L}\p{N}\s]/gu,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function tokenizeText(
  value
) {
  const normalized =
    normalizeText(
      value
    );

  if (!normalized) {
    return [];
  }

  return normalized
    .split(" ")
    .map(
      (token) =>
        token.trim()
    )
    .filter(
      (token) =>
        token.length >=
          MIN_TOKEN_LENGTH &&
        !STOP_WORDS.has(
          token
        )
    );
}

function createTokenSet(
  value
) {
  return new Set(
    tokenizeText(
      value
    )
  );
}

function calculateJaccardSimilarity(
  firstSet,
  secondSet
) {
  if (
    firstSet.size === 0 ||
    secondSet.size === 0
  ) {
    return 0;
  }

  let intersectionCount =
    0;

  for (
    const token of firstSet
  ) {
    if (
      secondSet.has(
        token
      )
    ) {
      intersectionCount += 1;
    }
  }

  const unionCount =
    firstSet.size +
    secondSet.size -
    intersectionCount;

  if (
    unionCount <= 0
  ) {
    return 0;
  }

  return (
    intersectionCount /
    unionCount
  );
}

function calculateContainmentSimilarity(
  firstSet,
  secondSet
) {
  if (
    firstSet.size === 0 ||
    secondSet.size === 0
  ) {
    return 0;
  }

  let intersectionCount =
    0;

  for (
    const token of firstSet
  ) {
    if (
      secondSet.has(
        token
      )
    ) {
      intersectionCount += 1;
    }
  }

  const smallerSetSize =
    Math.min(
      firstSet.size,
      secondSet.size
    );

  if (
    smallerSetSize <= 0
  ) {
    return 0;
  }

  return (
    intersectionCount /
    smallerSetSize
  );
}

function calculateCombinedSimilarity(
  firstText,
  secondText
) {
  const firstSet =
    createTokenSet(
      firstText
    );

  const secondSet =
    createTokenSet(
      secondText
    );

  const jaccard =
    calculateJaccardSimilarity(
      firstSet,
      secondSet
    );

  const containment =
    calculateContainmentSimilarity(
      firstSet,
      secondSet
    );

  const score =
    (
      jaccard * 0.65
    ) +
    (
      containment * 0.35
    );

  return {
    score,

    jaccard,

    containment,

    firstTokenCount:
      firstSet.size,

    secondTokenCount:
      secondSet.size,
  };
}

function normalizeRecentPosts(
  recentPosts,
  maxRecentPosts
) {
  if (
    !Array.isArray(
      recentPosts
    )
  ) {
    return [];
  }

  return recentPosts
    .filter(
      (post) =>
        String(
          post?.text || ""
        ).trim()
    )
    .slice(
      0,
      maxRecentPosts
    );
}

export function analyzePostSimilarity(
  text,
  recentPosts,
  {
    threshold =
      DEFAULT_SIMILARITY_THRESHOLD,

    maxRecentPosts =
      DEFAULT_MAX_RECENT_POSTS,
  } = {}
) {
  const normalizedText =
    normalizeText(
      text
    );

  if (!normalizedText) {
    throw new PostSimilarityError(
      "유사도를 검사할 본문이 비어 있습니다.",
      {
        code:
          "empty_similarity_text",
      }
    );
  }

  const posts =
    normalizeRecentPosts(
      recentPosts,
      maxRecentPosts
    );

  const comparisons =
    posts.map(
      (post) => {
        const similarity =
          calculateCombinedSimilarity(
            normalizedText,
            post.text
          );

        return {
          postId:
            post.postId ||
            null,

          createdAt:
            post.createdAt ||
            null,

          text:
            String(
              post.text || ""
            ),

          score:
            similarity.score,

          jaccard:
            similarity.jaccard,

          containment:
            similarity.containment,

          generatedTokenCount:
            similarity.firstTokenCount,

          recentPostTokenCount:
            similarity.secondTokenCount,
        };
      }
    );

  comparisons.sort(
    (
      first,
      second
    ) =>
      second.score -
      first.score
  );

  const highestMatch =
    comparisons[0] ||
    null;

  return {
    checkedPostCount:
      comparisons.length,

    threshold,

    duplicated:
      Boolean(
        highestMatch &&
        highestMatch.score >=
          threshold
      ),

    highestScore:
      highestMatch
        ?.score ||
      0,

    highestMatch,

    comparisons,
  };
}

export function validatePostSimilarity(
  text,
  recentPosts,
  options = {}
) {
  const result =
    analyzePostSimilarity(
      text,
      recentPosts,
      options
    );

  if (
    result.duplicated
  ) {
    throw new PostSimilarityError(
      "최근 게시글과 너무 유사한 본문이 생성되었습니다.",
      {
        code:
          "recent_post_too_similar",

        details: {
          threshold:
            result.threshold,

          highestScore:
            result.highestScore,

          matchedPostId:
            result.highestMatch
              ?.postId ||
            null,

          matchedCreatedAt:
            result.highestMatch
              ?.createdAt ||
            null,

          matchedText:
            result.highestMatch
              ?.text ||
            "",
        },
      }
    );
  }

  return result;
}