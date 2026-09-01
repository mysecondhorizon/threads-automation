import assert from "node:assert/strict";
import { getOperatorActivity, normalizeActivityLimit } from "./activity.js";

const rawFailure = "RAW_PROVIDER_PAYLOAD_MUST_NOT_LEAK";
const sourceReadArguments = {};
const dependencies = {
  async getScheduleRuns(...args) {
    sourceReadArguments.schedules = args;
    return [
      { id:"schedule-general", operation:"auto_general", status:"completed", scheduledTime:"2026-08-29T03:00:00.000Z", completedAt:"2026-08-29T03:01:00.000Z", postId:"auto-post", executionId:"execution-general" },
      { id:"schedule-provenance-only", operation:"auto_general", status:"completed", completedAt:"2026-08-29T01:30:00.000Z", provenance:{ contentBasis:"PERSONA", mediaBasis:"NONE" } },
      { id:"schedule-review", operation:"product_review", status:"review_ready", completedAt:"2026-08-29T02:00:00.000Z", candidateId:"candidate-scheduled" },
      { id:"schedule-failure", operation:"auto_general", status:"failed", completedAt:"2026-08-29T01:00:00.000Z", error:{ code:"ai_generation_failed", step:"ai_generation", details:{ raw:rawFailure } } },
      { id:"schedule-skipped", operation:"auto_general", status:"skipped", completedAt:"2026-08-29T00:00:00.000Z", skipReason:{ raw:rawFailure } },
    ];
  },
  async listProductReviewCandidates(...args) {
    sourceReadArguments.candidates = args;
    return [
      { id:"candidate-scheduled", status:"pending_review", createdAt:"2026-08-29T02:00:00.000Z" },
      { id:"candidate-published", status:"published", createdAt:"2026-08-28T23:00:00.000Z", publishedAt:"2026-08-29T04:00:00.000Z", postId:"review-post" },
      { id:"candidate-pending", status:"pending_review", createdAt:"2026-08-28T22:00:00.000Z" },
    ];
  },
  async listPosts() {
    return [
      { id:"manual-post", status:"PUBLISHED", publishedAt:"2026-08-29T05:00:00.000Z", publishedPostId:"manual-post" },
      { id:"manual-duplicate", status:"PUBLISHED", publishedAt:"2026-08-29T06:00:00.000Z", publishedPostId:"auto-post" },
    ];
  },
  async getPostLogs(...args) {
    sourceReadArguments.logs = args;
    return [
      { status:"published", created_at:"2026-08-29T07:00:00.000Z", post_id:"manual-post", metadata:{ source:"OPERATOR" }, text:rawFailure },
      { status:"published", created_at:"2026-08-29T06:30:00.000Z", post_id:"legacy-post", metadata:{}, text:rawFailure },
      { status:"published", created_at:"2026-08-29T04:30:00.000Z", post_id:"review-post", metadata:{ source:"manual_product_test" }, text:rawFailure },
      { status:"failed", created_at:"2026-08-29T03:30:00.000Z", step:"create_container", details:{ raw:rawFailure }, text:rawFailure },
      { status:"failed", created_at:"2026-08-29T01:00:30.000Z", step:"ai_generation", details:{ raw:rawFailure }, metadata:{ source:"cron_auto_general" }, text:rawFailure },
    ];
  },
  async getAutoPostStatus(...args) {
    sourceReadArguments.autoStatus = args;
    return { recentGeneralAutoExecutions:[{
      id:"execution-general",
      diagnostic:{
        currentTopic:{ subject:"SAFE_TOPIC" },
        provenance:{ contentBasis:"CURRENT_TOPIC", mediaBasis:"DAILY_IMAGE" },
        attempts:[{ attempt:1, draftText:"SAFE_DRAFT", stage:"similarity_validation", reasons:["semantic_similarity"] }],
      },
    },{
      id:"execution-failure",
      completedAt:"2026-08-29T01:00:10.000Z",
      diagnostic:{ attempts:[{ attempt:1, stage:"ai_generation", errorCode:"ai_generation_failed" }] },
    }] };
  },
};

