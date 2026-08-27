import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./schedule-coordinator.js", import.meta.url), "utf8");
assert.match(source, /class\s+ScheduleCoordinator\s+extends\s+DurableObject/u);
assert.match(source, /constructor\(ctx, env\)\s*\{\s*super\(ctx, env\);/u);
const testableSource = source
  .replace('import { DurableObject } from "cloudflare:workers";', 'class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }')
  .replace('import { runRuntimeSchedule } from "../services/runtime-schedule-dispatcher.js";', 'const runtimeCalls = []; const runRuntimeSchedule = async (input) => { runtimeCalls.push(input); return { ok: true }; };')
  .replace('import { isRuntimeSchedulerActive } from "../services/scheduler-ownership.js";', 'const isRuntimeSchedulerActive = () => false;')
  .concat('\nexport { runtimeCalls };');
const { ScheduleCoordinator, getNextRunAt, getMostRecentScheduledFor, RUNTIME_SCHEDULER_EXECUTION_ENABLED, runtimeCalls } = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(testableSource)}`);

class Storage {
  constructor() { this.values = new Map(); this.alarm = null; }
  async get(key) { return this.values.get(key); }
  async put(key, value) { if (typeof key === "string") { this.values.set(key, value); return; } for (const [entryKey, entryValue] of Object.entries(key)) this.values.set(entryKey, entryValue); }
  async list({ prefix }) { return new Map([...this.values].filter(([key]) => key.startsWith(prefix))); }
  async setAlarm(value) { this.alarm = value; }
  async deleteAlarm() { this.alarm = null; }
}

const fixedNow = Date.parse("2026-08-24T00:00:00.000Z");
const enabled0810 = { enabled: true, cadence: { kind: "daily", time: "08:10" } };
assert.equal(getNextRunAt(enabled0810, fixedNow), "2026-08-24T23:10:00.000Z");
assert.equal(getMostRecentScheduledFor(enabled0810, fixedNow), Date.parse("2026-08-23T23:10:00.000Z"));

const storage = new Storage();
const coordinator = new ScheduleCoordinator({ storage }, {});
assert.equal((await coordinator.listSchedules()).schedules.length, 5);
assert.equal(RUNTIME_SCHEDULER_EXECUTION_ENABLED, false);

const due = { id: "due", name: "due", type: "GENERAL_AUTO", enabled: true, cadence: { kind: "daily", time: "09:00" } };
const suppressed = await coordinator.processDueSchedule(due, fixedNow, fixedNow);
assert.equal(suppressed.status, "SUPPRESSED");
assert.equal((await coordinator.processDueSchedule(due, fixedNow, fixedNow)).status, "SUPPRESSED");
assert.equal(runtimeCalls.length, 0);
await storage.put(`slot:uncertain:${fixedNow}`, { scheduleId: "uncertain", scheduledFor: fixedNow, status: "UNCERTAIN" });
assert.equal((await coordinator.processDueSchedule({ ...due, id: "uncertain" }, fixedNow, fixedNow)).status, "UNCERTAIN");
assert.equal((await coordinator.processDueSchedule({ ...due, id: "missed" }, fixedNow - (16 * 60 * 1000), fixedNow)).status, "MISSED");
assert.equal(runtimeCalls.length, 0);

await storage.put(`slot:prior-suppressed:${fixedNow}`, { scheduleId: "prior-suppressed", scheduledFor: fixedNow, status: "SUPPRESSED" });
assert.equal((await coordinator.processDueSchedule({ ...due, id: "prior-suppressed" }, fixedNow, fixedNow)).status, "SUPPRESSED");
const future = fixedNow + (24 * 60 * 60 * 1000);
assert.equal((await coordinator.processDueSchedule({ ...due, id: "prior-suppressed" }, future, future)).status, "SUPPRESSED");
assert.equal(runtimeCalls.length, 0);
assert.equal(await coordinator.processDueSchedule({ ...due, id: "disabled", enabled: false }, fixedNow, fixedNow), null);
const configured = await coordinator.createSchedule({ name: "보존 일정", type: "GENERAL_AUTO", cadence: { kind: "daily", time: "09:30" }, enabled: true });
assert.equal((await coordinator.listSchedules()).schedules.find((schedule) => schedule.id === configured.id)?.enabled, true);
assert.equal(runtimeCalls.length, 0);
console.log("schedule coordinator fixture passed");
