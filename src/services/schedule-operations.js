export const SCHEDULER_MODE = "LEGACY_ACTIVE_RUNTIME_PREPARING";
export const SCHEDULE_TIME_ZONE = "Asia/Seoul";

export const ACTUAL_PRODUCTION_SCHEDULES = [
  { id: "general-auto-0810", type: "GENERAL_AUTO", time: "08:10", cron: "10 23 * * *" },
  { id: "general-auto-1130", type: "GENERAL_AUTO", time: "11:30", cron: "30 2 * * *" },
  { id: "general-auto-1430", type: "GENERAL_AUTO", time: "14:30", cron: "30 5 * * *" },
  { id: "general-auto-1840", type: "GENERAL_AUTO", time: "18:40", cron: "40 9 * * *" },
  { id: "product-review-2030", type: "PRODUCT_REVIEW", time: "20:30", cron: "30 11 * * *" },
];

function seoulDateParts(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHEDULE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

function atSeoulTime(parts, time) {
  const [hour, minute] = time.split(":").map(Number);
  return Date.UTC(parts.year, parts.month - 1, parts.day, hour - 9, minute);
}

function asIso(value) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

export function getActualProductionNextRunAt(time, now = Date.now()) {
  const parts = seoulDateParts(new Date(now));
  let next = atSeoulTime(parts, time);
  if (next <= now) next += 24 * 60 * 60 * 1000;
  return new Date(next).toISOString();
}

export function getNextActualProductionRun(now = Date.now()) {
  const next = ACTUAL_PRODUCTION_SCHEDULES
    .map((schedule) => ({ ...schedule, nextRunAt: getActualProductionNextRunAt(schedule.time, now) }))
    .sort((left, right) => Date.parse(left.nextRunAt) - Date.parse(right.nextRunAt))[0];
  return { type: next.type, time: next.time, nextRunAt: next.nextRunAt };
}

function operationType(run) {
  if (run?.operation === "product_review" || run?.cron === "30 11 * * *") return "PRODUCT_REVIEW";
  return "GENERAL_AUTO";
}

function resultForRun(run) {
  if (run?.status === "completed") return "게시 완료";
  if (run?.status === "review_ready") return "후보 생성 완료";
  if (run?.status === "skipped" || run?.skipped === true) return "실행 건너뜀";
  if (run?.status === "failed") return "실패";
  return "처리 상태 확인 필요";
}

function statusForRun(run) {
  if (run?.status === "completed" || run?.status === "review_ready") return "SUCCESS";
  if (run?.status === "skipped" || run?.skipped === true) return "SKIPPED";
  if (run?.status === "failed") return "FAILED";
  return "UNKNOWN";
}

export function normalizeScheduleHistory(runs) {
  if (!Array.isArray(runs)) return [];
  return runs.map((run) => ({
    type: operationType(run),
    scheduledAt: asIso(run?.scheduledTime) || asIso(run?.startedAt),
    completedAt: asIso(run?.completedAt),
    status: statusForRun(run),
    result: resultForRun(run),
  }));
}

export function enrichScheduleOperations(schedules, history, now = Date.now()) {
  const safeHistory = Array.isArray(history) ? history : [];
  return (Array.isArray(schedules) ? schedules : []).map((schedule) => {
    const production = ACTUAL_PRODUCTION_SCHEDULES.find((item) => item.id === schedule.id);
    if (!production) {
      return {
        ...schedule,
        runtimeNextRunAt: schedule.nextRunAt || null,
        actualProductionNextRunAt: null,
        actualProductionStatus: "RUNTIME_PREPARING",
        actualProductionLastRun: null,
      };
    }
    const matchingRun = safeHistory.find((run) => run?.cron === production.cron) || null;
    return {
      ...schedule,
      runtimeNextRunAt: schedule.nextRunAt || null,
      actualProductionNextRunAt: getActualProductionNextRunAt(production.time, now),
      actualProductionStatus: "CURRENTLY_OPERATING",
      actualProductionLastRun: matchingRun ? normalizeScheduleHistory([matchingRun])[0] : null,
    };
  });
}
