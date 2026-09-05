import { requireAdminApiSession } from "../middleware/auth.js";
import {
  WorkspaceScheduleError,
  createRuntimeSchedule,
  createWorkspaceRuntimeSchedule,
  getRuntimeScheduleCoordinatorStatus,
  getWorkspaceRuntimeSchedule,
  listRuntimeSchedules,
  listWorkspaceRuntimeSchedules,
  reconcileRuntimeScheduleAlarm,
  updateRuntimeSchedule,
  updateWorkspaceRuntimeSchedule,
} from "../services/runtime-schedules.js";
import { getScheduleRuns } from "../services/auto-post/schedule-store.js";
import { SCHEDULER_MODE, enrichScheduleOperations, getNextActualProductionRun, getProductionScheduleReadiness, normalizeScheduleHistory } from "../services/schedule-operations.js";
import { isRuntimeSchedulerActive } from "../services/scheduler-ownership.js";
import { ConnectedAccountError, resolveWorkspaceThreadsConnectedAccount } from "../services/connected-accounts.js";
import { resolveExecutionContext } from "../services/execution-context.js";
import { DEFAULT_WORKSPACE_ID } from "../services/workspace-foundation.js";
import { fail, ok } from "../utils/response.js";

async function authorize(request, env) {
  return requireAdminApiSession(request, env, { allowSelectedWorkspace: true });
}

async function json(request) {
  try { return await request.json(); } catch { return null; }
}

function coordinatorError(error, fallback) {
  if (error instanceof ConnectedAccountError) {
    return fail("Threads account is not available for this workspace", 409, { code: "threads_account_unavailable" });
  }
  if (error instanceof WorkspaceScheduleError) {
    return fail(error.message, 400, { code: error.code });
  }
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

function isDefaultWorkspace(auth) {
  return auth.session.legacy || auth.workspaceId === DEFAULT_WORKSPACE_ID;
}

function workspaceScheduleResponse(runtime) {
  const schedules = (Array.isArray(runtime?.schedules) ? runtime.schedules : []).map((schedule) => ({
    ...schedule,
    actualProductionStatus: "WORKSPACE_EXECUTION_NOT_READY",
    actualProductionNextRunAt: null,
    actualProductionLastRun: null,
  }));
  return {
    schedules,
    schedulerMode: SCHEDULER_MODE,
    runtimeExecutionEnabled: false,
    coordinatorStatus: {
      alarmScheduled: false,
      alarmAt: null,
      coordinatorTime: null,
      earliestEnabledNextRunAt: null,
      enabledScheduleCount: 0,
      lastReceipt: null,
      health: "INACTIVE",
    },
    nextActualProductionRun: null,
    scheduleReadiness: { ready: false, expectedCount: 0, activeCount: 0, unavailable: [] },
    history: [],
    canReconcileRuntime: false,
  };
}

async function resolveWorkspaceScheduleContext(env, workspaceId, {
  resolveThreadsAccount = resolveWorkspaceThreadsConnectedAccount,
  resolveContext = resolveExecutionContext,
} = {}) {
  const account = await resolveThreadsAccount(env, { workspaceId });
  return resolveContext(env, { workspaceId, connectedAccountId: account.id });
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
  listWorkspace = listWorkspaceRuntimeSchedules,
  createWorkspace = createWorkspaceRuntimeSchedule,
  resolveWorkspaceContext = resolveWorkspaceScheduleContext,
  now = () => Date.now(),
} = {}) {
  const auth = await authorize(request, env);
  if (!auth.ok) return auth.response;
  try {
    if (request.method === "GET") {
      if (!isDefaultWorkspace(auth)) {
        return ok(workspaceScheduleResponse(await listWorkspace(env, auth.workspaceId)));
      }
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
        canReconcileRuntime: true,
      });
    }
    if (request.method === "POST") {
      const input = await json(request);
      if (isDefaultWorkspace(auth)) return ok({ schedule: await create(env, input) }, 201);
      const executionContext = await resolveWorkspaceContext(env, auth.workspaceId);
      return ok({ schedule: await createWorkspace(env, input, {
        workspaceId: auth.workspaceId,
        connectedAccountId: executionContext.connectedAccountId,
      }) }, 201);
    }
    return fail("Method Not Allowed", 405);
  } catch (error) {
    return coordinatorError(error, "Schedule request failed");
  }
}

export async function handleScheduleReconcile(request, env, {
  reconcile = reconcileRuntimeScheduleAlarm,
} = {}) {
  const auth = await authorize(request, env);
  if (!auth.ok) return auth.response;
  if (request.method !== "POST") return fail("Method Not Allowed", 405);
  if (!isDefaultWorkspace(auth)) {
    return fail("Workspace schedule execution is not active yet", 409, {
      code: "workspace_schedule_execution_not_ready",
    });
  }
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
  getWorkspace = getWorkspaceRuntimeSchedule,
  updateWorkspace = updateWorkspaceRuntimeSchedule,
  resolveWorkspaceContext = resolveWorkspaceScheduleContext,
} = {}) {
  const auth = await authorize(request, env);
  if (!auth.ok) return auth.response;
  if (request.method !== "PATCH") return fail("Method Not Allowed", 405);
  try {
    const input = await json(request);
    if (!isDefaultWorkspace(auth)) {
      const existing = await getWorkspace(env, scheduleId, auth.workspaceId);
      if (!existing) return fail("Schedule not found", 404, { code: "schedule_not_found" });
      const executionContext = await resolveWorkspaceContext(env, auth.workspaceId);
      if (executionContext.connectedAccountId !== existing.connectedAccountId) {
        return fail("Threads account is not available for this workspace", 409, {
          code: "threads_account_unavailable",
        });
      }
      const schedule = await updateWorkspace(env, scheduleId, input, {
        workspaceId: auth.workspaceId,
      });
      return schedule ? ok({ schedule }) : fail("Schedule not found", 404, { code: "schedule_not_found" });
    }
    const schedule = await update(env, scheduleId, input);
    return schedule ? ok({ schedule }) : fail("Schedule not found", 404, { code: "schedule_not_found" });
  } catch (error) {
    return coordinatorError(error, "Schedule update failed");
  }
}
