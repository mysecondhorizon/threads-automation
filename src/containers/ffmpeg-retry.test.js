import assert from "node:assert/strict";
import { shouldRetryFfmpeg } from "./ffmpeg-retry.js";

assert.equal(
  shouldRetryFfmpeg({ attempt: 1, exitCode: 255, stderrTail: "", stderrReadError: null }),
  true,
  "first 255 exit with empty stderr retries"
);
assert.equal(
  shouldRetryFfmpeg({ attempt: 1, exitCode: 255, stderrTail: "ffmpeg error", stderrReadError: null }),
  false,
  "non-empty stderr does not retry"
);
assert.equal(
  shouldRetryFfmpeg({ attempt: 1, exitCode: 1, stderrTail: "", stderrReadError: null }),
  false,
  "other nonzero exits do not retry"
);
assert.equal(
  shouldRetryFfmpeg({ attempt: 2, exitCode: 255, stderrTail: "", stderrReadError: null }),
  false,
  "second 255 exit never starts a third attempt"
);
assert.equal(
  shouldRetryFfmpeg({ attempt: 1, exitCode: 255, stderrTail: "", stderrReadError: null }),
  true,
  "first failed attempt qualifies for retry"
);
assert.equal(
  shouldRetryFfmpeg({ attempt: 2, exitCode: 0, stderrTail: "", stderrReadError: null }),
  false,
  "second successful attempt continues without another retry"
);

console.log("ffmpeg retry decision fixtures passed");
