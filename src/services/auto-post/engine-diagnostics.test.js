import assert from "node:assert/strict";

import {
  buildCurrentTopicDiagnostic,
  buildGeneralAutoProvenance,
  applySelectedDailyMediaContext,
  selectPlannedGeneralAutoMedia,
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
    { currentTopic: null },
    { mode: "IMAGE", reason: "experience_basis" }
  ),
  {
    contentBasis: "USER_EXPERIENCE",
    mediaBasis: "DAILY_IMAGE",
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

const mediaContextTarget = {};
assert.deepEqual(
  applySelectedDailyMediaContext(mediaContextTarget, {
    mode:"VIDEO",
    generationMediaContext:{ experienceTags:["cafe"], experienceNote:"quiet setting" },
  }),
  { experienceTags:["cafe"], experienceNote:"quiet setting" }
);
assert.deepEqual(mediaContextTarget.dailyMediaContext, {
  experienceTags:["cafe"], experienceNote:"quiet setting",
});
assert.equal(applySelectedDailyMediaContext({}, { mode:"IMAGE" }), null);

const selectedCalls = [];
const currentTopicSelection = await selectPlannedGeneralAutoMedia(
  {},
  { currentTopic:{ subject:"Current Topic subject" } },
  {
    workspaceId:"workspace-a",
    selectCurrentTopicMedia: async (_env, options) => {
      selectedCalls.push({ path:"current_topic", options });
      return { mode:"IMAGE", generationMediaContext:{ experienceNote:"current topic context" } };
    },
    selectExperienceMedia: async () => {
      throw new Error("Current Topic must not use the experience-first selector");
    },
  }
);
assert.equal(currentTopicSelection.mode, "IMAGE");
assert.deepEqual(selectedCalls, [{
  path:"current_topic",
  options:{
    generatedPost:{ topic:"Current Topic subject", contentType:"TEXT" },
    currentTopic:{ subject:"Current Topic subject" },
    workspaceId:"workspace-a",
  },
}]);

const experienceSelection = await selectPlannedGeneralAutoMedia(
  {},
  {},
  {
    workspaceId:"workspace-b",
    selectCurrentTopicMedia: async () => {
      throw new Error("Everyday Personal must not use Current Topic media selection");
    },
    selectExperienceMedia: async (_env, options) => ({
      mode:"IMAGE",
      reason:"experience_basis",
      generationMediaContext:{ experienceNote:"explicit user experience" },
      options,
    }),
  }
);
assert.equal(experienceSelection.reason, "experience_basis");
assert.deepEqual(experienceSelection.options, { workspaceId:"workspace-b" });
const experienceContextTarget = {};
applySelectedDailyMediaContext(experienceContextTarget, experienceSelection);
assert.deepEqual(experienceContextTarget.dailyMediaContext, {
  experienceNote:"explicit user experience",
});

console.log("auto post engine diagnostic fixtures passed");
