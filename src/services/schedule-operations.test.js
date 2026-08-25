import assert from "node:assert/strict";
import { enrichScheduleOperations, getActualProductionNextRunAt, getNextActualProductionRun, normalizeScheduleHistory } from "./schedule-operations.js";

assert.equal(getActualProductionNextRunAt("08:10", Date.parse("2026-08-25T22:00:00.000Z")), "2026-08-25T23:10:00.000Z");
assert.equal(getActualProductionNextRunAt("11:30", Date.parse("2026-08-26T01:00:00.000Z")), "2026-08-26T02:30:00.000Z");
assert.equal(getActualProductionNextRunAt("08:10", Date.parse("2026-08-26T12:00:00.000Z")), "2026-08-26T23:10:00.000Z");
assert.deepEqual(getNextActualProductionRun(Date.parse("2026-08-26T12:00:00.000Z")), {
  type: "GENERAL_AUTO", time: "08:10", nextRunAt: "2026-08-26T23:10:00.000Z",
});

const history = [
  { cron: "10 23 * * *", status: "completed", scheduledTime: "2026-08-25T23:10:00.000Z", completedAt: "2026-08-25T23:11:00.000Z", error: "not exposed" },
  { cron: "30 11 * * *", status: "review_ready", scheduledTime: "2026-08-25T11:30:00.000Z", completedAt: "2026-08-25T11:31:00.000Z" },
];
assert.deepEqual(normalizeScheduleHistory(history), [
  { type: "GENERAL_AUTO", scheduledAt: "2026-08-25T23:10:00.000Z", completedAt: "2026-08-25T23:11:00.000Z", status: "SUCCESS", result: "게시 완료" },
  { type: "PRODUCT_REVIEW", scheduledAt: "2026-08-25T11:30:00.000Z", completedAt: "2026-08-25T11:31:00.000Z", status: "SUCCESS", result: "후보 생성 완료" },
]);
const [defaultSchedule, customSchedule] = enrichScheduleOperations([
  { id: "general-auto-0810", nextRunAt: null },
  { id: "custom", nextRunAt: "2026-08-26T01:00:00.000Z" },
], history, Date.parse("2026-08-25T22:00:00.000Z"));
assert.equal(defaultSchedule.actualProductionStatus, "CURRENTLY_OPERATING");
assert.equal(defaultSchedule.actualProductionLastRun.result, "게시 완료");
assert.equal(customSchedule.actualProductionStatus, "RUNTIME_PREPARING");
assert.equal(customSchedule.runtimeNextRunAt, "2026-08-26T01:00:00.000Z");
console.log("schedule operations fixture passed");
