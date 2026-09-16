import assert from "node:assert/strict";

import { buildGenerationInput } from "./ai.js";

function extractThreadContext(input) {
  const match = input.match(/\[THREAD_CONTEXT_JSON\]\n([\s\S]*?)\n\[\/THREAD_CONTEXT_JSON\]/u);
  assert.ok(match);
  return JSON.parse(match[1]);
}

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
assert.match(input, /The context is role-separated/i);
assert.match(input, /optional factual reference, not a checklist or outline/i);
assert.match(input, /EVIDENCE_ONLY\.dailyMedia describes the Daily media/i);
assert.match(input, /must remain meaningfully compatible/i);
assert.match(input, /Do not invent a visit, purchase, meal, office connection/i);
assert.match(input, /explicit USER_EXPERIENCE factual basis supplied by the user/i);
assert.match(input, /experienceTags are classification hints, not evidence of a personal experience/i);
assert.match(input, /only within that note's stated facts/i);
assert.match(input, /OTT content after work/);
assert.match(input, /small discoveries, useful practical improvements, ordinary enjoyment/i);
assert.match(input, /Do not default to fatigue, complaint-first, burnout/i);
assert.match(input, /Do not force positivity over a genuinely serious topic/i);
assert.match(input, /without melodrama, fake positivity, or invented improvement/i);
const currentTopicContext = extractThreadContext(input);
assert.equal(currentTopicContext.subject.source, "CURRENT_TOPIC");
assert.equal(currentTopicContext.subject.subject, "OTT content after work");
assert.equal(currentTopicContext.primaryStorySeed.source, "CURRENT_TOPIC");
assert.equal(currentTopicContext.primaryStorySeed.selectedAngle, "after-work viewing choices");
assert.deepEqual(currentTopicContext.evidenceOnly.currentTopic.verifiedFacts, ["A current OTT release is available"]);
assert.equal(currentTopicContext.evidenceOnly.dailyMedia.experienceNote, undefined);
assert.equal(currentTopicContext.provenanceSafety.userExperience.experienceNote, "A peaceful cafe near a park");

const experienceInput = buildGenerationInput({
  topic: "General AUTO",
  tone: "plain",
  context: {
    publishing: { goal: "General AUTO" },
    dailyMediaContext: { semanticCues:["cafe"], experienceTags:["cafe"], experienceNote:"A peaceful cafe near a park" },
  },
});
const experienceContext = extractThreadContext(experienceInput);
assert.equal(experienceContext.subject.source, "PERSONA");
assert.deepEqual(experienceContext.primaryStorySeed, { source:"USER_EXPERIENCE", experienceNote:"A peaceful cafe near a park" });
assert.equal(experienceContext.evidenceOnly.dailyMedia.experienceNote, undefined);

const personaInput = buildGenerationInput({ topic:"General AUTO", tone:"plain", context:{ publishing:{ goal:"General AUTO" } } });
const personaContext = extractThreadContext(personaInput);
assert.equal(personaContext.subject.source, "PERSONA");
assert.equal(personaContext.primaryStorySeed, null);

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
