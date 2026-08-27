import { requireAdminApiSession } from "../middleware/auth.js";
import { createRuntimeSchedule, listRuntimeSchedules, updateRuntimeSchedule } from "../services/runtime-schedules.js";
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

export async function handleSchedulesCollection(request, env, {
  list = listRuntimeSchedules,
  create = createRuntimeSchedule,
  history = getScheduleRuns,
  now = () => Date.now(),
} = {}) {
  const unauthorized = await authorize(request, env);
  if (unauthorized) return unauthorized;
  try {
    if (request.method === "GET") {
      const [runtime, runs] = await Promise.all([list(env), history(env)]);
      const timestamp = now();
      return ok({
        ...runtime,
        schedulerMode: SCHEDULER_MODE,
        runtimeExecutionEnabled: isRuntimeSchedulerActive(),
        nextActualProductionRun: getNextActualProductionRun(runtime?.schedules, timestamp),
        scheduleReadiness: getProductionScheduleReadiness(runtime?.schedules),
        schedules: enrichScheduleOperations(runtime?.schedules, runs, timestamp),
        history: normalizeScheduleHistory(runs),
      });
    }
    if (request.method === "POST") return ok({ schedule: await create(env, await json(request)) }, 201);
    return fail("Method Not Allowed", 405);
  } catch (error) {
    return coordinatorError(error, "Schedule request failed");
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
