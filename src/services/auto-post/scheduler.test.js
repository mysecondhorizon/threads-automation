import assert from "node:assert/strict";
import { PostFormatError } from "../post-format.js";
import { serializeSchedulerError } from "./scheduler.js";
import { runScheduledAutoPost } from "./scheduler.js";

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

const values = new Map();
const env = {
  THREADS_KV: {
    async get(key, type) { const value = values.get(key) ?? null; return type === "json" && value !== null ? JSON.parse(value) : value; },
    async put(key, value) { values.set(key, value); },
  },
};
let candidateWorkspaceId = null;
await runScheduledAutoPost(env, {
  operation: "product_review",
  source: "runtime_scheduler",
  scheduleId: "workspace-review",
  workspaceId: "workspace-a",
  executionContext: Object.freeze({ workspaceId: "workspace-a", connectedAccountId: "threads-a" }),
  services: {
    generateProductReviewCandidate: async (_env, _input, workspaceId) => {
      candidateWorkspaceId = workspaceId;
      return { id: "candidate-a", generation: { attempts: 1 } };
    },
  },
});
assert.equal(candidateWorkspaceId, "workspace-a");
const saved = JSON.parse(values.get("auto_post_schedule_history")).runs[0];
assert.equal(saved.workspaceId, "workspace-a");
assert.equal(saved.published, false);
console.log("scheduler error serialization fixture passed");
