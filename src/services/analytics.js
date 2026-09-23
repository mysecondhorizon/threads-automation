import { getJson } from "./kv.js";
import { POST_INSIGHT_METRICS, normalizeInsightMetric, deriveInsightTotals } from "./insights.js";
import { DEFAULT_WORKSPACE_ID } from "./workspace-foundation.js";

const MAX_PERFORMANCE_POSTS = 30;

function normalizeNumber(value) {
  return normalizeInsightMetric(value);
}

function normalizeObservation(post, insights) {
  const empty = {
    available: false,
    legacyInsight: false,
    ownershipVerified: false,
    collectionStatus: "pending",
    ...Object.fromEntries(POST_INSIGHT_METRICS.map((name) => [name, null])),
    interactions: null,
    engagementRate: null,
    fetchedAt: null,
    publishedAt: null,
  };
  if (!insights || typeof insights !== "object" || Array.isArray(insights)) return empty;
  const times = {
    fetchedAt: typeof insights.fetchedAt === "string" ? insights.fetchedAt : null,
    publishedAt: typeof insights.publishedAt === "string" ? insights.publishedAt : null,
  };
  if (insights.integrityVersion !== 1) {
    // Old positive values remain readable as unverified legacy data. Historical
    // zeros may have been fabricated by the old normalizer; never certify them.
    const legacyMetrics = Object.fromEntries(POST_INSIGHT_METRICS.map((name) => {
      const value = normalizeNumber(insights[name]);
      return [name, value > 0 ? value : null];
    }));
    return { ...empty, ...times, ...legacyMetrics, legacyInsight: true, collectionStatus: "legacy" };
  }
  const nonblank = (value) => typeof value === "string" && Boolean(value.trim());
  const owned = insights.postId === post.postId &&
    insights.workspaceId === (post.workspaceId || DEFAULT_WORKSPACE_ID) &&
    nonblank(insights.connectedAccountId) && nonblank(insights.threadsUserId) &&
    (!post.connectedAccountId || post.connectedAccountId === insights.connectedAccountId) &&
    (!post.threadsUserId || post.threadsUserId === insights.threadsUserId);
  if (!owned) return { ...empty, collectionStatus: "ownership_mismatch" };
  const metrics = Object.fromEntries(POST_INSIGHT_METRICS.map((name) => [
    name,
    insights.metricAvailability?.[name] === true ? normalizeNumber(insights[name]) : null,
  ]));
  const validCount = POST_INSIGHT_METRICS.filter((name) => metrics[name] !== null).length;
  return {
    ...empty,
    ...times,
    ...metrics,
    ...deriveInsightTotals(metrics),
    available: validCount > 0,
    ownershipVerified: true,
    collectionStatus: validCount === POST_INSIGHT_METRICS.length ? "success" : validCount ? "partial" : "unavailable",
  };
}

function normalizeCachedInsights(
  post,
  insights
) {
  const observation = normalizeObservation(post, insights);
  if (!observation.available) {
    return {
      postId: post.postId,
      createdAt: post.createdAt,
      text: post.text,

      style:
        post.style ||
        null,

      contentType:
        post.contentType ||
        null,

      contentBasis:
        post.contentBasis ||
        null,

      topic:
        post.topic ||
        null,

      emotion:
        post.emotion ||
        null,

      hookStyle:
        post.hookStyle ||
        null,

      endingStyle:
        post.endingStyle ||
        null,

      questionUsed:
        Boolean(
          post.questionUsed
        ),

      productConnected:
        Boolean(
          post.productConnected
        ),

      ...observation,
    };
  }

  return {
    postId: post.postId,
    createdAt: post.createdAt,
    text: post.text,
    style:
      post.style ||
      null,

    contentType:
      post.contentType ||
      null,

    contentBasis:
      post.contentBasis ||
      null,

    topic:
      post.topic ||
      null,

    emotion:
      post.emotion ||
      null,

    hookStyle:
      post.hookStyle ||
      null,

    endingStyle:
      post.endingStyle ||
      null,

    questionUsed:
      Boolean(
        post.questionUsed
      ),

    productConnected:
      Boolean(
        post.productConnected
      ),

    ...observation,
  };
}

async function getPostPerformance(
  env,
  post
) {
  if (!post?.postId) {
    return null;
  }

  try {
    const insights = await getJson(
      env,
      `post_insight:${post.postId}`
    );

    return normalizeCachedInsights(
      post,
      insights
    );
  } catch (error) {
    console.error(
      "Cached post insight read failed",
      {
        postId: post.postId,
        error,
      }
    );

    return normalizeCachedInsights(
      post,
      null
    );
  }
}

export async function buildRecentPerformance(
  env,
  recentPosts,
  { limit = MAX_PERFORMANCE_POSTS } = {}
) {
  if (!Array.isArray(recentPosts)) {
    return [];
  }

  const targetPosts = recentPosts
    .filter((post) =>
      Boolean(post?.postId)
    )
    .slice(0, Number.isInteger(limit) && limit >= 0 ? limit : MAX_PERFORMANCE_POSTS);

  const results = await Promise.all(
    targetPosts.map((post) =>
      getPostPerformance(env, post)
    )
  );

  return results.filter(Boolean);
}

