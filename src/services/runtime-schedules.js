import { getJson, putJson } from "./kv.js";

const COORDINATOR_NAME = "application-runtime-schedule-coordinator";
const WORKSPACE_SCHEDULES_KEY = "workspace_runtime_schedule_configurations:v1";
const WORKSPACE_SCHEDULES_VERSION = 1;
const SCHEDULE_TYPES = new Set(["GENERAL_AUTO", "PRODUCT_REVIEW"]);

export class WorkspaceScheduleError extends Error {
  constructor(message, code = "workspace_schedule_invalid") {
    super(message);
    this.name = "WorkspaceScheduleError";
    this.code = code;
  }
}

function fail(message, code) {
  throw new WorkspaceScheduleError(message, code);
}

function normalizeWorkspaceId(workspaceId) {
  if (typeof workspaceId !== "string" || !workspaceId.trim()) {
    fail("Workspace schedule scope is invalid", "workspace_schedule_scope_invalid");
  }
  return workspaceId.trim();
}

function normalizeScheduleInput(input, { partial = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail(partial ? "Schedule update must be an object" : "Schedule must be an object");
  }
  const allowed = partial
    ? new Set(["name", "cadence", "enabled"])
    : new Set(["name", "type", "cadence", "enabled"]);
  if (!Object.keys(input).length && partial) fail("Schedule update must be an object");
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    fail(partial ? "Only name, cadence, and enabled can be updated" : "Schedule contains protected fields");
  }
  const value = {};
  if (!partial || Object.hasOwn(input, "name")) {
    if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 120) {
      fail("name is required");
    }
    value.name = input.name.trim();
  }
  if (!partial) {
    if (!SCHEDULE_TYPES.has(input.type)) fail("type is invalid");
    value.type = input.type;
  }
  if (!partial || Object.hasOwn(input, "enabled")) {
    if (input.enabled !== undefined && typeof input.enabled !== "boolean") fail("enabled must be a boolean");
    value.enabled = input.enabled === true;
  }
  if (!partial || Object.hasOwn(input, "cadence")) {
    const cadence = input.cadence;
    const validCadence = cadence && typeof cadence === "object" && !Array.isArray(cadence) &&
      (partial ? Object.keys(cadence).every((key) => key === "time") : Object.keys(cadence).every((key) => key === "kind" || key === "time")) &&
      (!partial ? cadence.kind === "daily" : true) &&
      typeof cadence.time === "string" && /^\d{2}:\d{2}$/u.test(cadence.time);
    if (!validCadence) fail(partial ? "cadence.time must be a valid HH:MM time" : "cadence must be daily with a valid HH:MM time");
    const [hour, minute] = cadence.time.split(":").map(Number);
    if (hour > 23 || minute > 59) fail(partial ? "cadence.time must be a valid HH:MM time" : "cadence must be daily with a valid HH:MM time");
    value.cadence = { kind: "daily", time: cadence.time };
  }
  return value;
}

function normalizeStoredWorkspaceSchedule(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const id = typeof value.id === "string" ? value.id.trim() : "";
    const workspaceId = normalizeWorkspaceId(value.workspaceId);
    const connectedAccountId = typeof value.connectedAccountId === "string" ? value.connectedAccountId.trim() : "";
    if (!id || !connectedAccountId || !SCHEDULE_TYPES.has(value.type) || typeof value.enabled !== "boolean" ||
      typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)) ||
      typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) return null;
    const parsed = normalizeScheduleInput({ name: value.name, type: value.type, cadence: value.cadence, enabled: value.enabled });
    return { id, workspaceId, connectedAccountId, ...parsed, timezone: "Asia/Seoul", createdAt: value.createdAt, updatedAt: value.updatedAt };
  } catch {
    return null;
  }
}

async function readWorkspaceScheduleStore(env) {
  const stored = await getJson(env, WORKSPACE_SCHEDULES_KEY);
  if (stored === null) return { version: WORKSPACE_SCHEDULES_VERSION, schedules: [] };
  if (!stored || typeof stored !== "object" || Array.isArray(stored) || stored.version !== WORKSPACE_SCHEDULES_VERSION || !Array.isArray(stored.schedules)) {
    fail("Workspace schedule store is invalid", "workspace_schedule_store_invalid");
  }
  return { version: WORKSPACE_SCHEDULES_VERSION, schedules: stored.schedules };
}

