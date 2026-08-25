import { DurableObject } from "cloudflare:workers";
import { runRuntimeSchedule } from "../services/runtime-schedule-dispatcher.js";
import { isRuntimeSchedulerActive } from "../services/scheduler-ownership.js";

export const RUNTIME_SCHEDULER_EXECUTION_ENABLED = isRuntimeSchedulerActive();
export const RUNTIME_SCHEDULE_TIME_ZONE = "Asia/Seoul";
export const RUNTIME_SCHEDULE_GRACE_MS = 15 * 60 * 1000;

const SCHEDULE_PREFIX = "schedule:";
const SLOT_PREFIX = "slot:";
const SEEDED_KEY = "runtime-schedules:seeded:v1";
const SCHEDULE_TYPES = new Set(["GENERAL_AUTO", "PRODUCT_REVIEW"]);
const DEFAULT_SCHEDULES = [
  ["general-auto-0810", "General AUTO 08:10", "GENERAL_AUTO", "08:10"],
  ["general-auto-1130", "General AUTO 11:30", "GENERAL_AUTO", "11:30"],
  ["general-auto-1430", "General AUTO 14:30", "GENERAL_AUTO", "14:30"],
  ["general-auto-1840", "General AUTO 18:40", "GENERAL_AUTO", "18:40"],
  ["product-review-2030", "Product Review 후보 생성", "PRODUCT_REVIEW", "20:30"],
];

function nowIso() {
  return new Date().toISOString();
}

function scheduleKey(id) {
  return `${SCHEDULE_PREFIX}${id}`;
}

function slotKey(id, scheduledFor) {
  return `${SLOT_PREFIX}${id}:${scheduledFor}`;
}

function isValidTime(value) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/u.test(value)) return false;
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function normalizeName(value) {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name && name.length <= 120 ? name : null;
}

function scheduleId() {
  return `schedule-${crypto.randomUUID()}`;
}

