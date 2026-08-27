import { requireAdminApiSession } from "../middleware/auth.js";
import { createRuntimeSchedule, getRuntimeScheduleCoordinatorStatus, listRuntimeSchedules, reconcileRuntimeScheduleAlarm, updateRuntimeSchedule } from "../services/runtime-schedules.js";
import { getScheduleRuns } from "../services/auto-post/schedule-store.js";
import { SCHEDULER_MODE, enrichScheduleOperations, getNextActualProductionRun, getProductionScheduleReadiness, normalizeScheduleHistory } from "../services/schedule-operations.js";
import { isRuntimeSchedulerActive } from "../services/scheduler-ownership.js";
import { fail, ok } from "../utils/response.js";

async function authorize(request, env) {
  const auth = await requireAdminApiSession(request, env);
  return auth.ok ? null : auth.response;
}

async function json(request) {
  try { return await request.json(); } catch { return null; }
}

function coordinatorError(error, fallback) {
  const message = String(error?.message || fallback);
  const known = new Set([
    "Schedule must be an object", "Schedule contains protected fields", "name is required",
    "type is invalid", "cadence must be daily with a valid HH:MM time", "enabled must be a boolean",
    "Schedule update must be an object", "Only name, cadence, and enabled can be updated",
    "cadence.time must be a valid HH:MM time",
  ]);
  if (known.has(message)) return fail(message, 400, { code: "invalid_schedule" });
  console.error(fallback, { message: message.slice(0, 256) });
  return fail(fallback, 500, { code: "schedule_request_failed" });
}

const RECEIPT_STATUSES = new Set(["SUPPRESSED", "MISSED", "RUNNING", "SUCCESS", "FAILED", "UNCERTAIN"]);
const ALARM_MATCH_TOLERANCE_MS = 1000;

function isoOrNull(value) {
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizeReceipt(receipt, includeScheduleId = false) {
  if (!receipt || !RECEIPT_STATUSES.has(receipt.status)) return null;
  const scheduledFor = isoOrNull(receipt.scheduledFor);
  const startedAt = isoOrNull(receipt.startedAt);
  if (!scheduledFor || !startedAt) return null;
  return {
    ...(includeScheduleId && typeof receipt.scheduleId === "string" ? { scheduleId: receipt.scheduleId } : {}),
    status: receipt.status,
    scheduledFor,
    startedAt,
    completedAt: isoOrNull(receipt.completedAt),
  };
}

function normalizeCoordinatorStatus(status) {
  const alarmAt = isoOrNull(status?.alarmAt);
  const earliestEnabledNextRunAt = isoOrNull(status?.earliestEnabledNextRunAt);
  const enabledScheduleCount = Number.isSafeInteger(status?.enabledScheduleCount) && status.enabledScheduleCount >= 0 ? status.enabledScheduleCount : 0;
  const alarmScheduled = Boolean(status?.alarmScheduled && alarmAt);
  const alarmMatchesExpected = Boolean(alarmScheduled && earliestEnabledNextRunAt && Math.abs(Date.parse(alarmAt) - Date.parse(earliestEnabledNextRunAt)) <= ALARM_MATCH_TOLERANCE_MS);
  return {
    alarmScheduled,
    alarmAt,
    coordinatorTime: isoOrNull(status?.coordinatorTime),
    earliestEnabledNextRunAt,
    enabledScheduleCount,
    lastReceipt: normalizeReceipt(status?.lastReceipt, true),
    health: enabledScheduleCount === 0 ? "INACTIVE" : (alarmMatchesExpected ? "HEALTHY" : "WARNING"),
  };
}

export async function handleSchedulesCollection(request, env, {
  list = listRuntimeSchedules,
  status = getRuntimeScheduleCoordinatorStatus,
  create = createRuntimeSchedule,
  history = getScheduleRuns,
  now = () => Date.now(),
} = {}) {
  const unauthorized = await authorize(request, env);
  if (unauthorized) return unauthorized;
  try {
    if (request.method === "GET") {
      const [runtime, coordinatorStatus, runs] = await Promise.all([list(env), status(env), history(env)]);
      const timestamp = now();
      const schedules = (Array.isArray(runtime?.schedules) ? runtime.schedules : []).map((schedule) => ({
        ...schedule,
        runtimeLastReceipt: normalizeReceipt(schedule?.runtimeLastReceipt),
      }));
      return ok({
        ...runtime,
        schedulerMode: SCHEDULER_MODE,
        runtimeExecutionEnabled: isRuntimeSchedulerActive(),
        coordinatorStatus: normalizeCoordinatorStatus(coordinatorStatus),
        nextActualProductionRun: getNextActualProductionRun(schedules, timestamp),
        scheduleReadiness: getProductionScheduleReadiness(schedules),
        schedules: enrichScheduleOperations(schedules, runs, timestamp),
        history: normalizeScheduleHistory(runs),
      });
    }
    if (request.method === "POST") return ok({ schedule: await create(env, await json(request)) }, 201);
    return fail("Method Not Allowed", 405);
  } catch (error) {
    return coordinatorError(error, "Schedule request failed");
  }
}

export async function handleScheduleReconcile(request, env, {
  reconcile = reconcileRuntimeScheduleAlarm,
} = {}) {
  const unauthorized = await authorize(request, env);
  if (unauthorized) return unauthorized;
  if (request.method !== "POST") return fail("Method Not Allowed", 405);
  try {
    const result = await reconcile(env);
    return ok({
      status: {
        ...normalizeCoordinatorStatus(result?.after),
        reconciled: result?.reconciled === true,
      },
    });
  } catch (error) {
    return coordinatorError(error, "Schedule alarm reconcile failed");
  }
}

export async function handleScheduleById(request, env, scheduleId, {
  update = updateRuntimeSchedule,
} = {}) {
  const unauthorized = await authorize(request, env);
  if (unauthorized) return unauthorized;
  if (request.method !== "PATCH") return fail("Method Not Allowed", 405);
  try {
    const schedule = await update(env, scheduleId, await json(request));
    return schedule ? ok({ schedule }) : fail("Schedule not found", 404, { code: "schedule_not_found" });
  } catch (error) {
    return coordinatorError(error, "Schedule update failed");
  }
}
