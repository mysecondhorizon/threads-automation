import { config } from "../config.js";

export const POST_INSIGHT_METRICS = [
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

export function normalizeInsightMetric(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function deriveInsightTotals(metrics) {
  const components = POST_INSIGHT_METRICS.filter((name) => name !== "views")
    .map((name) => normalizeInsightMetric(metrics[name]));
  const total = components.every((value) => value !== null)
    ? components.reduce((sum, value) => sum + value, 0)
    : null;
  const interactions = Number.isFinite(total) ? total : null;
  const views = normalizeInsightMetric(metrics.views);
  const rate = views > 0 && interactions !== null ? (interactions / views) * 100 : null;
  const engagementRate = Number.isFinite(rate) ? Number(rate.toFixed(2)) : null;
  return { interactions, engagementRate };
}

function normalizeInsights(data) {
  const metrics = Object.fromEntries(POST_INSIGHT_METRICS.map((name) => [name, null]));

  for (const item of Array.isArray(data?.data) ? data.data : []) {
    if (!POST_INSIGHT_METRICS.includes(item?.name)) {
      continue;
    }

    const valueItem = Array.isArray(item.values)
      ? item.values[0]
      : null;

    const rawValue =
      valueItem?.value ??
      item.total_value?.value ??
      item.value;

    metrics[item.name] = normalizeInsightMetric(rawValue);
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

  const metricAvailability = Object.fromEntries(POST_INSIGHT_METRICS.map((name) => [name, metrics[name] !== null]));
  const validCount = Object.values(metricAvailability).filter(Boolean).length;

  return {
    postId,
    integrityVersion: 1,
    collectionStatus: validCount === POST_INSIGHT_METRICS.length ? "success" : validCount ? "partial" : "unavailable",
    metricAvailability,
    ...metrics,
    ...deriveInsightTotals(metrics),
    fetchedAt: new Date().toISOString(),
  };
}
