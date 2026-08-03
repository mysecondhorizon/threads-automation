import { config } from "../config.js";

const POST_INSIGHT_METRICS = [
  "views",
  "likes",
  "replies",
  "reposts",
  "quotes",
  "shares",
];

export class ThreadsInsightsError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = "ThreadsInsightsError";
    this.details = details;
  }
}

function normalizeInsights(data) {
  const metrics = {};

  for (const item of data.data || []) {
    if (!item?.name) {
      continue;
    }

    const valueItem = Array.isArray(item.values)
      ? item.values[0]
      : null;

    const rawValue =
      valueItem?.value ??
      item.total_value?.value ??
      item.value ??
      0;

    metrics[item.name] = Number(rawValue) || 0;
  }

  for (const metric of POST_INSIGHT_METRICS) {
    if (!(metric in metrics)) {
      metrics[metric] = 0;
    }
  }

  return metrics;
}

export async function getPostInsights(
  accessToken,
  postId
) {
  if (!accessToken) {
    throw new ThreadsInsightsError(
      "Threads access token is missing"
    );
  }

  if (!postId) {
    throw new ThreadsInsightsError(
      "Threads post ID is missing"
    );
  }

  const url = new URL(
    `${config.threads.graphBase}/${postId}/insights`
  );

  url.searchParams.set(
    "metric",
    POST_INSIGHT_METRICS.join(",")
  );

  url.searchParams.set(
    "access_token",
    accessToken
  );

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new ThreadsInsightsError(
      "Threads insights request failed",
      data
    );
  }

  const metrics = normalizeInsights(data);

  const interactions =
    metrics.likes +
    metrics.replies +
    metrics.reposts +
    metrics.quotes +
    metrics.shares;

  const engagementRate =
    metrics.views > 0
      ? Number(
          (
            (interactions / metrics.views) *
            100
          ).toFixed(2)
        )
      : 0;

  return {
    postId,
    ...metrics,
    interactions,
    engagementRate,
    fetchedAt: new Date().toISOString(),
  };
}
