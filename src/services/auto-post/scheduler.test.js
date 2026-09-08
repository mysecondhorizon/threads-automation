import assert from "node:assert/strict";
import { PostFormatError } from "../post-format.js";
import { getScheduledOperation, serializeSchedulerError } from "./scheduler.js";

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
