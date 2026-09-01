import assert from "node:assert/strict";

import {
  discoverCurrentTopics,
  getEligibleCurrentTopics,
  prioritizeCurrentTopics,
} from "./current-topic-inventory.js";

const at = new Date("2026-09-01T00:00:00.000Z");
const expiresAt = "2026-09-02T12:00:00.000Z";

function topic({
  category = "consumer_lifestyle",
  subject,
  personaRelevance = "일상에서 비용과 시간을 생각하며 선택하기 좋은 소재",
  allowedAngles = ["내 경험과 의견을 한두 문장으로 덧붙이는 관점"],
} = {}) {
  return {
    category,
    subject,
    capturedAt: at.toISOString(),
    expiresAt,
    verifiedFacts:[`${subject}에 관한 현재 확인 정보`],
    talkingPoints:[`${subject}이 지금 생활에 주는 변화`],
    personaRelevance,
    allowedAngles,
    forbiddenClaims:[],
    sourceReferences:[{ url:"https://example.test/topic", title:"Current topic source" }],
  };
}

const digitalHeavy = [
  "AI assistant update", "smartphone feature", "device launch", "digital service change", "app update", "new phone specification",
].map((subject) => topic({ category:"ai_digital", subject }));
const balanced = prioritizeCurrentTopics([
  ...digitalHeavy,
  topic({ subject:"coffee price and commute routine" }),
  topic({ subject:"weekend travel outing planning" }),
  topic({ category:"light_culture", subject:"OTT subscription price change" }),
], { at });
assert.equal(balanced.filter((value) => value.category === "ai_digital").length, 3);
assert.equal(balanced.some((value) => value.subject === "coffee price and commute routine"), true);
assert.equal(balanced.some((value) => value.subject === "weekend travel outing planning"), true);
assert.equal(balanced.some((value) => value.subject === "OTT subscription price change"), true);

const eligible = getEligibleCurrentTopics({ topics:[
  topic({ category:"ai_digital", subject:"company announced enterprise platform naming change", personaRelevance:"기업 발표를 확인하는 소재" }),
  topic({ category:"light_culture", subject:"OTT subscription price change affects monthly spending" }),
] }, { at });
assert.equal(eligible[0].subject, "OTT subscription price change affects monthly spending");

const risky = prioritizeCurrentTopics([
  topic({ subject:"politics election debate" }),
  topic({ subject:"coffee price and commute routine" }),
], { at });
assert.equal(risky.some((value) => value.subject === "politics election debate"), false);
assert.equal(risky.length, 1);

assert.equal(prioritizeCurrentTopics(Array.from({ length:20 }, (_, index) => topic({ subject:`daily shopping choice ${index}` })), { at }).length <= 12, true);
assert.deepEqual(getEligibleCurrentTopics({ topics:[topic({ subject:"stale topic", })].map((value) => ({ ...value, expiresAt:"2026-08-30T00:00:00.000Z" })) }, { at }), []);
assert.deepEqual(prioritizeCurrentTopics([], { at }), []);

let request = null;
const discovered = await discoverCurrentTopics({}, {
  at,
  requestJson: async (_env, options) => {
    request = options;
    return { topics:[
      topic({ subject:"holiday travel photo organization life signal" }),
      { ...topic({ subject:"unsupported life signal" }), sourceReferences:[] },
    ] };
  },
});
assert.equal(discovered.length, 1);
assert.equal(discovered[0].subject, "holiday travel photo organization life signal");
assert.deepEqual(request.tools, [{ type:"web_search" }]);
assert.match(request.instructions, /current life signal|food\/cafes|must not dominate/u);

console.log("current topic quality fixtures passed");
