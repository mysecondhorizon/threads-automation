import {
  getPostingHistory,
} from "../history.js";

const DEFAULT_DAILY_AUTO_POST_LIMIT =
  3;

export class DailyLimitGuardError extends Error {
  constructor(
    message,
    {
      code = "daily_limit_guard_error",
      details = null,
    } = {}
  ) {
    super(message);

    this.name =
      "DailyLimitGuardError";

    this.code =
      code;

    this.details =
      details;
  }
}

export async function checkDailyAutoPostLimit(
  env,
  {
    dailyLimit =
      DEFAULT_DAILY_AUTO_POST_LIMIT,
  } = {}
) {
  const history =
    await getPostingHistory(
      env
    );

  const todayPostCount =
    Number(
      history.todayPostCount ||
      0
    );

  if (
    todayPostCount >=
    dailyLimit
  ) {
    throw new DailyLimitGuardError(
      "오늘 최대 게시 횟수에 도달했습니다.",
      {
        code:
          "daily_post_limit_reached",

        details: {
          dailyLimit,

          todayPostCount,
        },
      }
    );
  }

  return {
    allowed:
      true,

    dailyLimit,

    todayPostCount,

    remaining:
      Math.max(
        dailyLimit -
        todayPostCount,
        0
      ),
  };
}