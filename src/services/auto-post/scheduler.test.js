import assert from "node:assert/strict";
import { PostFormatError } from "../post-format.js";
import { getScheduledOperation, serializeSchedulerError, runScheduledAutoPost } from "./scheduler.js";

const formatError = new PostFormatError("internal format detail must stay internal", {
  code: "post_format_validation_failed",
  details: {
    reasons: ["recent_signature_repeated", "no_feasible_target_format"],
    attempts: 2,
    exhausted: true,
    targetPrompt: "must not be copied into the stored scheduler metadata",
  },
});
const serialized = serializeSchedulerError(formatError);
assert.deepEqual(serialized, {
  name: "PostFormatError",
  code: "post_format_validation_failed",
  status: 409,
  step: "format_validation",
  message: "internal format detail must stay internal",
  details: {
    reasons: ["recent_signature_repeated", "no_feasible_target_format"],
    exhausted: true,
    attempts: 2,
  },
});

assert.equal(getScheduledOperation("10 23 * * *"), "auto_general");
assert.equal(getScheduledOperation("30 11 * * *"), null);
assert.equal(getScheduledOperation("unknown"), null);
console.log("scheduler error serialization fixture passed");

// Enabling measurement must not alter scoped generation, guard inputs or
// prevent an otherwise permitted publish after a collection failure.
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { assert.fail("scheduler regression must not make live API calls"); };
try {
  for (const refreshFails of [false, true]) {
    const values = new Map();
    const env = { THREADS_KV: {
      async get(key, type) { const value = values.get(key); return value === undefined ? null : type === "json" ? JSON.parse(value) : value; },
      async put(key, value) { values.set(key, value); },
      async list() { return { keys:[] }; },
    } };
    const executionContext = { workspaceId:"workspace-a", connectedAccountId:"account-a" };
    const calls = [];
    const result = await runScheduledAutoPost(env, {
      operation:"auto_general", workspaceId:"workspace-a", executionContext,
      services: {
        async syncThreadsData(_env, options) {
          calls.push("sync");
          assert.deepEqual(options, { workspaceId:"workspace-a", executionContext });
          if (refreshFails) throw new Error("fixture refresh failure");
          return { sync:{ deleted:0 }, insights:{ refreshed:1 } };
        },
        async executeAutoPost(_env, options) {
          calls.push("execute");
          assert.deepEqual(options, { source:"cron_auto_general", generalOnly:true, workspaceId:"workspace-a", executionContext });
          return { executionId:"execution-fixture", post_id:"post-fixture", source:"cron_auto_general" };
        },
      },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(calls, ["sync", "execute"]);
    assert.equal(result.sync === null, refreshFails);
  }
} finally {
  globalThis.fetch = realFetch;
}
console.log("scoped scheduler insight collection fixtures passed");
