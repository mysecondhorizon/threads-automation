import assert from "node:assert/strict";
import {
  ScheduleCoordinator,
  getNextRunAt,
  getMostRecentScheduledFor,
  RUNTIME_SCHEDULER_EXECUTION_ENABLED,
} from "./schedule-coordinator.js";

class Storage {
  constructor() { this.values = new Map(); this.alarm = null; }
  async get(key) { return this.values.get(key); }
  async put(key, value) { if (key instanceof Map) for (const [entryKey, entryValue] of key) this.values.set(entryKey, entryValue); else this.values.set(key, value); }
  async list({ prefix }) { return new Map([...this.values].filter(([key]) => key.startsWith(prefix))); }
  async setAlarm(value) { this.alarm = value; }
  async deleteAlarm() { this.alarm = null; }
}

const fixedNow = Date.parse("2026-08-24T00:00:00.000Z"); // 09:00 Seoul
const enabled0810 = { enabled: true, cadence: { kind: "daily", time: "08:10" } };
const enabled1130 = { enabled: true, cadence: { kind: "daily", time: "11:30" } };
assert.equal(getNextRunAt(enabled0810, fixedNow), "2026-08-24T23:10:00.000Z");
assert.equal(getNextRunAt(enabled1130, fixedNow), "2026-08-24T02:30:00.000Z");
assert.equal(getMostRecentScheduledFor(enabled0810, fixedNow), Date.parse("2026-08-23T23:10:00.000Z"));

const storage = new Storage();
const coordinator = new ScheduleCoordinator({ storage }, {});
const seeded = await coordinator.listSchedules();
assert.equal(seeded.schedules.length, 5);
assert.equal(seeded.schedules.every((schedule) => schedule.enabled === false), true);
await coordinator.listSchedules();
assert.equal((await coordinator.listSchedules()).schedules.length, 5);

const created = await coordinator.createSchedule({ name: "검증 일정", type: "GENERAL_AUTO", cadence: { kind: "daily", time: "11:30" }, enabled: true });
assert.equal(created.timezone, "Asia/Seoul");
assert.ok(storage.alarm > Date.now());
await assert.rejects(
  () => coordinator.createSchedule({ name: "잘못된 일정", type: "GENERAL_AUTO", cadence: { kind: "daily", time: "25:00" }, enabled: false }),
  /HH:MM/u
);
await assert.rejects(
  () => coordinator.createSchedule({ name: "잘못된 일정", type: "GENERAL_AUTO", cadence: { kind: "daily", time: "08:10" }, cron: "* * * * *" }),
  /protected fields/u
);
const earlier = await coordinator.createSchedule({ name: "이른 일정", type: "PRODUCT_REVIEW", cadence: { kind: "daily", time: "08:10" }, enabled: true });
assert.ok(storage.alarm <= Date.parse(created.nextRunAt));
await coordinator.updateSchedule(earlier.id, { enabled: false });
assert.ok(storage.alarm > Date.now());
await coordinator.updateSchedule(created.id, { enabled: false });
assert.equal(storage.alarm, null);

const schedule = { id: "due", name: "due", type: "GENERAL_AUTO", enabled: true, cadence: { kind: "daily", time: "09:00" } };
const suppressed = await coordinator.processDueSchedule(schedule, fixedNow, fixedNow);
assert.equal(RUNTIME_SCHEDULER_EXECUTION_ENABLED, false);
assert.equal(suppressed.status, "SUPPRESSED");
assert.equal((await coordinator.processDueSchedule(schedule, fixedNow, fixedNow)).status, "SUPPRESSED");
await storage.put(`slot:success:${fixedNow}`, { scheduleId: "success", scheduledFor: fixedNow, status: "SUCCESS", completedAt: "2026-08-24T00:00:00.000Z" });
assert.equal((await coordinator.processDueSchedule({ ...schedule, id: "success" }, fixedNow, fixedNow)).status, "SUCCESS");
await storage.put(`slot:uncertain:${fixedNow}`, { scheduleId: "uncertain", scheduledFor: fixedNow, status: "UNCERTAIN", completedAt: null });
assert.equal((await coordinator.processDueSchedule({ ...schedule, id: "uncertain" }, fixedNow, fixedNow)).status, "UNCERTAIN");
const missed = await coordinator.processDueSchedule({ ...schedule, id: "missed" }, fixedNow - (16 * 60 * 1000), fixedNow);
assert.equal(missed.status, "MISSED");
console.log("schedule coordinator fixture passed");
