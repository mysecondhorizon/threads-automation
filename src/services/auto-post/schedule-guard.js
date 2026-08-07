import {
  getPostingHistory,
} from "../history.js";

const DEFAULT_MINIMUM_INTERVAL_MINUTES =
  90;

export class ScheduleGuardError extends Error {
  constructor(
    message,
    {
      code = "schedule_guard_error",
      details = null,
    } = {}
  ) {
    super(message);

    this.name =
      "ScheduleGuardError";

    this.code =
      code;

    this.details =
      details;
  }
}

export async function checkScheduleGuard(
  env,
  {
    minimumIntervalMinutes =
      DEFAULT_MINIMUM_INTERVAL_MINUTES,
  } = {}
) {
  const history =
    await getPostingHistory(
      env
    );

  const latestPost =
    history.latestPost ||
    null;

  const minutesSinceLatestPost =
    history.minutesSinceLatestPost;

  if (
    latestPost &&
    Number.isFinite(
      minutesSinceLatestPost
    ) &&
    minutesSinceLatestPost <
      minimumIntervalMinutes
  ) {
    throw new ScheduleGuardError(
      "최근 게시 후 최소 간격이 지나지 않았습니다.",
      {
        code:
          "post_interval_too_short",

        details: {
          minimumIntervalMinutes,

          minutesSinceLatestPost,

          latestPostId:
            latestPost.postId,

          latestPostCreatedAt:
            latestPost.createdAt,
        },
      }
    );
  }

  return {
    allowed:
      true,

    minimumIntervalMinutes,

    latestPostId:
      latestPost?.postId ||
      null,

    latestPostCreatedAt:
      latestPost?.createdAt ||
      null,

    minutesSinceLatestPost:
      minutesSinceLatestPost ??
      null,
  };
}