import {
  getPostingHistory,
} from "./history.js";

import {
  buildRecentPerformance,
  buildAnalyticsSummary,
  buildRecommendations,
  buildAnalyticsObservations,
} from "./analytics.js";

import {
  getActiveProducts,
  buildProductContext,
} from "./products.js";

const SEOUL_TIME_ZONE =
  "Asia/Seoul";

function getSeoulMonth(
  date
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          SEOUL_TIME_ZONE,

        month:
          "numeric",
      }
    ).formatToParts(
      date
    );

  const monthPart =
    parts.find(
      (part) =>
        part.type ===
        "month"
    );

  return Number(
    monthPart?.value ||
    0
  );
}

function getSeason(
  date
) {
  const month =
    getSeoulMonth(
      date
    );

  if (
    month >= 3 &&
    month <= 5
  ) {
    return "봄";
  }

  if (
    month >= 6 &&
    month <= 8
  ) {
    return "여름";
  }

  if (
    month >= 9 &&
    month <= 11
  ) {
    return "가을";
  }

  return "겨울";
}

function formatDate(
  date
) {
  return date.toLocaleDateString(
    "ko-KR",
    {
      timeZone:
        SEOUL_TIME_ZONE,

      year:
        "numeric",

      month:
        "2-digit",

      day:
        "2-digit",
    }
  );
}

function formatTime(
  date
) {
  return date.toLocaleTimeString(
    "ko-KR",
    {
      timeZone:
        SEOUL_TIME_ZONE,

      hour:
        "2-digit",

      minute:
        "2-digit",

      hour12:
        false,
    }
  );
}

function getWeekday(
  date
) {
  return date.toLocaleDateString(
    "ko-KR",
    {
      timeZone:
        SEOUL_TIME_ZONE,

      weekday:
        "long",
    }
  );
}

function buildRecentProducts(
  recentPosts,
  products
) {
  const normalizedPosts =
    Array.isArray(
      recentPosts
    )
      ? recentPosts
      : [];

  const normalizedProducts =
    Array.isArray(
      products
    )
      ? products
      : [];

  const recentProductIds =
    new Set();

  for (
    const post of
    normalizedPosts
  ) {
    const text =
      String(
        post?.text || ""
      ).toLowerCase();

    if (!text) {
      continue;
    }

    for (
      const product of
      normalizedProducts
    ) {
      const productName =
        String(
          product?.name ||
          ""
        ).trim();

      if (
        productName &&
        text.includes(
          productName
            .toLowerCase()
        )
      ) {
        recentProductIds.add(
          product.id
        );
      }
    }
  }

  return normalizedProducts
    .filter(
      (product) =>
        recentProductIds.has(
          product.id
        )
    )
    .map(
      (product) => ({
        id:
          product.id,

        name:
          product.name,

        category:
          product.category,

        updatedAt:
          product.updatedAt,
      })
    );
}

function uniqueValues(
  posts,
  field,
  limit = 10
) {
  const values =
    [];

  const seen =
    new Set();

  for (
    const post of
    Array.isArray(posts)
      ? posts
      : []
  ) {
    const value =
      String(
        post?.[field] || ""
      ).trim();

    if (
      !value ||
      seen.has(value)
    ) {
      continue;
    }

    seen.add(
      value
    );

    values.push(
      value
    );

    if (
      values.length >=
      limit
    ) {
      break;
    }
  }

  return values;
}

function buildHistorySignals(
  postingHistory
) {
  const todayPosts =
    Array.isArray(
      postingHistory
        ?.todayPosts
    )
      ? postingHistory
          .todayPosts
      : [];

  const recentPosts =
    Array.isArray(
      postingHistory
        ?.recentSevenDayPosts
    )
      ? postingHistory
          .recentSevenDayPosts
      : [];

  const recentFormats =
    recentPosts
      .map(
        (post) =>
          post?.format ||
          null
      )
      .filter(Boolean);

  return {
    todayQuestionCount:
      todayPosts.filter(
        (post) =>
          post.questionUsed ===
          true
      ).length,

    todayProductConnectedCount:
      todayPosts.filter(
        (post) =>
          post.productConnected ===
          true
      ).length,

    todayAffiliateLinkCount:
      todayPosts.filter(
        (post) =>
          post.affiliateLinkUsed ===
          true
      ).length,

    recentContentTypes:
      uniqueValues(
        recentPosts,
        "contentType"
      ),

    recentTopics:
      uniqueValues(
        recentPosts,
        "topic"
      ),

    recentEmotions:
      uniqueValues(
        recentPosts,
        "emotion"
      ),

    recentHookStyles:
      uniqueValues(
        recentPosts,
        "hookStyle"
      ),

    recentEndingStyles:
      uniqueValues(
        recentPosts,
        "endingStyle"
      ),

    recentProductIds:
      uniqueValues(
        recentPosts,
        "productId"
      ),

    recentFormats,

    recentFormatSignatures:
      recentFormats.map(
        (format) =>
          format.signature
      ),
  };
}

