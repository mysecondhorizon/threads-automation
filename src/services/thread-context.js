import {
  getPostingHistory,
} from "./history.js";

import {
  buildRecentPerformance,
  buildAnalyticsSummary,
  buildRecommendations,
  buildAnalyticsObservations,
} from "./analytics.js";

const SEOUL_TIME_ZONE = "Asia/Seoul";

function getSeoulMonth(date) {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: SEOUL_TIME_ZONE,
        month: "numeric",
      }
    ).formatToParts(date);

  const monthPart = parts.find(
    (part) =>
      part.type === "month"
  );

  return Number(
    monthPart?.value || 0
  );
}

function getSeason(date) {
  const month =
    getSeoulMonth(date);

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

function formatDate(date) {
  return date.toLocaleDateString(
    "ko-KR",
    {
      timeZone:
        SEOUL_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  );
}

function formatTime(date) {
  return date.toLocaleTimeString(
    "ko-KR",
    {
      timeZone:
        SEOUL_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }
  );
}

function getWeekday(date) {
  return date.toLocaleDateString(
    "ko-KR",
    {
      timeZone:
        SEOUL_TIME_ZONE,
      weekday: "long",
    }
  );
}

export async function buildThreadContext(
  env
) {
  const now = new Date();

  const postingHistory =
    await getPostingHistory(env);

  const recentPerformance =
    await buildRecentPerformance(
      env,
      postingHistory.recentSevenDayPosts
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

  return {
    meta: {
      version: "1.4.0",

      generatedAt:
        now.toISOString(),

      timeZone:
        SEOUL_TIME_ZONE,
    },

    environment: {
      currentDate:
        formatDate(now),

      currentTime:
        formatTime(now),

      weekday:
        getWeekday(now),

      weather: null,

      season:
        getSeason(now),
    },

    publishing: {
      publishSequence:
        postingHistory
          .todayPostCount + 1,

      todayLinkCount: 0,

      linkAvailable: true,

      goal: null,

      requestedTone: null,
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

      recentProducts: [],

      recentPerformance,
    },

    products: {
      availableProducts: [],

      productExperience: [],

      productDetails: [],

      productPrices: [],

      productPhotos: [],
    },

    analytics: {
      performancePostCount:
        recentPerformance.length,
    
      availableInsightCount:
        recentPerformance.filter(
          (item) => item.available
        ).length,
    
      summary:
        analyticsSummary,
    
      recommendations,
      
      performanceLevel:
        analyticsObservations.performanceLevel,
      
      observations:
        analyticsObservations.observations,
    
      topHooks: [],
    
      topTopics: [],
    
      topPostTypes: [],
    
      lowPerformanceTopics: [],
    },
  };
}