import { getJson } from "./kv.js";

const MAX_PERFORMANCE_POSTS = 30;

function normalizeNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function normalizeCachedInsights(
  post,
  insights
) {
  if (!insights) {
    return {
      postId: post.postId,
      createdAt: post.createdAt,
      text: post.text,
      available: false,
      views: null,
      likes: null,
      replies: null,
      reposts: null,
      quotes: null,
      shares: null,
      interactions: null,
      engagementRate: null,
      fetchedAt: null,
    };
  }

  return {
    postId: post.postId,
    createdAt: post.createdAt,
    text: post.text,
    available: true,
    views: normalizeNumber(
      insights.views
    ),
    likes: normalizeNumber(
      insights.likes
    ),
    replies: normalizeNumber(
      insights.replies
    ),
    reposts: normalizeNumber(
      insights.reposts
    ),
    quotes: normalizeNumber(
      insights.quotes
    ),
    shares: normalizeNumber(
      insights.shares
    ),
    interactions: normalizeNumber(
      insights.interactions
    ),
    engagementRate: normalizeNumber(
      insights.engagementRate
    ),
    fetchedAt:
      typeof insights.fetchedAt === "string"
        ? insights.fetchedAt
        : null,
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
  recentPosts
) {
  if (!Array.isArray(recentPosts)) {
    return [];
  }

  const targetPosts = recentPosts
    .filter((post) =>
      Boolean(post?.postId)
    )
    .slice(0, MAX_PERFORMANCE_POSTS);

  const results = await Promise.all(
    targetPosts.map((post) =>
      getPostPerformance(env, post)
    )
  );

  return results.filter(Boolean);
}