const PERFORMANCE_METRICS = [
  "views",
  "likes",
  "replies",
  "reposts",
  "quotes",
  "shares",
  "interactions",
];

function buildPerformanceTotals(items) {
  const totals = {};

  for (const metric of PERFORMANCE_METRICS) {
    const values = items
      .map((item) => normalizeNumber(item?.[metric]))
      .filter((value) => value !== null);

    if (values.length) {
      totals[metric] = values.reduce((sum, value) => sum + value, 0);
    } else {
      totals[metric] = null;
    }
  }

  return totals;
}

export async function buildProductOpportunityPerformanceSummary(
  env,
  publishedPosts
) {
  const posts = Array.isArray(publishedPosts)
    ? publishedPosts.filter((post) => post && typeof post === "object")
    : [];
  const performance = await buildRecentPerformance(env, posts, { limit: posts.length });
  const available = performance.filter((item) => item.available === true);

  return {
    publishedPostCount: posts.length,
    postsWithPerformanceCount: available.length,
    performancePendingCount: posts.length - available.length,
    totals: available.length ? buildPerformanceTotals(available) : null,
  };
}

function groupPerformanceBy(
  items,
  field
) {
  const groups =
    new Map();

  for (
    const item of
    items
  ) {
    const key =
      String(
        item?.[field] ||
        ""
      ).trim();

    if (!key) {
      continue;
    }

    if (
      !groups.has(
        key
      )
    ) {
      groups.set(
        key,
        []
      );
    }

    groups
      .get(
        key
      )
      .push(
        item
      );
  }

  return groups;
}

function summarizeGroup(
  key,
  items
) {
  const count =
    items.length;

  const totalViews =
    items.reduce(
      (
        sum,
        item
      ) =>
        sum +
        normalizeNumber(
          item.views
        ),
      0
    );

  const interactionValues = items.map((item) => normalizeNumber(item.interactions)).filter((value) => value !== null);
  const totalInteractions = interactionValues.length
    ? interactionValues.reduce((sum, value) => sum + value, 0)
    : null;

  const averageViews =
    count > 0
      ? Number(
          (
            totalViews /
            count
          ).toFixed(
            1
          )
        )
      : 0;

  const rates = items.map((item) => normalizeNumber(item.engagementRate)).filter((value) => value !== null);
  const averageEngagementRate = rates.length
    ? Number((rates.reduce((sum, value) => sum + value, 0) / rates.length).toFixed(2))
    : null;

  return {
    key,
    count,
    totalViews,
    totalInteractions,
    averageViews,
    averageEngagementRate,
  };
}

function buildGroupedSummary(
  items,
  field
) {
  return [
    ...groupPerformanceBy(
      items,
      field
    ).entries(),
  ]
    .map(
      (
        [
          key,
          groupItems,
        ]
      ) =>
        summarizeGroup(
          key,
          groupItems
        )
    )
    .sort(
      (
        first,
        second
      ) => {
        if (
          second.averageViews !==
          first.averageViews
        ) {
          return (
            second.averageViews -
            first.averageViews
          );
        }

        if (first.averageEngagementRate === null || second.averageEngagementRate === null) return 0;
        return (
          second.averageEngagementRate -
          first.averageEngagementRate
        );
      }
    );
}

export function buildAnalyticsSummary(
  recentPerformance
) {
  const available = recentPerformance.filter(
    (item) => item.available && normalizeNumber(item.views) !== null
  );

  if (available.length === 0) {
    return {
      totalPosts:       0,
      averageViews:     null,
      bestPost:         null,
      worstPost:        null,
      insightCoverage:  0,
      byContentType:    [],
      byContentBasis:   [],
      byTopic:          [],
      byHookStyle:      [],
      byEndingStyle:    [],
      byEmotion:        [],
    };
  }

  const totalViews = available.reduce(
    (sum, item) => sum + item.views,
    0
  );

  const bestPost = available.reduce(
    (best, current) =>
      current.views > best.views
        ? current
        : best
  );

  const worstPost = available.reduce(
    (worst, current) =>
      current.views < worst.views
        ? current
        : worst
  );

  return {
    totalPosts:
      available.length,

    averageViews:
      Number(
        (
          totalViews /
          available.length
        ).toFixed(
          1
        )
      ),

    bestPost,

    worstPost,

    insightCoverage:
      Number(((available.length / recentPerformance.length) * 100).toFixed(1)),

    byContentType:
      buildGroupedSummary(
        available,
        "contentType"
      ),

    byContentBasis:
      buildGroupedSummary(
        available,
        "contentBasis"
      ),

    byTopic:
      buildGroupedSummary(
        available,
        "topic"
      ),

    byHookStyle:
      buildGroupedSummary(
        available,
        "hookStyle"
      ),

    byEndingStyle:
      buildGroupedSummary(
        available,
        "endingStyle"
      ),

    byEmotion:
      buildGroupedSummary(
        available,
        "emotion"
      ),
  };
}

