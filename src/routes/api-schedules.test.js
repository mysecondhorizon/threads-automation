import assert from "node:assert/strict";
import { handleScheduleById, handleScheduleReconcile, handleSchedulesCollection } from "./api-schedules.js";

function env(authenticated = true) { return { THREADS_KV: { async get(key) { return authenticated && key === "admin_session:session-1" ? "valid" : null; } } }; }
function request(url, method, body, authenticated = true) { return new Request(url, { method, headers: { ...(authenticated ? { cookie: "admin_session=session-1" } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
const runtimeReceipt = { status: "SUPPRESSED", scheduledFor: "2026-08-25T23:10:00.000Z", startedAt: "2026-08-25T23:10:01.000Z", completedAt: "2026-08-25T23:10:02.000Z", error: "must not be exposed" };
const schedules = [["general-auto-0810", "GENERAL_AUTO", "08:10"], ["general-auto-1130", "GENERAL_AUTO", "11:30"], ["general-auto-1430", "GENERAL_AUTO", "14:30"], ["general-auto-1840", "GENERAL_AUTO", "18:40"], ["product-review-2030", "PRODUCT_REVIEW", "20:30"]].map(([id, type, time], index) => ({ id, name: id, type, enabled: true, cadence: { kind: "daily", time }, nextRunAt: "2026-08-26T23:10:00.000Z", runtimeLastReceipt: index === 0 ? runtimeReceipt : null }));
const runs = [
  { cron: "10 23 * * *", status: "completed", scheduledTime: "2026-08-25T23:10:00.000Z", completedAt: "2026-08-25T23:11:00.000Z", error: "must not be exposed" },
  { cron: "30 11 * * *", status: "review_ready", scheduledTime: "2026-08-25T11:30:00.000Z", completedAt: "2026-08-25T11:31:00.000Z" },
];
assert.equal((await handleSchedulesCollection(request("https://x/api/schedules", "GET", undefined, false), env(false))).status, 401);
const coordinatorStatus = { alarmScheduled: true, alarmAt: "2026-08-25T23:10:00.000Z", coordinatorTime: "2026-08-25T22:00:00.000Z", earliestEnabledNextRunAt: "2026-08-25T23:10:00.000Z", enabledScheduleCount: 5, lastReceipt: { scheduleId: "general-auto-0810", ...runtimeReceipt, storageKey: "must not be exposed" }, durableObjectId: "must not be exposed" };
const list = await handleSchedulesCollection(request("https://x/api/schedules", "GET"), env(), { list: async () => ({ schedules, runtimeExecutionEnabled: true }), status: async () => coordinatorStatus, history: async () => runs, now: () => Date.parse("2026-08-25T22:00:00.000Z") });
const listBody = await list.json();
assert.equal(listBody.schedulerMode, "LEGACY_ACTIVE_RUNTIME_PREPARING");
assert.equal(listBody.runtimeExecutionEnabled, false);
assert.equal(listBody.nextActualProductionRun.id, "general-auto-0810");
assert.equal(listBody.nextActualProductionRun.nextRunAt, "2026-08-25T23:10:00.000Z");
assert.equal(listBody.scheduleReadiness.ready, true);
const productionOverviewSource = listBody.schedules
  .filter((schedule) => schedule.actualProductionStatus === "RUNTIME_PREPARING" && schedule.actualProductionNextRunAt)
  .map((schedule) => [schedule.type, schedule.cadence.time]);
assert.deepEqual(productionOverviewSource, [
  ["GENERAL_AUTO", "08:10"],
  ["GENERAL_AUTO", "11:30"],
  ["GENERAL_AUTO", "14:30"],
  ["GENERAL_AUTO", "18:40"],
  ["PRODUCT_REVIEW", "20:30"],
]);
assert.deepEqual(listBody.coordinatorStatus, {
  alarmScheduled: true,
  alarmAt: "2026-08-25T23:10:00.000Z",
  coordinatorTime: "2026-08-25T22:00:00.000Z",
  earliestEnabledNextRunAt: "2026-08-25T23:10:00.000Z",
  enabledScheduleCount: 5,
  lastReceipt: { scheduleId: "general-auto-0810", status: "SUPPRESSED", scheduledFor: "2026-08-25T23:10:00.000Z", startedAt: "2026-08-25T23:10:01.000Z", completedAt: "2026-08-25T23:10:02.000Z" },
  health: "HEALTHY",
});
assert.deepEqual(listBody.history.map((run) => [run.type, run.result]), [["GENERAL_AUTO", "게시 완료"], ["PRODUCT_REVIEW", "후보 생성 완료"]]);
assert.equal(listBody.history.some((run) => Object.hasOwn(run, "cron") || Object.hasOwn(run, "error") || Object.hasOwn(run, "scheduleId")), false);
assert.equal(listBody.schedules[0].actualProductionLastRun.result, "게시 완료");
assert.equal(listBody.schedules[0].actualProductionStatus, "RUNTIME_PREPARING");
assert.deepEqual(listBody.schedules[0].runtimeLastReceipt, { status: "SUPPRESSED", scheduledFor: "2026-08-25T23:10:00.000Z", startedAt: "2026-08-25T23:10:01.000Z", completedAt: "2026-08-25T23:10:02.000Z" });
assert.equal(JSON.stringify(listBody).includes("must not be exposed"), false);
assert.equal(listBody.schedules.every((schedule) => schedule.enabled === true), true);
const failedRuns = [{ cron: "10 23 * * *", status: "failed", scheduledTime: "2026-08-25T23:10:00.000Z", completedAt: "2026-08-25T23:11:00.000Z", error: { code: "post_format_validation_failed", step: "similarity_validation", details: { reasons: ["recent_signature_repeated"], attempts: 2, generatedText: "must not be exposed" } } }];
const failed = await handleSchedulesCollection(request("https://x/api/schedules", "GET"), env(), { list: async () => ({ schedules, runtimeExecutionEnabled: false }), status: async () => coordinatorStatus, history: async () => failedRuns, now: () => Date.parse("2026-08-25T22:00:00.000Z") });
const failedBody = await failed.json();
assert.deepEqual(failedBody.history[0].failure, { stage: "CONTENT_FORMAT_VALIDATION", code: "post_format_validation_failed", message: "최근 게시물과 다른 글 구조를 만들지 못했습니다.", attempts: 2 });
assert.deepEqual(failedBody.schedules[0].actualProductionLastRun.failure, failedBody.history[0].failure);
assert.equal(JSON.stringify(failedBody).includes("must not be exposed"), false);
const disabled = await handleSchedulesCollection(request("https://x/api/schedules", "GET"), env(), { list: async () => ({ schedules: schedules.map((schedule) => ({ ...schedule, enabled: false })), runtimeExecutionEnabled: true }), status: async () => ({ alarmScheduled: false, alarmAt: null, coordinatorTime: "2026-08-25T22:00:00.000Z", earliestEnabledNextRunAt: null, enabledScheduleCount: 0, lastReceipt: null }), history: async () => [], now: () => Date.parse("2026-08-25T22:00:00.000Z") });
assert.equal((await disabled.json()).scheduleReadiness.ready, false);
assert.equal((await handleScheduleReconcile(request("https://x/api/schedules/reconcile", "POST", undefined, false), env(false))).status, 401);
let reconcileCalls = 0;
const reconciled = await handleScheduleReconcile(request("https://x/api/schedules/reconcile", "POST"), env(), { reconcile: async () => { reconcileCalls += 1; return { reconciled: true, before: { alarmScheduled: false }, after: coordinatorStatus }; } });
assert.equal(reconciled.status, 200);
const reconciledBody = await reconciled.json();
assert.equal(reconcileCalls, 1);
assert.equal(reconciledBody.status.reconciled, true);
assert.equal(reconciledBody.status.health, "HEALTHY");
assert.equal(JSON.stringify(reconciledBody).includes("before"), false);
let createInput = null;
const valid = { name: "아침", type: "GENERAL_AUTO", cadence: { kind: "daily", time: "08:10" }, enabled: false };
const created = await handleSchedulesCollection(request("https://x/api/schedules", "POST", valid), env(), { create: async (_env, input) => { createInput = input; return { id: "one", ...input, timezone: "Asia/Seoul" }; } });
assert.equal(created.status, 201);
assert.deepEqual(createInput, valid);
const invalid = await handleSchedulesCollection(request("https://x/api/schedules", "POST", { ...valid, cron: "* * * * *" }), env(), { create: async () => { throw new Error("Schedule contains protected fields"); } });
assert.equal(invalid.status, 400);
let patchInput = null;
const patched = await handleScheduleById(request("https://x/api/schedules/one", "PATCH", { enabled: true }), env(), "one", { update: async (_env, id, input) => { patchInput = { id, input }; return { id, ...input }; } });
assert.equal(patched.status, 200);
assert.deepEqual(patchInput, { id: "one", input: { enabled: true } });
console.log("schedule API fixture passed");
