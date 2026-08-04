import { getRecentPostLogs } from "./logger.js";

function isToday(date) {
  const today = new Date();

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function isWithinDays(date, days) {
  const now = new Date();

  const diff =
    now.getTime() - date.getTime();

  return diff <= days * 24 * 60 * 60 * 1000;
}

export async function getPostingHistory(
  env
) {
  const logs =
    await getRecentPostLogs(env);

  const publishedLogs = logs.filter(
    (log) =>
      log &&
      log.status === "published"
  );

  const todayPosts = publishedLogs
    .filter((log) =>
      isToday(new Date(log.created_at))
    )
    .map((log) => log.text);

  const recentPosts = publishedLogs
    .filter((log) =>
      isWithinDays(
        new Date(log.created_at),
        7
      )
    )
    .map((log) => log.text);

  return {
    todayPosts,
    recentPosts,
    recentCount: recentPosts.length,
  };
}