import assert from "node:assert/strict";
import { handleScheduleById, handleSchedulesCollection } from "./api-schedules.js";

function env(authenticated = true) { return { THREADS_KV: { async get(key) { return authenticated && key === "admin_session:session-1" ? "valid" : null; } } }; }
function request(url, method, body, authenticated = true) { return new Request(url, { method, headers: { ...(authenticated ? { cookie: "admin_session=session-1" } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
const schedules = [["general-auto-0810", "GENERAL_AUTO", "08:10"], ["general-auto-1130", "GENERAL_AUTO", "11:30"], ["general-auto-1430", "GENERAL_AUTO", "14:30"], ["general-auto-1840", "GENERAL_AUTO", "18:40"], ["product-review-2030", "PRODUCT_REVIEW", "20:30"]].map(([id, type, time]) => ({ id, name: id, type, enabled: true, cadence: { kind: "daily", time }, nextRunAt: "2026-08-26T23:10:00.000Z" }));
const runs = [
  { source: "runtime_scheduler", scheduleId: "general-auto-0810", operation: "auto_general", status: "completed", scheduledTime: "2026-08-25T23:10:00.000Z", completedAt: "2026-08-25T23:11:00.000Z", error: "must not be exposed" },
  { source: "runtime_scheduler", scheduleId: "product-review-2030", operation: "product_review", status: "review_ready", scheduledTime: "2026-08-25T11:30:00.000Z", completedAt: "2026-08-25T11:31:00.000Z" },
];
assert.equal((await handleSchedulesCollection(request("https://x/api/schedules", "GET", undefined, false), env(false))).status, 401);
const list = await handleSchedulesCollection(request("https://x/api/schedules", "GET"), env(), { list: async () => ({ schedules, runtimeExecutionEnabled: true }), history: async () => runs, now: () => Date.parse("2026-08-25T22:00:00.000Z") });
const listBody = await list.json();
assert.equal(listBody.schedulerMode, "RUNTIME_ACTIVE");
assert.equal(listBody.runtimeExecutionEnabled, true);
assert.equal(listBody.nextActualProductionRun.id, "general-auto-0810");
assert.equal(listBody.scheduleReadiness.ready, true);
assert.deepEqual(listBody.history.map((run) => [run.type, run.result]), [["GENERAL_AUTO", "게시 완료"], ["PRODUCT_REVIEW", "후보 생성 완료"]]);
assert.equal(listBody.history.some((run) => Object.hasOwn(run, "cron") || Object.hasOwn(run, "error") || Object.hasOwn(run, "scheduleId")), false);
assert.equal(listBody.schedules[0].actualProductionLastRun.result, "게시 완료");
const disabled = await handleSchedulesCollection(request("https://x/api/schedules", "GET"), env(), { list: async () => ({ schedules: schedules.map((schedule) => ({ ...schedule, enabled: false })), runtimeExecutionEnabled: true }), history: async () => [], now: () => Date.parse("2026-08-25T22:00:00.000Z") });
assert.equal((await disabled.json()).scheduleReadiness.ready, false);
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
