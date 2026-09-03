import assert from "node:assert/strict";

import {
  discoverCurrentTopics,
  getEligibleCurrentTopics,
  prioritizeCurrentTopics,
  scoreCurrentTopicThreadsWorthiness,
} from "./current-topic-inventory.js";

const at = new Date("2026-09-01T00:00:00.000Z");
const expiresAt = "2026-09-02T12:00:00.000Z";

function topic({
  category = "consumer_lifestyle",
  subject,
  capturedAt = at.toISOString(),
  topicExpiresAt = expiresAt,
  personaRelevance = "일상에서 비용과 시간을 생각하며 선택하기 좋은 소재",
  allowedAngles = ["내 경험과 의견을 한두 문장으로 덧붙이는 관점"],
} = {}) {
  return {
    category,
    subject,
    capturedAt,
    expiresAt: topicExpiresAt,
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

const eveningAt = new Date("2026-09-01T11:00:00.000Z");
const daytimeAt = new Date("2026-09-01T02:00:00.000Z");
const timeFitTopics = [
  topic({ category:"light_culture", subject:"OTT drama discussion after work" }),
  topic({ category:"work_productivity", subject:"work calendar and lunch routine" }),
];
assert.equal(getEligibleCurrentTopics({ topics:timeFitTopics }, { at:eveningAt })[0].category, "light_culture");
assert.equal(getEligibleCurrentTopics({ topics:timeFitTopics }, { at:daytimeAt })[0].category, "work_productivity");
assert.equal(
  getEligibleCurrentTopics({ topics:[topic({ category:"light_culture", subject:"OTT after work discussion", personaRelevance:"daily routine" })] }, { at:daytimeAt }).length,
  1
);

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

const discoveryCandidates = [
  ...Array.from({ length:8 }, (_, index) => topic({ category:"ai_digital", subject:`digital candidate ${index}` })),
  ...Array.from({ length:4 }, (_, index) => topic({ subject:`coffee cafe candidate ${index}` })),
  ...Array.from({ length:4 }, (_, index) => topic({ subject:`travel outing candidate ${index}` })),
  ...Array.from({ length:4 }, (_, index) => topic({ subject:`shopping price candidate ${index}` })),
  ...Array.from({ length:4 }, (_, index) => topic({ subject:`commute mobility candidate ${index}` })),
];
let discoveryRequest = null;
const discoveryInventory = await discoverCurrentTopics({}, {
  at,
  requestJson: async (_env, options) => {
    discoveryRequest = options;
    return { topics:discoveryCandidates };
  },
});
assert.equal(discoveryCandidates.length >= 20, true);
assert.equal(discoveryInventory.length, 12);
assert.equal(discoveryInventory.length <= 12, true);
assert.equal(discoveryInventory.filter((value) => value.category === "ai_digital").length <= 3, true);
assert.equal(discoveryInventory.some((value) => value.subject.startsWith("travel outing candidate")), true);
assert.equal(discoveryRequest.schema.properties.topics.maxItems, 24);
assert.match(discoveryRequest.input, /up to 24/u);

function qualityAtAge(hours, subject) {
  const capturedAt = new Date(at.getTime() - hours * 60 * 60 * 1000);
  return topic({
    subject,
    capturedAt: capturedAt.toISOString(),
    topicExpiresAt: new Date(capturedAt.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  });
}

assert.equal(scoreCurrentTopicThreadsWorthiness(qualityAtAge(24, "fresh 24 hours"), { at }).scoreBreakdown.timeliness, 12);
assert.equal(scoreCurrentTopicThreadsWorthiness(qualityAtAge(25, "fresh 3 days"), { at }).scoreBreakdown.timeliness, 9);
assert.equal(scoreCurrentTopicThreadsWorthiness(qualityAtAge(72, "fresh at 3 days"), { at }).scoreBreakdown.timeliness, 9);
assert.equal(scoreCurrentTopicThreadsWorthiness(qualityAtAge(73, "fresh 7 days"), { at }).scoreBreakdown.timeliness, 6);
assert.equal(scoreCurrentTopicThreadsWorthiness(qualityAtAge(168, "fresh at 7 days"), { at }).scoreBreakdown.timeliness, 6);
assert.equal(scoreCurrentTopicThreadsWorthiness(qualityAtAge(169, "fresh 14 days"), { at }).scoreBreakdown.timeliness, 3);
assert.equal(scoreCurrentTopicThreadsWorthiness(qualityAtAge(336, "fresh at 14 days"), { at }).scoreBreakdown.timeliness, 3);
assert.equal(scoreCurrentTopicThreadsWorthiness(qualityAtAge(337, "expired after 14 days"), { at }), null);

const oldHighQuality = qualityAtAge(13 * 24, "shopping price commute coffee routine");
const newLowQuality = topic({ category:"ai_digital", subject:"company announced enterprise platform naming change", personaRelevance:"기업 발표를 확인하는 소재" });
oldHighQuality.id = "current_topic:old_high_quality";
newLowQuality.id = "current_topic:new_low_quality";
const oldScore = scoreCurrentTopicThreadsWorthiness(oldHighQuality, { at }).score;
const newScore = scoreCurrentTopicThreadsWorthiness(newLowQuality, { at }).score;
assert.equal(oldScore > newScore, true);
const recentExclusion = getEligibleCurrentTopics({ topics:[oldHighQuality, newLowQuality] }, { at, recentTopicIds:[oldHighQuality.id] });
assert.equal(recentExclusion.some((value) => value.id === oldHighQuality.id), false);

console.log("current topic quality fixtures passed");
