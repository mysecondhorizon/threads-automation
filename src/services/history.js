import { getRecentPostLogs } from "./logger.js";

const SEOUL_TIME_ZONE = "Asia/Seoul";
const RECENT_DAYS = 7;

function getDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isValidDate(date) {
  return (
    date instanceof Date &&
    !Number.isNaN(date.getTime())
  );
}

function isToday(date, now) {
  if (!isValidDate(date)) {
    return false;
  }

  return getDateKey(date) === getDateKey(now);
}

function isWithinRecentDays(
  date,
  now,
  days = RECENT_DAYS
) {
  if (!isValidDate(date)) {
    return false;
  }

  const diffMilliseconds =
    now.getTime() - date.getTime();

  const maximumAge =
    days * 24 * 60 * 60 * 1000;

  return (
    diffMilliseconds >= 0 &&
    diffMilliseconds <= maximumAge
  );
}

function normalizePublishedPost(log) {
  return {
    postId:
      typeof log.post_id === "string"
        ? log.post_id
        : null,

    username:
      typeof log.username === "string"
        ? log.username
        : null,

    text:
      typeof log.text === "string"
        ? log.text.trim()
        : "",

    createdAt:
      typeof log.created_at === "string"
        ? log.created_at
        : null,
  };
}

function isUsablePublishedLog(log) {
  return (
    log &&
    log.status === "published" &&
    typeof log.text === "string" &&
    Boolean(log.text.trim()) &&
    typeof log.created_at === "string" &&
    isValidDate(new Date(log.created_at))
  );
}

export async function getPostingHistory(env) {
  const now = new Date();

  const logs = await getRecentPostLogs(
    env,
    100
  );

  const publishedPosts = logs
    .filter(isUsablePublishedLog)
    .map(normalizePublishedPost);

  const todayPosts = publishedPosts.filter(
    (post) =>
      isToday(
        new Date(post.createdAt),
        now
      )
  );

  const recentSevenDayPosts =
    publishedPosts.filter((post) =>
      isWithinRecentDays(
        new Date(post.createdAt),
        now,
        RECENT_DAYS
      )
    );

  return {
    todayPosts,
    recentSevenDayPosts,

    todayPostCount:
      todayPosts.length,

    recentPostCount:
      recentSevenDayPosts.length,

    periodDays:
      RECENT_DAYS,

    generatedAt:
      now.toISOString(),
  };
}