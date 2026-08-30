import assert from "node:assert/strict";

import {
  buildCurrentTopicDiagnostic,
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

console.log("auto post engine diagnostic fixtures passed");
