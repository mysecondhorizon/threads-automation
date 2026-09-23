import assert from "node:assert/strict";

import { CommercePublishError, publishCommerceContent } from "./commerce-publish.js";

const calls = [];
const result = await publishCommerceContent({}, {
  workspaceId: "workspace-a",
  opportunity: { id: "opportunity-a" },
  text: "  Reviewed text stays exact.  ",
  media: { id: "media-a", mediaKind: "image" },
  storyMetadata: { contentAngle: "DISCOVERY", hookType: "CURIOSITY", usedCurrentTopic: true, currentTopicId: "topic-a", usedUserExperience: true },
}, {
  publishWithResolvedApp: async (input) => { calls.push(input); return { provider: "THREADS", externalPostId: "post-a", logUsername: "owner", workspaceId:"workspace-a", connectedAccountId:"account-a", publisherUserId:"provider-a" }; },
  logPostSuccess: async (_env, _username, _postId, text, metadata) => { calls.push({ text, metadata }); },
});
assert.equal(result.postId, "post-a");
assert.equal(calls[0].content, "  Reviewed text stays exact.  ");
assert.deepEqual(calls[0].context.mediaSelection, { mode: "IMAGE", mediaId: "media-a" });
assert.equal(calls[1].metadata.contentBasis, "PRODUCT_OPPORTUNITY");
assert.equal(calls[1].metadata.workspaceId, "workspace-a");
assert.equal(calls[1].metadata.connectedAccountId, "account-a");
assert.equal(calls[1].metadata.threadsUserId, "provider-a");
assert.equal(calls[1].metadata.opportunityId, "opportunity-a");
assert.equal(calls[1].metadata.contentAngle, "DISCOVERY");
assert.equal(calls[1].metadata.hookType, "CURIOSITY");
assert.equal(calls[1].metadata.currentTopicId, "topic-a");
assert.equal(calls[1].metadata.usedUserExperience, true);
assert.equal(calls[1].metadata.affiliateLinkUsed, false);
assert.equal(calls.some((value) => value?.generate || value?.requestOpenAiJson), false);

const textOnly = await publishCommerceContent({}, {
  workspaceId: "workspace-a", opportunity: { id: "opportunity-a" }, text: "Text only",
}, { publishWithResolvedApp: async (input) => ({ provider: "THREADS", externalPostId: input.context.mediaSelection.mode, logUsername: "owner" }), logPostSuccess: async () => {} });
assert.equal(textOnly.postId, "TEXT");
await assert.rejects(
  () => publishCommerceContent({}, { workspaceId: "workspace-a", opportunity: { id: "opportunity-a" }, text: "", media: null }),
  (error) => error instanceof CommercePublishError && error.code === "commerce_publish_text_required",
);
await assert.rejects(
  () => publishCommerceContent({}, { workspaceId: "workspace-a", opportunity: { id: "opportunity-a" }, text: "caption", media: { id: "video-a", mediaKind: "video" } }),
  (error) => error instanceof CommercePublishError && error.code === "commerce_publish_media_unsupported",
);
let failedAttempts = 0;
await assert.rejects(
  () => publishCommerceContent({}, { workspaceId: "workspace-a", opportunity: { id: "opportunity-a" }, text: "No retry" }, {
    publishWithResolvedApp: async () => { failedAttempts += 1; throw new Error("upstream failed"); },
  }),
  (error) => error instanceof CommercePublishError && error.code === "commerce_threads_publish_failed",
);
assert.equal(failedAttempts, 1);
await assert.rejects(
  () => publishCommerceContent({}, { workspaceId: "workspace-a", opportunity: { id: "opportunity-a" }, text: "Reviewed", storyMetadata: { contentAngle: "INVALID", hookType: "CURIOSITY", usedCurrentTopic: false, currentTopicId: null, usedUserExperience: false } }),
  (error) => error instanceof CommercePublishError && error.code === "commerce_publish_story_metadata_invalid",
);
console.log("commerce publish fixtures passed");
