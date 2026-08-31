import assert from "node:assert/strict";

import {
  getAutoPostStatus,
} from "./status.js";

class MemoryKv {
  constructor(entries) {
    this.entries = new Map(
      Object.entries(entries).map(([key, value]) => [key, JSON.stringify(value)])
    );
  }

  async get(key, type) {
    const value = this.entries.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }

  async list({ prefix = "" } = {}) {
    return {
      keys: [...this.entries.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((name) => ({ name })),
    };
  }
}

const failedExecution = {
  id: "failed-run",
  source: "cron_auto_general",
  status: "failed",
  step: "similarity_validation",
  startedAt: "2026-08-30T02:30:00.000Z",
  updatedAt: "2026-08-30T02:30:05.000Z",
  completedAt: "2026-08-30T02:30:05.000Z",
  generation: { attempts: 0, regenerated: false },
  similarity: { checkedPostCount: 0, threshold: 0.62, highestScore: 0, matchedPostId: null },
  firstComment: null,
  error: {
    code: "recent_post_too_similar",
    message: "safe failure",
    details: {
      reasons: ["semantic_duplicate"],
      attempts: 2,
      targetPrompt: "RAW_SYSTEM_PROMPT_MUST_NOT_LEAK",
    },
  },
  diagnostic: {
    currentTopic: {
      mode: "current_topic",
      topicId: "topic-1",
      category: "work_productivity",
      subject: "Calendar overload",
      selectedAngle: "A small daily habit",
      fallbackReason: null,
      authRef: "MUST_NOT_LEAK",
    },
    provenance: {
      contentBasis: "CURRENT_TOPIC",
      mediaBasis: "DAILY_IMAGE",
      authRef: "MUST_NOT_LEAK",
    },
    attempts: [
      {
        attempt: 1,
        draftText: "Candidate draft one.",
        format: { signature: "p1:s2", paragraphCount: 1, sentencePattern: [2] },
        targetFormat: { id: "compact_single", name: "Compact" },
        stage: "similarity_validation",
        errorCode: "recent_post_too_similar",
        reasons: ["semantic_duplicate"],
        similarity: {
          highestScore: 0.82,
          matchedPostId: "published-1",
          matchedPostText: "Existing published post.",
        },
        regenerated: false,
        retrying: true,
        systemPrompt: "RAW_SYSTEM_PROMPT_MUST_NOT_LEAK",
      },
      {
        attempt: 2,
        draftText: "Candidate draft two.",
        format: null,
        targetFormat: null,
        stage: "similarity_validation",
        errorCode: "recent_post_too_similar",
        reasons: ["semantic_duplicate"],
        similarity: null,
        regenerated: true,
        retrying: false,
      },
      { attempt: 3, draftText: "MUST_NOT_LEAK" },
    ],
  },
};

const successfulExecution = {
  id: "success-run",
  source: "cron_auto_general",
  status: "success",
  step: "completed",
  startedAt: "2026-08-30T03:30:00.000Z",
  updatedAt: "2026-08-30T03:30:05.000Z",
  completedAt: "2026-08-30T03:30:05.000Z",
  generation: { attempts: 1, regenerated: false },
  similarity: { checkedPostCount: 3, threshold: 0.62, highestScore: 0.11, matchedPostId: null },
  firstComment: null,
  error: null,
  diagnostic: {
    currentTopic: {
      mode: "everyday_personal",
      topicId: null,
      category: null,
      subject: null,
      selectedAngle: null,
      fallbackReason: null,
    },
    provenance: {
      contentBasis: "PERSONA",
      mediaBasis: "NONE",
    },
    attempts: [],
  },
};

const env = {
  THREADS_KV: new MemoryKv({
    "auto_post:latest_execution": successfulExecution,
    "auto_post_execution:failed-run": failedExecution,
    "auto_post_execution:success-run": successfulExecution,
  }),
};

const status = await getAutoPostStatus(env);
assert.equal(status.latestExecution.id, "success-run");
assert.equal(status.recentGeneralAutoExecutions[0].id, "failed-run");
assert.equal(status.recentGeneralAutoExecutions[0].diagnostic.attempts.length, 2);
assert.equal(
  status.recentGeneralAutoExecutions[0].diagnostic.attempts[0].similarity.highestScore,
  0.82
);
assert.equal(
  status.recentGeneralAutoExecutions[0].diagnostic.attempts[0].similarity.matchedPostId,
  "published-1"
);
assert.equal(status.recentGeneralAutoExecutions[1].error, null);
assert.deepEqual(status.recentGeneralAutoExecutions[1].diagnostic.attempts, []);
assert.deepEqual(status.recentGeneralAutoExecutions[0].diagnostic.provenance, {
  contentBasis: "CURRENT_TOPIC",
  mediaBasis: "DAILY_IMAGE",
});
assert.deepEqual(status.recentGeneralAutoExecutions[1].diagnostic.provenance, {
  contentBasis: "PERSONA",
  mediaBasis: "NONE",
});
assert.equal(JSON.stringify(status).includes("RAW_SYSTEM_PROMPT_MUST_NOT_LEAK"), false);
assert.equal(JSON.stringify(status).includes("MUST_NOT_LEAK"), false);

console.log("auto post status fixtures passed");
