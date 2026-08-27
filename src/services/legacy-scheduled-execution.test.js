import assert from "node:assert/strict";
import { handleLegacyScheduledExecution } from "./legacy-scheduled-execution.js";
import { SCHEDULER_MODE } from "./scheduler-ownership.js";

let calls = 0;
const env = {};
const controller = { cron: "10 23 * * *", scheduledTime: new Date("2026-08-26T23:10:00.000Z") };
assert.equal(SCHEDULER_MODE, "LEGACY_ACTIVE_RUNTIME_PREPARING");
const suppressed = await handleLegacyScheduledExecution(env, controller, {
  mode: "RUNTIME_ACTIVE",
  run: async () => { calls += 1; },
});
assert.deepEqual(suppressed, { suppressed: true });
assert.equal(calls, 0);
const fallback = await handleLegacyScheduledExecution(env, controller, {
  run: async (receivedEnv, input) => { calls += 1; return { receivedEnv, input }; },
});
assert.equal(calls, 1);
assert.equal(fallback.input.cron, "10 23 * * *");
assert.equal(fallback.input.scheduledTime, controller.scheduledTime);
console.log("legacy scheduler ownership fixture passed");