const result = await getOperatorActivity({}, { limit:50, dependencies });
assert.equal(result.limit, 50);
assert.equal(result.hasMore, false);
assert.equal(result.partial, false);
assert.deepEqual(sourceReadArguments.schedules.slice(1), [50]);
assert.deepEqual(sourceReadArguments.candidates.slice(1), [50]);
assert.deepEqual(sourceReadArguments.logs.slice(1), []);
assert.deepEqual(sourceReadArguments.autoStatus.slice(1), []);
assert.deepEqual(result.items.map((activity) => activity.id), [
  "post-log:legacy-post",
  "operator-post:manual-post",
  "product-review:candidate-published:published",
  "post-log:failed:2026-08-29T03:30:00.000Z:3",
  "schedule:schedule-general",
  "schedule:schedule-review",
  "schedule:schedule-provenance-only",
  "schedule:schedule-failure",
  "schedule:schedule-skipped",
  "product-review:candidate-published:generated",
  "product-review:candidate-pending:generated",
]);
assert.equal(result.items.some((activity) => activity.id === "operator-post:manual-duplicate"), false);
assert.equal(result.items.some((activity) => activity.id === "product-review:candidate-scheduled:generated"), false);
assert.equal(result.items.filter((activity) => activity.externalPostId === "manual-post").length, 1);
assert.equal(result.items.filter((activity) => activity.externalPostId === "review-post").length, 1);
assert.equal(result.items.filter((activity) => activity.type === "GENERAL_AUTO").length, 4);
assert.equal(result.items.some((activity) => activity.id === "post-log:failed:2026-08-29T01:00:30.000Z:4"), false);
assert.deepEqual(result.items.find((activity) => activity.id === "schedule:schedule-general"), {
  id:"schedule:schedule-general", occurredAt:"2026-08-29T03:01:00.000Z", type:"GENERAL_AUTO", status:"PUBLISHED", summary:"General AUTO 게시를 완료했습니다.", failure:null, externalPostId:"auto-post",
  diagnostic:{ currentTopic:{ subject:"SAFE_TOPIC" }, provenance:{ contentBasis:"CURRENT_TOPIC", mediaBasis:"DAILY_IMAGE" }, attempts:[{ attempt:1, draftText:"SAFE_DRAFT", stage:"similarity_validation", reasons:["semantic_similarity"] }] },
  contentBasis:"CURRENT_TOPIC", mediaBasis:"DAILY_IMAGE",
});
assert.deepEqual(result.items.find((activity) => activity.id === "schedule:schedule-provenance-only"), {
  id:"schedule:schedule-provenance-only", occurredAt:"2026-08-29T01:30:00.000Z", type:"GENERAL_AUTO", status:"SUCCESS", summary:"General AUTO 실행을 완료했습니다.", failure:null, externalPostId:null,
  contentBasis:"PERSONA", mediaBasis:"NONE",
});
assert.deepEqual(result.items.find((activity) => activity.id === "schedule:schedule-failure").failure, { stage:"AI_GENERATION", code:"ai_generation_failed", message:"AI 글 생성에 실패했습니다." });
assert.equal(result.items.find((activity) => activity.id === "schedule:schedule-failure").diagnostic.attempts[0].errorCode, "ai_generation_failed");
assert.deepEqual(result.items.find((activity) => activity.id.startsWith("post-log:failed")).failure, { stage:"PUBLISHING", code:"threads_publish_failed", message:"Threads 게시 처리에 실패했습니다." });
assert.equal(JSON.stringify(result).includes(rawFailure), false);
assert.equal(normalizeActivityLimit(undefined), 30);
assert.equal(normalizeActivityLimit(null), 30);
assert.equal(normalizeActivityLimit(-4), 1);
assert.equal(normalizeActivityLimit(999), 50);
const limited = await getOperatorActivity({}, { limit:1, dependencies });
assert.equal(limited.items.length, 1);
assert.equal(limited.hasMore, true);
const empty = await getOperatorActivity({}, { dependencies:{ async getScheduleRuns(){return[]}, async listProductReviewCandidates(){return[]}, async listPosts(){return[]}, async getPostLogs(){return[]}, async getAutoPostStatus(){return{recentGeneralAutoExecutions:[]}} } });
assert.deepEqual(empty.items, []);
const unsafeId = "https://example.com/secret?token=abc";
const oversizedId = "x".repeat(300);
const unsafeResult = await getOperatorActivity({}, { dependencies:{
  async getScheduleRuns(){return[{ id:unsafeId, operation:"auto_general", status:"completed", completedAt:"2026-08-29T10:00:00.000Z" }]},
  async listProductReviewCandidates(){return[{ id:oversizedId, status:"pending_review", createdAt:"2026-08-29T09:00:00.000Z" }]},
  async listPosts(){return[{ id:unsafeId, status:"PUBLISHED", publishedAt:"2026-08-29T08:00:00.000Z", publishedPostId:"manual-safe" }]},
  async getPostLogs(){return[{ status:"published", created_at:"2026-08-29T07:00:00.000Z", post_id:unsafeId, metadata:{} }]},
  async getAutoPostStatus(){return{recentGeneralAutoExecutions:[]}},
} });
assert.equal(JSON.stringify(unsafeResult).includes(unsafeId), false);
assert.equal(JSON.stringify(unsafeResult).includes(oversizedId), false);
const executionOnly = unsafeResult.items.find((activity) => activity.type === "GENERAL_AUTO");
assert.equal(executionOnly.status, "SUCCESS");
assert.equal(executionOnly.summary, "General AUTO 실행을 완료했습니다.");
assert.equal(executionOnly.externalPostId, null);
const partial = await getOperatorActivity({}, { dependencies:{ ...dependencies, async getPostLogs(){throw new Error(rawFailure)} } });
assert.equal(partial.partial, true);
assert.equal(partial.items.some((activity) => activity.type === "GENERAL_AUTO"), true);
await assert.rejects(
  () => getOperatorActivity({}, { dependencies:{ async getScheduleRuns(){throw new Error()}, async listProductReviewCandidates(){throw new Error()}, async listPosts(){throw new Error()}, async getPostLogs(){throw new Error()}, async getAutoPostStatus(){return{recentGeneralAutoExecutions:[]}} } }),
  /All activity sources are unavailable/
);
console.log("activity service fixture passed");
