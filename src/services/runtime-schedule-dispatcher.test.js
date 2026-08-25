import assert from "node:assert/strict";
import { getRuntimeScheduleOperation, runRuntimeSchedule } from "./runtime-schedule-dispatcher.js";
assert.equal(getRuntimeScheduleOperation("GENERAL_AUTO"), "auto_general");
assert.equal(getRuntimeScheduleOperation("PRODUCT_REVIEW"), "product_review");
assert.equal(getRuntimeScheduleOperation("unknown"), null);
let received = null;
await runRuntimeSchedule({
  env: { test: true },
  schedule: { id: "general-auto-0810", type: "GENERAL_AUTO" },
  scheduledFor: Date.parse("2026-08-26T23:10:00.000Z"),
  run: async (env, input) => { received = { env, input }; return { ok: true }; },
});
assert.equal(received.input.operation, "auto_general");
assert.equal(received.input.source, "runtime_scheduler");
assert.equal(received.input.scheduleId, "general-auto-0810");
assert.equal(received.input.scheduledTime.toISOString(), "2026-08-26T23:10:00.000Z");
await runRuntimeSchedule({
  env: { test: true },
  schedule: { id: "product-review-2030", type: "PRODUCT_REVIEW" },
  scheduledFor: Date.parse("2026-08-26T11:30:00.000Z"),
  run: async (_env, input) => { received = { input }; },
});
assert.equal(received.input.operation, "product_review");
assert.equal(received.input.scheduleId, "product-review-2030");
console.log("runtime schedule dispatcher fixture passed");
