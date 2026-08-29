import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./schedule-coordinator.js", import.meta.url), "utf8");
assert.match(source, /class\s+ScheduleCoordinator\s+extends\s+DurableObject/u);
assert.match(source, /constructor\(ctx, env\)\s*\{\s*super\(ctx, env\);/u);
const testableSource = source
  .replace('import { DurableObject } from "cloudflare:workers";', 'class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }')
  .replace('import { runRuntimeSchedule } from "../services/runtime-schedule-dispatcher.js";', 'const runtimeCalls = []; const runRuntimeSchedule = async (input) => { runtimeCalls.push(input); return { ok: true }; };')
  .replace('import { isRuntimeSchedulerActive } from "../services/scheduler-ownership.js";', 'const isRuntimeSchedulerActive = () => false;')
  .replace('import { getScheduleRuns } from "../services/auto-post/schedule-store.js";', 'const historyRuns = []; const getScheduleRuns = async () => historyRuns;')
  .concat('\nexport { runtimeCalls, historyRuns };');
const { ScheduleCoordinator, getNextRunAt, getMostRecentScheduledFor, RUNTIME_SCHEDULER_EXECUTION_ENABLED, RUNTIME_RECEIPT_STALE_MS, runtimeCalls, historyRuns } = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(testableSource)}`);

class Storage {
  constructor() { this.values = new Map(); this.alarm = null; this.setAlarmCalls = []; this.deleteAlarmCalls = 0; }
  async get(key) { return this.values.get(key); }
  async put(key, value) { if (typeof key === "string") { this.values.set(key, value); return; } for (const [entryKey, entryValue] of Object.entries(key)) this.values.set(entryKey, entryValue); }
  async list({ prefix }) { return new Map([...this.values].filter(([key]) => key.startsWith(prefix))); }
  async getAlarm() { return this.alarm; }
  async setAlarm(value) { this.alarm = value; this.setAlarmCalls.push(value); }
  async deleteAlarm() { this.alarm = null; this.deleteAlarmCalls += 1; }
}

const fixedNow = Date.parse("2026-08-24T00:00:00.000Z");
const enabled0810 = { enabled: true, cadence: { kind: "daily", time: "08:10" } };
assert.equal(getNextRunAt(enabled0810, fixedNow), "2026-08-24T23:10:00.000Z");
assert.equal(getMostRecentScheduledFor(enabled0810, fixedNow), Date.parse("2026-08-23T23:10:00.000Z"));

const storage = new Storage();
const coordinator = new ScheduleCoordinator({ storage }, {});
const seeded = await coordinator.listSchedules();
assert.equal(seeded.schedules.length, 5);
assert.equal(seeded.schedules.every((schedule) => schedule.enabled === false), true);
assert.equal(RUNTIME_SCHEDULER_EXECUTION_ENABLED, false);

const originalDateNow = Date.now;
Date.now = () => fixedNow;
try {
  const scheduleId = seeded.schedules[0].id;
  const enabled = await coordinator.updateSchedule(scheduleId, { enabled: true, cadence: { time: "09:00" } });
  const expectedAlarm = Date.parse(enabled.nextRunAt);
  assert.equal(storage.alarm, expectedAlarm);
  assert.equal(storage.setAlarmCalls.at(-1), expectedAlarm);

  const initialStatus = await coordinator.getCoordinatorStatus();
  assert.equal(initialStatus.alarmScheduled, true);
  assert.equal(initialStatus.alarmAt, enabled.nextRunAt);
  assert.equal(initialStatus.earliestEnabledNextRunAt, enabled.nextRunAt);
  assert.equal(initialStatus.enabledScheduleCount, 1);
  assert.equal(initialStatus.lastReceipt, null);

  storage.alarm = null;
  storage.setAlarmCalls.length = 0;
  const missing = await coordinator.reconcileAlarm();
  assert.equal(missing.reconciled, true);
  assert.equal(missing.before.alarmScheduled, false);
  assert.equal(missing.after.alarmAt, enabled.nextRunAt);
  assert.deepEqual(storage.setAlarmCalls, [expectedAlarm]);

  storage.alarm = expectedAlarm + 60_000;
  storage.setAlarmCalls.length = 0;
  const wrong = await coordinator.reconcileAlarm();
  assert.equal(wrong.reconciled, true);
  assert.deepEqual(storage.setAlarmCalls, [expectedAlarm]);

  storage.alarm = expectedAlarm;
  storage.setAlarmCalls.length = 0;
  const correct = await coordinator.reconcileAlarm();
  assert.equal(correct.reconciled, false);
  assert.deepEqual(storage.setAlarmCalls, []);

  storage.alarm = fixedNow;
  await coordinator.alarm();
  assert.equal(runtimeCalls.length, 0);
  assert.equal(storage.alarm, expectedAlarm);
  const afterAlarm = await coordinator.listSchedules();
  const receipt = afterAlarm.schedules.find((schedule) => schedule.id === scheduleId).runtimeLastReceipt;
  assert.equal(receipt.status, "SUPPRESSED");
  assert.equal(receipt.scheduledFor, new Date(fixedNow).toISOString());
  assert.equal(afterAlarm.schedules.find((schedule) => schedule.id === scheduleId).enabled, true);
  const statusWithReceipt = await coordinator.getCoordinatorStatus();
  assert.equal(statusWithReceipt.lastReceipt.scheduleId, scheduleId);
  assert.equal(statusWithReceipt.lastReceipt.status, "SUPPRESSED");

  await coordinator.updateSchedule(scheduleId, { enabled: false });
  storage.alarm = expectedAlarm;
  const deleteCallsBefore = storage.deleteAlarmCalls;
  const inactive = await coordinator.reconcileAlarm();
  assert.equal(inactive.reconciled, true);
  assert.equal(inactive.after.alarmScheduled, false);
  assert.equal(inactive.after.enabledScheduleCount, 0);
  assert.equal(storage.deleteAlarmCalls, deleteCallsBefore + 1);
} finally {
  Date.now = originalDateNow;
}

const recoveryStorage = new Storage();
const recoveryCoordinator = new ScheduleCoordinator({ storage: recoveryStorage }, {});
const recoverySchedules = await recoveryCoordinator.readSchedules();
const recoverySchedule = recoverySchedules[0];
const scheduledFor = fixedNow;
const scheduledForIso = new Date(scheduledFor).toISOString();
const recentKey = `slot:${recoverySchedule.id}:${scheduledForIso}`;
await recoveryStorage.put(recentKey, { scheduleId: recoverySchedule.id, scheduledFor, status: "RUNNING", startedAt: new Date(fixedNow - RUNTIME_RECEIPT_STALE_MS + 1).toISOString(), completedAt: null });
await recoveryCoordinator.recoverStaleReceipts(recoverySchedules, fixedNow);
assert.equal((await recoveryStorage.get(recentKey)).status, "RUNNING");

const successKey = `slot:${recoverySchedule.id}:${scheduledForIso}:success`;
await recoveryStorage.put(successKey, { scheduleId: recoverySchedule.id, scheduledFor, status: "RUNNING", startedAt: new Date(fixedNow - RUNTIME_RECEIPT_STALE_MS).toISOString(), completedAt: null });
historyRuns.push({ source: "runtime_scheduler", scheduleId: recoverySchedule.id, operation: "auto_general", scheduledTime: scheduledForIso, completedAt: "2026-08-24T00:01:00.000Z", status: "completed" });
assert.deepEqual(await recoveryCoordinator.recoverStaleReceipts(recoverySchedules, fixedNow), { recovered: 1 });
assert.equal((await recoveryStorage.get(successKey)).status, "SUCCESS");
assert.equal((await recoveryStorage.get(successKey)).completedAt, "2026-08-24T00:01:00.000Z");
assert.deepEqual(await recoveryCoordinator.recoverStaleReceipts(recoverySchedules, fixedNow), { recovered: 0 });

const failedScheduledFor = fixedNow - 24 * 60 * 60 * 1000;
const failedScheduledForIso = new Date(failedScheduledFor).toISOString();
const failureKey = `slot:${recoverySchedule.id}:${failedScheduledForIso}:failure`;
await recoveryStorage.put(failureKey, { scheduleId: recoverySchedule.id, scheduledFor: failedScheduledFor, status: "RUNNING", startedAt: new Date(fixedNow - RUNTIME_RECEIPT_STALE_MS).toISOString(), completedAt: null });
historyRuns.push({ source: "runtime_scheduler", scheduleId: recoverySchedule.id, operation: "auto_general", scheduledTime: failedScheduledForIso, completedAt: "2026-08-24T00:02:00.000Z", status: "failed" });
await recoveryCoordinator.recoverStaleReceipts(recoverySchedules, fixedNow);
assert.equal((await recoveryStorage.get(failureKey)).status, "FAILED");

const uncertainKey = `slot:${recoverySchedule.id}:${scheduledForIso}:uncertain`;
await recoveryStorage.put(uncertainKey, { scheduleId: recoverySchedule.id, scheduledFor: fixedNow - 2 * 24 * 60 * 60 * 1000, status: "RUNNING", startedAt: new Date(fixedNow - RUNTIME_RECEIPT_STALE_MS).toISOString(), completedAt: null });
await recoveryCoordinator.recoverStaleReceipts(recoverySchedules, fixedNow);
assert.equal((await recoveryStorage.get(uncertainKey)).status, "UNCERTAIN");
assert.equal(runtimeCalls.length, 0);
console.log("schedule coordinator fixture passed");
