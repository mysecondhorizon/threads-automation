import assert from "node:assert/strict";

import { buildGenerationInput } from "./ai.js";

const input = buildGenerationInput({
  topic: "General AUTO",
  tone: "plain",
  context: {
    publishing: { targetFormatGuidance:"advisory" },
    currentTopic: {
      topicId:"ott-topic",
      category:"light_culture",
      subject:"OTT content after work",
      verifiedFacts:["A current OTT release is available"],
      talkingPoints:["OTT can be a simple after-work choice"],
      personaRelevance:"A realistic evening routine topic",
      allowedAngles:["after-work viewing choices"],
      selectedAngle:"after-work viewing choices",
      forbiddenClaims:[],
    },
    dailyMediaContext: {
      semanticCues:["cafe", "quiet", "A peaceful cafe near a park"],
      experienceTags:["cafe", "quiet"],
      experienceNote:"A peaceful cafe near a park",
    },
  },
});

assert.match(input, /core anchor clear/i);
assert.match(input, /같은 말을 바꿔 반복하지 말고/u);
assert.match(input, /dailyMediaContext describes the Daily media/i);
assert.match(input, /must remain meaningfully compatible/i);
assert.match(input, /Do not invent a visit, purchase, meal, office connection/i);
assert.match(input, /explicit USER_EXPERIENCE factual basis supplied by the user/i);
assert.match(input, /experienceTags are classification hints, not evidence of a personal experience/i);
assert.match(input, /only within that note's stated facts/i);
assert.match(input, /OTT content after work/);

const tagsOnlyInput = buildGenerationInput({
  topic: "General AUTO",
  tone: "plain",
  context: {
    dailyMediaContext: {
      semanticCues:["cafe"],
      experienceTags:["cafe"],
    },
  },
});
assert.doesNotMatch(tagsOnlyInput, /USER_EXPERIENCE factual basis/i);

console.log("AI generation context fixtures passed");