function localSeoulParts(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RUNTIME_SCHEDULE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

function utcForSeoulDateTime(parts, time) {
  const [hour, minute] = time.split(":").map(Number);
  return Date.UTC(parts.year, parts.month - 1, parts.day, hour - 9, minute);
}

export function getNextRunAt(schedule, now = Date.now()) {
  if (!schedule?.enabled) return null;
  const parts = localSeoulParts(new Date(now));
  let next = utcForSeoulDateTime(parts, schedule.cadence.time);
  if (next <= now) next += 24 * 60 * 60 * 1000;
  return new Date(next).toISOString();
}

export function getMostRecentScheduledFor(schedule, now = Date.now()) {
  const parts = localSeoulParts(new Date(now));
  let scheduledFor = utcForSeoulDateTime(parts, schedule.cadence.time);
  if (scheduledFor > now) scheduledFor -= 24 * 60 * 60 * 1000;
  return scheduledFor;
}

export function validateCreateSchedule(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Schedule must be an object" };
  const allowed = new Set(["name", "type", "cadence", "enabled"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) return { error: "Schedule contains protected fields" };
  const name = normalizeName(input.name);
  if (!name) return { error: "name is required" };
  if (!SCHEDULE_TYPES.has(input.type)) return { error: "type is invalid" };
  if (!input.cadence || typeof input.cadence !== "object" || Array.isArray(input.cadence) ||
    Object.keys(input.cadence).some((key) => key !== "kind" && key !== "time") ||
    input.cadence.kind !== "daily" || !isValidTime(input.cadence.time)) {
    return { error: "cadence must be daily with a valid HH:MM time" };
  }
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") return { error: "enabled must be a boolean" };
  return { value: { name, type: input.type, enabled: input.enabled === true, cadence: { kind: "daily", time: input.cadence.time } } };
}

export function validateSchedulePatch(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || !Object.keys(input).length) return { error: "Schedule update must be an object" };
  const allowed = new Set(["name", "cadence", "enabled"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) return { error: "Only name, cadence, and enabled can be updated" };
  const value = {};
  if (Object.hasOwn(input, "name")) {
    value.name = normalizeName(input.name);
    if (!value.name) return { error: "name is required" };
  }
  if (Object.hasOwn(input, "enabled")) {
    if (typeof input.enabled !== "boolean") return { error: "enabled must be a boolean" };
    value.enabled = input.enabled;
  }
  if (Object.hasOwn(input, "cadence")) {
    if (!input.cadence || typeof input.cadence !== "object" || Array.isArray(input.cadence) ||
      Object.keys(input.cadence).some((key) => key !== "time") || !isValidTime(input.cadence.time)) {
      return { error: "cadence.time must be a valid HH:MM time" };
    }
    value.cadence = { kind: "daily", time: input.cadence.time };
  }
  return { value };
}

function publicSchedule(schedule, lastRun, now) {
  return {
    id: schedule.id,
    name: schedule.name,
    type: schedule.type,
    enabled: schedule.enabled === true,
    timezone: RUNTIME_SCHEDULE_TIME_ZONE,
    cadence: { ...schedule.cadence },
    nextRunAt: getNextRunAt(schedule, now),
    lastRun: lastRun ? {
      status: lastRun.status,
      scheduledFor: new Date(lastRun.scheduledFor).toISOString(),
      completedAt: lastRun.completedAt || null,
    } : null,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt,
  };
}

export class ScheduleCoordinator extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
  }

  async ensureSeeded() {
    if (await this.ctx.storage.get(SEEDED_KEY)) return;
    const timestamp = nowIso();
    const entries = Object.fromEntries(DEFAULT_SCHEDULES.map(([id, name, type, time]) => [
      scheduleKey(id),
      { id, name, type, enabled: false, timezone: RUNTIME_SCHEDULE_TIME_ZONE, cadence: { kind: "daily", time }, createdAt: timestamp, updatedAt: timestamp },
    ]));
    entries[SEEDED_KEY] = { seededAt: timestamp };
    await this.ctx.storage.put(entries);
  }

  async readSchedules() {
    await this.ensureSeeded();
    const entries = await this.ctx.storage.list({ prefix: SCHEDULE_PREFIX });
    return [...entries.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async getLastRun(scheduleId) {
    const entries = await this.ctx.storage.list({ prefix: `${SLOT_PREFIX}${scheduleId}:` });
    return [...entries.values()].sort((left, right) => right.scheduledFor - left.scheduledFor)[0] || null;
  }

  async listSchedules() {
    const now = Date.now();
    const schedules = await this.readSchedules();
    const records = await Promise.all(schedules.map(async (schedule) => publicSchedule(schedule, await this.getLastRun(schedule.id), now)));
    return { schedules: records, runtimeExecutionEnabled: RUNTIME_SCHEDULER_EXECUTION_ENABLED };
  }

  async createSchedule(input) {
    const parsed = validateCreateSchedule(input);
    if (parsed.error) throw new Error(parsed.error);
    const timestamp = nowIso();
    const schedule = { id: scheduleId(), ...parsed.value, timezone: RUNTIME_SCHEDULE_TIME_ZONE, createdAt: timestamp, updatedAt: timestamp };
    await this.ctx.storage.put(scheduleKey(schedule.id), schedule);
    await this.rescheduleAlarm();
    return publicSchedule(schedule, null, Date.now());
  }

  async updateSchedule(id, input) {
    const parsed = validateSchedulePatch(input);
    if (parsed.error) throw new Error(parsed.error);
    const schedule = await this.ctx.storage.get(scheduleKey(id));
    if (!schedule) return null;
    const updated = { ...schedule, ...parsed.value, cadence: parsed.value.cadence || schedule.cadence, updatedAt: nowIso() };
    await this.ctx.storage.put(scheduleKey(id), updated);
    await this.rescheduleAlarm();
    return publicSchedule(updated, await this.getLastRun(id), Date.now());
  }

  async rescheduleAlarm(now = Date.now()) {
    const nextTimes = (await this.readSchedules())
      .map((schedule) => getNextRunAt(schedule, now))
      .filter(Boolean)
      .map((value) => Date.parse(value));
    if (!nextTimes.length) {
      await this.ctx.storage.deleteAlarm();
      return null;
    }
    const next = Math.min(...nextTimes);
    await this.ctx.storage.setAlarm(next);
    return next;
  }

  async alarm() {
    const now = Date.now();
    const schedules = await this.readSchedules();
    for (const schedule of schedules.filter((item) => item.enabled)) {
      const scheduledFor = getMostRecentScheduledFor(schedule, now);
      if (scheduledFor > now) continue;
      await this.processDueSchedule(schedule, scheduledFor, now);
    }
    await this.rescheduleAlarm(now);
  }

  async processDueSchedule(schedule, scheduledFor, now) {
    if (!schedule?.enabled) return null;
    const key = slotKey(schedule.id, scheduledFor);
    const existing = await this.ctx.storage.get(key);
    if (existing) return existing;
    const startedAt = nowIso();
    if (now - scheduledFor > RUNTIME_SCHEDULE_GRACE_MS) {
      const receipt = { scheduleId: schedule.id, scheduledFor, status: "MISSED", startedAt, completedAt: nowIso() };
      await this.ctx.storage.put(key, receipt);
      return receipt;
    }
    if (!RUNTIME_SCHEDULER_EXECUTION_ENABLED) {
      const receipt = { scheduleId: schedule.id, scheduledFor, status: "SUPPRESSED", startedAt, completedAt: nowIso(), reason: "runtime_execution_disabled" };
      await this.ctx.storage.put(key, receipt);
      return receipt;
    }
    await this.ctx.storage.put(key, { scheduleId: schedule.id, scheduledFor, status: "RUNNING", startedAt, completedAt: null });
    try {
      await runRuntimeSchedule({ env: this.env, schedule, scheduledFor });
      const receipt = { scheduleId: schedule.id, scheduledFor, status: "SUCCESS", startedAt, completedAt: nowIso() };
      await this.ctx.storage.put(key, receipt);
      return receipt;
    } catch (error) {
      const receipt = { scheduleId: schedule.id, scheduledFor, status: "FAILED", startedAt, completedAt: nowIso(), error: String(error?.message || "runtime_schedule_failed").slice(0, 256) };
      await this.ctx.storage.put(key, receipt);
      return receipt;
    }
  }
}
