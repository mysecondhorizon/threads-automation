import assert from "node:assert/strict";
import { PostFormatError } from "../post-format.js";
import { serializeSchedulerError } from "./scheduler.js";

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
console.log("scheduler error serialization fixture passed");
