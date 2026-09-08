import assert from "node:assert/strict";
import { getRuntimeScheduleOperation, runRuntimeSchedule } from "./runtime-schedule-dispatcher.js";
assert.equal(getRuntimeScheduleOperation("GENERAL_AUTO"), "auto_general");
assert.equal(getRuntimeScheduleOperation("PRODUCT_REVIEW"), null);
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
await assert.rejects(
  () => runRuntimeSchedule({
    env: { test: true },
    schedule: { id: "product-review-2030", type: "PRODUCT_REVIEW" },
    scheduledFor: Date.now(),
  }),
  /Unsupported runtime schedule type/u,
);

let workspaceContextInput = null;
await runRuntimeSchedule({
  env: { test: true },
  schedule: {
    id: "workspace-schedule-a",
    type: "GENERAL_AUTO",
    workspaceId: "workspace-a",
    connectedAccountId: "threads-a",
  },
  scheduledFor: Date.parse("2026-08-26T23:10:00.000Z"),
  resolveContext: async (_env, input) => {
    workspaceContextInput = input;
    return Object.freeze({ ...input, connectedAccount: Object.freeze({ id: "threads-a", workspaceId: "workspace-a", platform: "THREADS", displayName: "A", active: true }) });
  },
  resolveCredential: async () => ({ credential: { access_token: "test-only" } }),
  run: async (_env, input) => { received = { input }; },
});
assert.deepEqual(workspaceContextInput, { workspaceId: "workspace-a", connectedAccountId: "threads-a" });
assert.equal(received.input.workspaceId, "workspace-a");
assert.equal(received.input.executionContext.connectedAccountId, "threads-a");

await assert.rejects(
  () => runRuntimeSchedule({
    env: { test: true },
    schedule: { id: "foreign", type: "GENERAL_AUTO", workspaceId: "workspace-a", connectedAccountId: "threads-b" },
    scheduledFor: Date.now(),
    resolveContext: async () => { throw new Error("connected_account_not_found"); },
    resolveCredential: async () => { throw new Error("should_not_read"); },
  }),
  /connected_account_not_found/u,
);
console.log("runtime schedule dispatcher fixture passed");