async function writeWorkspaceScheduleStore(env, schedules) {
  await putJson(env, WORKSPACE_SCHEDULES_KEY, {
    version: WORKSPACE_SCHEDULES_VERSION,
    schedules,
  });
}

function publicWorkspaceSchedule(schedule) {
  return {
    id: schedule.id,
    name: schedule.name,
    type: schedule.type,
    enabled: schedule.enabled,
    timezone: schedule.timezone,
    cadence: { ...schedule.cadence },
    nextRunAt: null,
    lastRun: null,
    runtimeLastReceipt: null,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt,
  };
}

export async function listWorkspaceRuntimeSchedules(env, workspaceId) {
  const scope = normalizeWorkspaceId(workspaceId);
  const store = await readWorkspaceScheduleStore(env);
  return {
    schedules: store.schedules
      .map(normalizeStoredWorkspaceSchedule)
      .filter((schedule) => schedule?.workspaceId === scope)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(publicWorkspaceSchedule),
    runtimeExecutionEnabled: false,
  };
}

export async function getWorkspaceRuntimeSchedule(env, scheduleId, workspaceId) {
  const scope = normalizeWorkspaceId(workspaceId);
  const id = typeof scheduleId === "string" ? scheduleId.trim() : "";
  if (!id) return null;
  const store = await readWorkspaceScheduleStore(env);
  const schedule = store.schedules.map(normalizeStoredWorkspaceSchedule)
    .find((item) => item?.id === id && item.workspaceId === scope);
  return schedule || null;
}

export async function createWorkspaceRuntimeSchedule(env, input, { workspaceId, connectedAccountId, now = () => new Date().toISOString() } = {}) {
  const scope = normalizeWorkspaceId(workspaceId);
  const accountId = typeof connectedAccountId === "string" ? connectedAccountId.trim() : "";
  if (!accountId) fail("Workspace schedule account is invalid", "workspace_schedule_account_invalid");
  const parsed = normalizeScheduleInput(input);
  const store = await readWorkspaceScheduleStore(env);
  const timestamp = now();
  const schedule = {
    id: `workspace-schedule-${crypto.randomUUID()}`,
    workspaceId: scope,
    connectedAccountId: accountId,
    ...parsed,
    timezone: "Asia/Seoul",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await writeWorkspaceScheduleStore(env, [...store.schedules, schedule]);
  return publicWorkspaceSchedule(schedule);
}

export async function updateWorkspaceRuntimeSchedule(env, scheduleId, input, { workspaceId, now = () => new Date().toISOString() } = {}) {
  const scope = normalizeWorkspaceId(workspaceId);
  const parsed = normalizeScheduleInput(input, { partial: true });
  const store = await readWorkspaceScheduleStore(env);
  const index = store.schedules.findIndex((value) => {
    const schedule = normalizeStoredWorkspaceSchedule(value);
    return schedule?.id === scheduleId && schedule.workspaceId === scope;
  });
  if (index < 0) return null;
  const existing = normalizeStoredWorkspaceSchedule(store.schedules[index]);
  const updated = { ...existing, ...parsed, cadence: parsed.cadence || existing.cadence, updatedAt: now() };
  const schedules = [...store.schedules];
  schedules[index] = updated;
  await writeWorkspaceScheduleStore(env, schedules);
  return publicWorkspaceSchedule(updated);
}

export function getScheduleCoordinator(env) {
  if (!env?.SCHEDULE_COORDINATOR) {
    throw new Error("Runtime schedule coordinator is unavailable");
  }
  return env.SCHEDULE_COORDINATOR.getByName(COORDINATOR_NAME);
}

export async function listRuntimeSchedules(env) {
  return getScheduleCoordinator(env).listSchedules();
}

export async function getRuntimeScheduleCoordinatorStatus(env) {
  return getScheduleCoordinator(env).getCoordinatorStatus();
}

export async function reconcileRuntimeScheduleAlarm(env) {
  return getScheduleCoordinator(env).reconcileAlarm();
}

export async function createRuntimeSchedule(env, input) {
  return getScheduleCoordinator(env).createSchedule(input);
}

export async function updateRuntimeSchedule(env, scheduleId, input) {
  return getScheduleCoordinator(env).updateSchedule(scheduleId, input);
}
