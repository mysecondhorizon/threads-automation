import assert from "node:assert/strict";
import { SCHEDULER_MODE, enrichScheduleOperations, getActualProductionNextRunAt, getNextActualProductionRun, getProductionScheduleReadiness, normalizeScheduleHistory } from "./schedule-operations.js";

assert.equal(SCHEDULER_MODE, "LEGACY_ACTIVE_RUNTIME_PREPARING");
assert.equal(getActualProductionNextRunAt("08:10", Date.parse("2026-08-25T22:00:00.000Z")), "2026-08-25T23:10:00.000Z");
const schedules = [
  ["general-auto-0810", "GENERAL_AUTO", "08:10"], ["general-auto-1130", "GENERAL_AUTO", "11:30"], ["general-auto-1430", "GENERAL_AUTO", "14:30"], ["general-auto-1840", "GENERAL_AUTO", "18:40"], ["product-review-2030", "PRODUCT_REVIEW", "20:30"],
].map(([id, type, time]) => ({ id, type, enabled: true, cadence: { kind: "daily", time }, nextRunAt: null }));
assert.deepEqual(getProductionScheduleReadiness(schedules), { ready: true, expectedCount: 5, activeCount: 5, unavailable: [] });
assert.equal(getNextActualProductionRun(schedules, Date.parse("2026-08-26T12:00:00.000Z")).id, "general-auto-0810");
assert.equal(getNextActualProductionRun([{ ...schedules[0], enabled: false }], Date.parse("2026-08-25T22:00:00.000Z")).nextRunAt, "2026-08-25T23:10:00.000Z");

const history = [
  { cron: "10 23 * * *", status: "completed", scheduledTime: "2026-08-25T23:10:00.000Z", completedAt: "2026-08-25T23:11:00.000Z" },
  { cron: "30 11 * * *", status: "review_ready", scheduledTime: "2026-08-25T11:30:00.000Z", completedAt: "2026-08-25T11:31:00.000Z" },
];
assert.deepEqual(normalizeScheduleHistory(history).map((run) => [run.type, run.result]), [["GENERAL_AUTO", "게시 완료"], ["PRODUCT_REVIEW", "후보 생성 완료"]]);
const [enabled, disabled] = enrichScheduleOperations([{ ...schedules[0], cadence: { kind: "daily", time: "09:45" } }, { ...schedules[1], enabled: false }], history, Date.parse("2026-08-25T22:00:00.000Z"));
assert.equal(enabled.actualProductionStatus, "RUNTIME_PREPARING");
assert.equal(enabled.actualProductionLastRun.result, "게시 완료");
assert.equal(enabled.actualProductionNextRunAt, "2026-08-25T23:10:00.000Z");
assert.equal(disabled.actualProductionStatus, "RUNTIME_PREPARING");
assert.equal(disabled.actualProductionNextRunAt, "2026-08-26T02:30:00.000Z");
assert.equal(disabled.actualProductionLastRun, null);
console.log("schedule operations fixture passed");
