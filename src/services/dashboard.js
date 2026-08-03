import { getJson, listKeys } from "./kv.js";
import { getPostLogs } from "./logger.js";

export async function getDashboardData(env) {
  const logs = await getPostLogs(env);

  const publishedLogs = logs.filter(
    (log) =>
      log?.status === "published" &&
      log?.post_id
  );

  const insightKeyList = await listKeys(
    env,
    "post_insight:"
  );

  const insightItems = await Promise.all(
    insightKeyList.keys.map((item) =>
      getJson(env, item.name)
    )
  );

  const insightMap = new Map();

  for (const insight of insightItems) {
    if (insight?.postId) {
      insightMap.set(
        String(insight.postId),
        insight
      );
    }
  }

  const posts = publishedLogs.map((log) => {
    const insight =
      insightMap.get(String(log.post_id)) || {};

    return {
      postId: log.post_id,
      text: log.text || "",
      username: log.username || "",
      publishedAt: log.created_at || null,

      views: Number(insight.views) || 0,
      likes: Number(insight.likes) || 0,
      replies: Number(insight.replies) || 0,
      reposts: Number(insight.reposts) || 0,
      quotes: Number(insight.quotes) || 0,
      shares: Number(insight.shares) || 0,

      interactions:
        Number(insight.interactions) || 0,

      engagementRate:
        Number(insight.engagementRate) || 0,

      insightsFetchedAt:
        insight.fetchedAt || null,
    };
  });

  const postsWithInsights = posts.filter(
    (post) => post.insightsFetchedAt
  );

  const totalViews = posts.reduce(
    (sum, post) => sum + post.views,
    0
  );

  const totalInteractions = posts.reduce(
    (sum, post) =>
      sum + post.interactions,
    0
  );

  const averageViews =
    postsWithInsights.length > 0
      ? Math.round(
          totalViews /
            postsWithInsights.length
        )
      : 0;

  const averageEngagementRate =
    postsWithInsights.length > 0
      ? Number(
          (
            postsWithInsights.reduce(
              (sum, post) =>
                sum +
                post.engagementRate,
              0
            ) /
            postsWithInsights.length
          ).toFixed(2)
        )
      : 0;

  const topPosts = [...posts]
    .sort((a, b) => {
      if (b.views !== a.views) {
        return b.views - a.views;
      }

      return (
        b.engagementRate -
        a.engagementRate
      );
    })
    .slice(0, 5);

  return {
    summary: {
      totalPosts: posts.length,
      postsWithInsights:
        postsWithInsights.length,
      totalViews,
      totalInteractions,
      averageViews,
      averageEngagementRate,
    },

    topPosts,

    recentPosts: posts.slice(0, 20),
  };
}