export async function buildThreadContext(
  env
) {
  const now =
    new Date();

  const [
    postingHistory,
    activeProducts,
  ] = await Promise.all([
    getPostingHistory(
      env
    ),

    getActiveProducts(
      env
    ),
  ]);

  const recentPerformance =
    await buildRecentPerformance(
      env,
      postingHistory
        .recentSevenDayPosts
    );

  const analyticsSummary =
    buildAnalyticsSummary(
      recentPerformance
    );

  const recommendations =
    buildRecommendations(
      analyticsSummary
    );

  const analyticsObservations =
    buildAnalyticsObservations(
      analyticsSummary,
      recommendations
    );

  const productContext =
    buildProductContext(
      activeProducts
    );

  const recentProducts =
    buildRecentProducts(
      postingHistory
        .recentSevenDayPosts,
      activeProducts
    );

  const historySignals =
    buildHistorySignals(
      postingHistory
    );

  const todayLinkCount =
    historySignals
      .todayAffiliateLinkCount;

  const linkAvailable =
    todayLinkCount < 1 &&
    productContext
      .productDetails
      .some(
        (product) =>
          product.linkEnabled
      );

  return {
    meta: {
      version:
        "1.7.0",

      generatedAt:
        now.toISOString(),

      timeZone:
        SEOUL_TIME_ZONE,
    },

    environment: {
      currentDate:
        formatDate(
          now
        ),

      currentTime:
        formatTime(
          now
        ),

      weekday:
        getWeekday(
          now
        ),

      weather:
        null,

      season:
        getSeason(
          now
        ),
    },

    publishing: {
      publishSequence:
        postingHistory
          .todayPostCount +
        1,

      todayLinkCount,

      linkAvailable,

      goal:
        null,

      requestedTone:
        null,

      questionAvailable:
        historySignals
          .todayQuestionCount < 1,

      productConnectedAvailable:
        historySignals
          .todayProductConnectedCount < 1,

      affiliateLinkAvailable:
        historySignals
          .todayAffiliateLinkCount < 1,
    },

    history: {
      todayPosts:
        postingHistory
          .todayPosts,

      recentSevenDayPosts:
        postingHistory
          .recentSevenDayPosts,

      todayPostCount:
        postingHistory
          .todayPostCount,

      recentPostCount:
        postingHistory
          .recentPostCount,

      periodDays:
        postingHistory
          .periodDays,

      historyGeneratedAt:
        postingHistory
          .generatedAt,

      recentProducts,

      recentPerformance,

      todayQuestionCount:
        historySignals
          .todayQuestionCount,

      todayProductConnectedCount:
        historySignals
          .todayProductConnectedCount,

      todayAffiliateLinkCount:
        historySignals
          .todayAffiliateLinkCount,

      recentContentTypes:
        historySignals
          .recentContentTypes,

      recentTopics:
        historySignals
          .recentTopics,

      recentEmotions:
        historySignals
          .recentEmotions,

      recentHookStyles:
        historySignals
          .recentHookStyles,

      recentEndingStyles:
        historySignals
          .recentEndingStyles,

      recentProductIds:
        historySignals
          .recentProductIds,

      recentFormats:
        historySignals
          .recentFormats,

      recentFormatSignatures:
        historySignals
          .recentFormatSignatures,
    },

    products:
      productContext,

    analytics: {
      performancePostCount:
        recentPerformance
          .length,

      availableInsightCount:
        recentPerformance
          .filter(
            (item) =>
              item.available
          )
          .length,

      summary:
        analyticsSummary,

      recommendations,

      performanceLevel:
        analyticsObservations
          .performanceLevel,

      observations:
        analyticsObservations
          .observations,

      topHooks:
        Array.isArray(
          analyticsSummary
            ?.byHookStyle
        )
          ? analyticsSummary
              .byHookStyle
              .slice(
                0,
                5
              )
          : [],

      topTopics:
        Array.isArray(
          analyticsSummary
            ?.byTopic
        )
          ? analyticsSummary
              .byTopic
              .slice(
                0,
                5
              )
          : [],

      topPostTypes:
        Array.isArray(
          analyticsSummary
            ?.byContentType
        )
          ? analyticsSummary
              .byContentType
              .slice(
                0,
                5
              )
          : [],

      lowPerformanceTopics:
        Array.isArray(
          analyticsSummary
            ?.byTopic
        )
          ? [
              ...analyticsSummary
                .byTopic,
            ]
              .sort(
                (
                  first,
                  second
                ) =>
                  first.averageViews -
                  second.averageViews
              )
              .slice(
                0,
                5
              )
          : [],
    },
  };
}