export function buildRecommendations(
  summary
) {
  if (summary.totalPosts < 20) {
    return {
      needsMoreData: true,

      minimumRecommendedPosts: 20,

      reason:
        "게시글 수가 적어 통계 신뢰도가 낮습니다.",
    };
  }

  return {
    needsMoreData: false,

    minimumRecommendedPosts: 20,

    reason: null,
  };
}

export function buildAnalyticsObservations(
  summary,
  recommendations
) {
  const observations =
    [];

  if (
    summary.totalPosts === 0
  ) {
    return {
      performanceLevel:
        "데이터 없음",

      observations: [
        "분석 가능한 게시글 성과 데이터가 없습니다.",
      ],
    };
  }

  observations.push(
    `현재 분석 가능한 게시글은 ${summary.totalPosts}개입니다.`
  );

  observations.push(
    `최근 게시글의 평균 조회수는 ${summary.averageViews}회입니다.`
  );

  if (
    summary.bestPost
  ) {
    observations.push(
      `가장 높은 조회수는 ${summary.bestPost.views}회입니다.`
    );
  }

  const topContentType =
    Array.isArray(
      summary.byContentType
    ) &&
    summary.byContentType.length
      ? summary
          .byContentType[0]
      : null;

  if (
    topContentType &&
    topContentType.count >= 2
  ) {
    observations.push(
      `현재 콘텐츠 유형 중 '${topContentType.key}'의 평균 조회수가 ${topContentType.averageViews}회로 상대적으로 높습니다.`
    );
  }

  const topTopic =
    Array.isArray(
      summary.byTopic
    ) &&
    summary.byTopic.length
      ? summary.byTopic[0]
      : null;

  if (
    topTopic &&
    topTopic.count >= 2
  ) {
    observations.push(
      `최근 소재 중 '${topTopic.key}'의 평균 조회수가 ${topTopic.averageViews}회로 상대적으로 높습니다.`
    );
  }

  const topHook =
    Array.isArray(
      summary.byHookStyle
    ) &&
    summary.byHookStyle.length
      ? summary
          .byHookStyle[0]
      : null;

  if (
    topHook &&
    topHook.count >= 2
  ) {
    observations.push(
      `후킹 방식 중 '${topHook.key}'이 평균 조회수 ${topHook.averageViews}회로 좋은 반응을 보였습니다.`
    );
  }

  const topEnding =
    Array.isArray(
      summary.byEndingStyle
    ) &&
    summary.byEndingStyle.length
      ? summary
          .byEndingStyle[0]
      : null;

  if (
    topEnding &&
    topEnding.count >= 2
  ) {
    observations.push(
      `마무리 방식 중 '${topEnding.key}'의 평균 조회수가 ${topEnding.averageViews}회입니다.`
    );
  }

  const topEmotion =
    Array.isArray(
      summary.byEmotion
    ) &&
    summary.byEmotion.length
      ? summary
          .byEmotion[0]
      : null;

  if (
    topEmotion &&
    topEmotion.count >= 2
  ) {
    observations.push(
      `최근 '${topEmotion.key}' 감정이 중심인 글의 평균 조회수는 ${topEmotion.averageViews}회입니다.`
    );
  }

  const lowTopics =
    Array.isArray(
      summary.byTopic
    )
      ? [
          ...summary.byTopic,
        ]
          .filter(
            (item) =>
              item.count >= 2
          )
          .sort(
            (
              first,
              second
            ) =>
              first.averageViews -
              second.averageViews
          )
      : [];

  const lowTopic =
    lowTopics[0] ||
    null;

  if (
    lowTopic &&
    topTopic &&
    lowTopic.key !==
      topTopic.key
  ) {
    observations.push(
      `반대로 '${lowTopic.key}' 소재는 평균 조회수 ${lowTopic.averageViews}회로 상대적으로 낮아 같은 각도의 반복은 피하는 편이 좋습니다.`
    );
  }

  const hasInteractions =
    Boolean(
      summary.bestPost
    ) &&
    Number(
      summary.bestPost
        .interactions
    ) > 0;

  if (normalizeNumber(summary.bestPost?.interactions) === null) {
    observations.push("반응 지표가 완전히 수집되지 않아 반응 수준을 판단할 수 없습니다.");
  } else if (!hasInteractions) {
    observations.push(
      "좋아요, 답글, 재게시, 공유 반응이 부족해 현재는 조회수 중심으로 판단해야 합니다."
    );
  }

  if (
    recommendations
      .needsMoreData
  ) {
    observations.push(
      `신뢰도 높은 분석을 위해 최소 ${recommendations.minimumRecommendedPosts}개의 게시글 데이터가 필요합니다.`
    );
  }

  let performanceLevel =
    "관찰 가능";

  if (
    recommendations
      .needsMoreData
  ) {
    performanceLevel =
      "데이터 부족";
  }

  return {
    performanceLevel,

    observations,
  };
}
