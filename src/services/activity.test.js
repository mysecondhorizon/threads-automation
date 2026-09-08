import assert from "node:assert/strict";
import { getOperatorActivity, normalizeActivityLimit, summarizeGeneralAutoActivity } from "./activity.js";

const sourceReadArguments = {};
const dependencies = {
  async getScheduleRuns(...args) {
    sourceReadArguments.schedules = args;
    return [
      { id: "schedule-general", operation: "auto_general", status: "completed", completedAt: "2026-08-29T03:01:00.000Z", postId: "auto-post", executionId: "execution-general" },
      { id: "schedule-failure", operation: "auto_general", status: "failed", completedAt: "2026-08-29T01:00:00.000Z", error: { code: "ai_generation_failed", step: "ai_generation" } },
    ];
  },
  async listPosts(...args) { sourceReadArguments.posts = args; return [{ id: "manual-post", status: "PUBLISHED", publishedAt: "2026-08-29T05:00:00.000Z", publishedPostId: "manual-post" }]; },
  async getPostLogs(...args) { sourceReadArguments.logs = args; return [{ status: "published", created_at: "2026-08-29T04:00:00.000Z", post_id: "manual-post", metadata: { source: "OPERATOR" } }]; },
  async getAutoPostStatus(...args) {
    sourceReadArguments.autoStatus = args;
    return { recentGeneralAutoExecutions: [{ id: "execution-general", diagnostic: { provenance: { contentBasis: "CURRENT_TOPIC", mediaBasis: "DAILY_IMAGE" }, attempts: [{ attempt: 1, draftText: "SAFE_DRAFT", stage: "similarity_validation", reasons: ["semantic_similarity"] }] } }] };
  },
};

const result = await getOperatorActivity({}, { limit: 50, dependencies });
assert.deepEqual(sourceReadArguments.schedules.slice(1), [50, "default-workspace"]);
assert.deepEqual(sourceReadArguments.posts.slice(1), [{ status: "PUBLISHED" }, "default-workspace"]);
assert.deepEqual(sourceReadArguments.logs.slice(1), []);
assert.deepEqual(sourceReadArguments.autoStatus.slice(1), [{ workspaceId: null }]);
assert.equal(result.items.some((activity) => activity.type === "PRODUCT_REVIEW"), false);
assert.equal(result.items.find((activity) => activity.id === "schedule:schedule-general").mediaBasis, "DAILY_IMAGE");
assert.deepEqual(result.generalAutoSummary, {
  totalExecutions: 2, successfulPublishes: 1, failedExecutions: 1,
  textCount: 0, imageCount: 1, videoCount: 0, personaCount: 0, currentTopicCount: 1,
  imageUsagePercent: 100, videoUsagePercent: 0,
});
assert.equal(normalizeActivityLimit(undefined), 30);
assert.equal(normalizeActivityLimit(-4), 1);
assert.equal(normalizeActivityLimit(999), 50);
assert.deepEqual(summarizeGeneralAutoActivity([
  { type: "GENERAL_AUTO", status: "PUBLISHED", contentBasis: "CURRENT_TOPIC", mediaBasis: "DAILY_IMAGE" },
  { type: "GENERAL_AUTO", status: "SUCCESS", contentBasis: "PERSONA", mediaBasis: "DAILY_VIDEO" },
  { type: "GENERAL_AUTO", status: "SUCCESS", mediaBasis: "NONE" },
  { type: "GENERAL_AUTO", status: "FAILED" },
  { type: "MANUAL_PUBLISH", status: "PUBLISHED", mediaBasis: "NONE" },
]), {
  totalExecutions: 4, successfulPublishes: 1, failedExecutions: 1,
  textCount: 1, imageCount: 1, videoCount: 1, personaCount: 1, currentTopicCount: 1,
  imageUsagePercent: 33, videoUsagePercent: 33,
});

const scoped = await getOperatorActivity({}, {
  workspaceId: "workspace-next",
  dependencies: {
    async getScheduleRuns() { return [{ id: "default", operation: "auto_general", status: "completed", completedAt: "2026-08-30T01:00:00.000Z" }, { id: "next", workspaceId: "workspace-next", operation: "auto_general", status: "completed", completedAt: "2026-08-30T02:00:00.000Z" }]; },
    async listPosts() { return []; }, async getPostLogs() { return []; }, async getAutoPostStatus() { return { recentGeneralAutoExecutions: [] }; },
  },
});
assert.equal(scoped.items.some((activity) => activity.id === "schedule:default"), false);
assert.equal(scoped.items.some((activity) => activity.id === "schedule:next"), true);
console.log("activity service fixture passed");
