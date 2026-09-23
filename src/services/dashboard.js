import { getPostLogs } from "./logger.js";
import { buildRecentPerformance } from "./analytics.js";

export async function getDashboardData(env) {
  const logs = await getPostLogs(env);

  const publishedLogs = logs.filter(
    (log) =>
      log?.status === "published" &&
      log?.post_id
  );

  // Reuse the same ownership and metric-validity rules as analytics.
  const performance = await buildRecentPerformance(env, publishedLogs.map((log) => ({
    postId: log.post_id,
    workspaceId: log.metadata?.workspaceId,
    connectedAccountId: log.metadata?.connectedAccountId,
    threadsUserId: log.metadata?.threadsUserId,
    text: log.text || "",
    createdAt: log.created_at || null,
  })), { limit: publishedLogs.length });
  const posts = publishedLogs.map((log, index) => {
    const insight = performance[index];
    return {
      ...insight,
      postId: log.post_id,
      text: log.text || "",
      username: log.username || "",
      publishedAt: insight.publishedAt || log.created_at || null,

      insightsFetchedAt:
        insight.fetchedAt || null,
    };
  });

  const postsWithInsights = posts.filter(
    (post) => post.available
  );

  const viewPosts = postsWithInsights.filter((post) => post.views !== null);
  const interactionPosts = postsWithInsights.filter((post) => post.interactions !== null);
  const ratePosts = postsWithInsights.filter((post) => post.engagementRate !== null);
  const totalViews = viewPosts.length ? viewPosts.reduce(
    (sum, post) => sum + post.views,
    0
  ) : null;

  const totalInteractions = interactionPosts.length ? interactionPosts.reduce(
    (sum, post) =>
      sum + post.interactions,
    0
  ) : null;

  const averageViews =
    viewPosts.length > 0
      ? Math.round(
          totalViews /
            viewPosts.length
        )
      : null;

  const averageEngagementRate =
    ratePosts.length > 0
      ? Number(
          (
            ratePosts.reduce(
              (sum, post) =>
                sum +
                post.engagementRate,
              0
            ) /
            ratePosts.length
          ).toFixed(2)
        )
      : null;

  const topPosts = [...viewPosts]
    .sort((a, b) => {
      if (b.views !== a.views) {
        return b.views - a.views;
      }

      if (a.engagementRate === null || b.engagementRate === null) return 0;
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
