import assert from "node:assert/strict";

import {
  buildCurrentTopicDiagnostic,
  buildGeneralAutoProvenance,
  applySelectedDailyImageContext,
} from "./engine.js";

assert.deepEqual(
  buildCurrentTopicDiagnostic({
    currentTopic: {
      topicId: "topic-1",
      category: "work_productivity",
      subject: "Calendar overload",
      selectedAngle: "A small daily habit",
    },
    fallbackReason: null,
  }),
  {
    mode: "current_topic",
    topicId: "topic-1",
    category: "work_productivity",
    subject: "Calendar overload",
    selectedAngle: "A small daily habit",
    fallbackReason: null,
  }
);

assert.deepEqual(
  buildCurrentTopicDiagnostic({
    currentTopic: null,
    fallbackReason: "no_eligible_current_topic",
  }),
  {
    mode: "fallback",
    topicId: null,
    category: null,
    subject: null,
    selectedAngle: null,
    fallbackReason: "no_eligible_current_topic",
  }
);

assert.equal(
  buildCurrentTopicDiagnostic({
    currentTopic: null,
    fallbackReason: null,
  }).mode,
  "everyday_personal"
);

assert.deepEqual(
  buildGeneralAutoProvenance(
    { currentTopic: null },
    { mode: "TEXT" }
  ),
  {
    contentBasis: "PERSONA",
    mediaBasis: "NONE",
  }
);

assert.deepEqual(
  buildGeneralAutoProvenance(
    { currentTopic: { topicId: "topic-1" } },
    { mode: "IMAGE" }
  ),
  {
    contentBasis: "CURRENT_TOPIC",
    mediaBasis: "DAILY_IMAGE",
  }
);

assert.deepEqual(
  buildGeneralAutoProvenance(
    { currentTopic: null },
    { mode: "VIDEO" }
  ),
  {
    contentBasis: "PERSONA",
    mediaBasis: "DAILY_VIDEO",
  }
);

assert.equal(buildGeneralAutoProvenance(null, { mode: "IMAGE" }), null);

const imageContextTarget = {};
assert.deepEqual(
  applySelectedDailyImageContext(imageContextTarget, {
    mode:"IMAGE",
    generationImageContext:{ experienceTags:["cafe"], experienceNote:"quiet setting" },
  }),
  { experienceTags:["cafe"], experienceNote:"quiet setting" }
);
assert.deepEqual(imageContextTarget.dailyImageContext, {
  experienceTags:["cafe"], experienceNote:"quiet setting",
});
assert.equal(applySelectedDailyImageContext({}, { mode:"IMAGE" }), null);

console.log("auto post engine diagnostic fixtures passed");
