import assert from "node:assert/strict";
import { getRuntimeScheduleOperation } from "./runtime-schedule-dispatcher.js";
assert.equal(getRuntimeScheduleOperation("GENERAL_AUTO"), "auto_general");
assert.equal(getRuntimeScheduleOperation("PRODUCT_REVIEW"), "product_review");
assert.equal(getRuntimeScheduleOperation("unknown"), null);
console.log("runtime schedule dispatcher fixture passed");
