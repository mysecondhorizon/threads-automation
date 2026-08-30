import assert from "node:assert/strict";

import {
  buildSchedulesDiagnosticsClientScript,
} from "./app-schedules-diagnostics-client.js";

const script = buildSchedulesDiagnosticsClientScript();

assert.match(script, /최근 General AUTO 진단/u);
assert.match(script, /General AUTO 진단 정보를 불러오는 중/u);
assert.match(script, /최근 General AUTO 진단 기록이 없습니다/u);
assert.match(script, /General AUTO 진단 정보를 불러오지 못했습니다/u);
assert.match(script, /recentGeneralAutoExecutions/u);
assert.match(script, /attempt\.draftText/u);
assert.match(script, /attempt\.similarity\?\.matchedPostText/u);
assert.match(script, /textContent/u);
assert.doesNotMatch(script, /innerHTML/u);

console.log("app schedules diagnostics client fixtures passed");
