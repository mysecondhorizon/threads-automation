import assert from "node:assert/strict";
import { handleScheduleById, handleSchedulesCollection } from "./api-schedules.js";

function env(authenticated = true) { return { THREADS_KV: { async get(key) { return authenticated && key === "admin_session:session-1" ? "valid" : null; } } }; }
function request(url, method, body, authenticated = true) { return new Request(url, { method, headers: { ...(authenticated ? { cookie: "admin_session=session-1" } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }

assert.equal((await handleSchedulesCollection(request("https://x/api/schedules", "GET", undefined, false), env(false))).status, 401);
const list = await handleSchedulesCollection(request("https://x/api/schedules", "GET"), env(), { list: async () => ({ schedules: [], runtimeExecutionEnabled: false }) });
assert.equal((await list.json()).runtimeExecutionEnabled, false);
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
const missing = await handleScheduleById(request("https://x/api/schedules/no", "PATCH", { enabled: false }), env(), "no", { update: async () => null });
assert.equal(missing.status, 404);
console.log("schedule API fixture passed");
