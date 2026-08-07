import {
  getScheduleRuns,
} from "./schedule-store.js";

const SEOUL_TIME_ZONE =
  "Asia/Seoul";

const DEFAULT_DAILY_AUTO_POST_LIMIT =
  3;

const MAX_HISTORY_LOOKUP =
  50;

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

function getSeoulDateKey(
  value
) {
  const date =
    value instanceof Date
      ? value
      : new Date(
          value
        );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone:
        SEOUL_TIME_ZONE,

      year:
        "numeric",

      month:
        "2-digit",

      day:
        "2-digit",
    }
  ).format(
    date
  );
}

function isCompletedCronPost(
  run
) {
  return (
    run &&
    run.source === "cron" &&
    run.status === "completed" &&
    run.skipped !== true &&
    Boolean(
      run.postId
    )
  );
}

function isRunFromToday(
  run,
  todayKey
) {
  const runDateKey =
    getSeoulDateKey(
      run?.completedAt ||
      run?.startedAt
    );

  return (
    runDateKey &&
    runDateKey ===
      todayKey
  );
}

export async function checkDailyAutoPostLimit(
  env,
  {
    dailyLimit =
      DEFAULT_DAILY_AUTO_POST_LIMIT,
  } = {}
) {
  const now =
    new Date();

  const todayKey =
    getSeoulDateKey(
      now
    );

  const runs =
    await getScheduleRuns(
      env,
      MAX_HISTORY_LOOKUP
    );

  const todayCompletedRuns =
    runs.filter(
      (run) =>
        isCompletedCronPost(
          run
        ) &&
        isRunFromToday(
          run,
          todayKey
        )
    );

  const todayAutoPostCount =
    todayCompletedRuns.length;

  if (
    todayAutoPostCount >=
    dailyLimit
  ) {
    throw new DailyLimitGuardError(
      "오늘 Cron 자동 게시 최대 횟수에 도달했습니다.",
      {
        code:
          "daily_auto_post_limit_reached",

        details: {
          dailyLimit,

          todayAutoPostCount,

          remaining:
            0,

          date:
            todayKey,

          recentPostIds:
            todayCompletedRuns
              .map(
                (run) =>
                  run.postId
              ),
        },
      }
    );
  }

  return {
    allowed:
      true,

    dailyLimit,

    todayAutoPostCount,

    remaining:
      Math.max(
        dailyLimit -
        todayAutoPostCount,
        0
      ),

    date:
      todayKey,
  };
}