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

const failureHistory = normalizeScheduleHistory([
  { operation: "auto_general", status: "failed", scheduledTime: "2026-08-25T23:10:00.000Z", completedAt: "2026-08-25T23:11:00.000Z", error: { code: "post_format_validation_failed", step: "similarity_validation", details: { reasons: ["recent_signature_repeated"], attempts: 2, targetPrompt: "must not be exposed" } } },
  { operation: "product_review", status: "failed", scheduledTime: "2026-08-25T11:30:00.000Z", completedAt: "2026-08-25T11:31:00.000Z", error: { name: "PostFormatError", message: "legacy product review format error" } },
  { operation: "auto_general", status: "failed", scheduledTime: "2026-08-25T02:30:00.000Z", completedAt: "2026-08-25T02:31:00.000Z", error: { name: "ProviderPayloadError", details: { token: "must not be exposed" } } },
]);
assert.deepEqual(failureHistory[0].failure, { stage: "CONTENT_FORMAT_VALIDATION", code: "post_format_validation_failed", message: "최근 게시물과 다른 글 구조를 만들지 못했습니다.", attempts: 2 });
assert.deepEqual(failureHistory[1].failure, { stage: "CONTENT_FORMAT_VALIDATION", code: "post_format_validation_failed", message: "최근 게시물과 다른 글 구조를 만들지 못했습니다." });
assert.deepEqual(failureHistory[2].failure, { stage: "UNKNOWN", code: "unknown_schedule_failure", message: "자동 실행 처리 중 문제가 발생했습니다." });
assert.equal(JSON.stringify(failureHistory).includes("must not be exposed"), false);
console.log("schedule operations fixture passed");
