import assert from "node:assert/strict";
import { SCHEDULER_MODE, enrichScheduleOperations, getActualProductionNextRunAt, getNextActualProductionRun, getProductionScheduleReadiness, normalizeScheduleHistory } from "./schedule-operations.js";

assert.equal(SCHEDULER_MODE, "RUNTIME_ACTIVE");
assert.equal(getActualProductionNextRunAt("08:10", Date.parse("2026-08-25T22:00:00.000Z")), "2026-08-25T23:10:00.000Z");
const schedules = [
  ["general-auto-0810", "GENERAL_AUTO", "08:10"], ["general-auto-1130", "GENERAL_AUTO", "11:30"], ["general-auto-1430", "GENERAL_AUTO", "14:30"], ["general-auto-1840", "GENERAL_AUTO", "18:40"], ["product-review-2030", "PRODUCT_REVIEW", "20:30"],
].map(([id, type, time]) => ({ id, type, enabled: true, cadence: { kind: "daily", time }, nextRunAt: null }));
assert.deepEqual(getProductionScheduleReadiness(schedules), { ready: true, expectedCount: 5, activeCount: 5, unavailable: [] });
assert.equal(getNextActualProductionRun(schedules, Date.parse("2026-08-26T12:00:00.000Z")).id, "general-auto-0810");
assert.equal(getNextActualProductionRun([{ ...schedules[0], enabled: false }], Date.parse("2026-08-25T22:00:00.000Z")), null);

const history = [
  { source: "runtime_scheduler", scheduleId: "general-auto-0810", operation: "auto_general", status: "completed", scheduledTime: "2026-08-25T23:10:00.000Z", completedAt: "2026-08-25T23:11:00.000Z" },
  { source: "runtime_scheduler", scheduleId: "product-review-2030", operation: "product_review", status: "review_ready", scheduledTime: "2026-08-25T11:30:00.000Z", completedAt: "2026-08-25T11:31:00.000Z" },
];
assert.deepEqual(normalizeScheduleHistory(history).map((run) => [run.type, run.result]), [["GENERAL_AUTO", "게시 완료"], ["PRODUCT_REVIEW", "후보 생성 완료"]]);
const [enabled, disabled] = enrichScheduleOperations([{ ...schedules[0] }, { ...schedules[1], enabled: false }], history, Date.parse("2026-08-25T22:00:00.000Z"));
assert.equal(enabled.actualProductionStatus, "CURRENTLY_OPERATING");
assert.equal(enabled.actualProductionLastRun.result, "게시 완료");
assert.equal(disabled.actualProductionStatus, "STOPPED");
assert.equal(disabled.actualProductionNextRunAt, null);
assert.equal(disabled.actualProductionLastRun, null);
console.log("schedule operations fixture passed");
