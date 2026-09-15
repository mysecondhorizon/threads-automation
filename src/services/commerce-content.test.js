import assert from "node:assert/strict";
import { CommerceContentError, buildCommerceContentInput, generateCommerceContent, selectCommerceContentAsset } from "./commerce-content.js";

const opportunity = { id: "opportunity-1", workspaceId: "workspace-a", productName: "Compact car vacuum", category: "car cleanup", brand: "Example", sourceUrl: "https://example.test/product", affiliateLink: "https://example.test/affiliate", problem: "Dust builds up in the car", audience: "Drivers", situation: "Weekend car cleanup", angle: "Small cleanup routine", discoveryReason: "Frequently requested", trendScore: 80 };
const experienceMedia = { id: "media-experience", workspaceId: "workspace-a", sourceType: "product", mediaKind: "image", active: true, experienceTags: ["car"], experienceNote: "I used it for a short car cleanup after a weekend drive.", description: "Car interior" };
const tagsOnlyMedia = { id: "media-tags", workspaceId: "workspace-a", sourceType: "product", mediaKind: "video", active: true, experienceTags: ["car"], description: "Car interior" };
const links = [{ workspaceId: "workspace-a", opportunityId: "opportunity-1", mediaId: "media-tags" }, { workspaceId: "workspace-a", opportunityId: "opportunity-1", mediaId: "media-experience" }];

assert.equal(selectCommerceContentAsset(links, [tagsOnlyMedia, experienceMedia], "workspace-a").id, "media-experience");
assert.equal(selectCommerceContentAsset([{ ...links[0], mediaId: "media-experience" }], [{ ...experienceMedia, active: false }], "workspace-a"), null);

let generatedInput = null;
const generated = await generateCommerceContent({}, { workspaceId: "workspace-a", opportunity }, {
  listLinks: async () => links,
  getMedia: async (_env, id) => id === "media-experience" ? experienceMedia : tagsOnlyMedia,
  getProfile: async () => ({ profile: {} }), composePrompt: () => "persona prompt",
  generate: async (_env, value) => { generatedInput = value; return { text: "A small cleanup tool can make a weekend routine feel much lighter.", contentAngle: "DISCOVERY", hookType: "SPECIFIC_MOMENT" }; },
});
assert.equal(generated.contentBasis, "PRODUCT_OPPORTUNITY");
assert.equal(generated.mediaId, "media-experience");
assert.equal(generated.usedUserExperience, true);
assert.equal(generated.contentAngle, "DISCOVERY");
assert.equal(generated.hookType, "SPECIFIC_MOMENT");
assert.equal(generated.usedCurrentTopic, false);
assert.equal(generated.affiliateLink, opportunity.affiliateLink);
assert.match(generatedInput.input, /userExperienceNote/);
assert.match(generatedInput.input, /strictly within userExperienceNote/);
assert.match(generatedInput.input, /interesting human observation/);

const noExperience = await generateCommerceContent({}, { workspaceId: "workspace-a", opportunity }, {
  listLinks: async () => [{ ...links[0], mediaId: "media-tags" }], getMedia: async () => tagsOnlyMedia,
  getProfile: async () => ({ profile: {} }), composePrompt: () => "persona prompt",
  generate: async (_env, value) => { generatedInput = value; return { text: "The easiest cleanup routine is usually the one that removes one small friction point.", contentAngle: "OBSERVATION", hookType: "CURIOSITY" }; },
});
assert.equal(noExperience.usedUserExperience, false);
assert.match(generatedInput.input, /Do not use first-person product-use/);
assert.equal(JSON.parse(generatedInput.input).mediaContext.userExperienceNote, undefined);

const relevantTopic = await generateCommerceContent({}, { workspaceId: "workspace-a", opportunity }, {
  listLinks: async () => [], getMedia: async () => null, getProfile: async () => ({ profile: {} }), composePrompt: () => "persona prompt",
  readTopics: async () => ({ topics: [{ id: "topic-car", category: "consumer_lifestyle", subject: "car cleanup routine", capturedAt: "2026-09-14T00:00:00.000Z", verifiedFacts: ["Weekend cleanup interest"], talkingPoints: ["car cleanup"], personaRelevance: "car cleanup", allowedAngles: ["routine"], forbiddenClaims: [], sourceReferences: [{ url: "https://example.test/topic", title: "Topic" }], expiresAt: "2099-01-01T00:00:00.000Z" }] }),
  generate: async (_env, value) => { generatedInput = value; return { text: "Cleaning a car is easier when the next step is obvious.", contentAngle: "RELATABLE_MOMENT", hookType: "OBSERVATION" }; },
});
assert.equal(relevantTopic.usedCurrentTopic, true);
assert.match(relevantTopic.currentTopicId, /^current_topic:/u);
assert.match(generatedInput.input, /car cleanup routine/);

await assert.rejects(() => generateCommerceContent({}, { workspaceId: "workspace-a", opportunity }, { listLinks: async () => [], getMedia: async () => null, getProfile: async () => ({ profile: {} }), composePrompt: () => "persona prompt", generate: async () => ({ text: "Invalid metadata", contentAngle: "PROMOTION", hookType: "CURIOSITY" }) }), (error) => error instanceof CommerceContentError && error.code === "commerce_content_generation_invalid");
await assert.rejects(() => generateCommerceContent({}, { workspaceId: "workspace-a", opportunity: { ...opportunity, productName: "" } }), (error) => error instanceof CommerceContentError && error.code === "commerce_content_product_name_required");
assert.equal(JSON.parse(buildCommerceContentInput({ opportunity, media: tagsOnlyMedia })).mediaContext.userExperienceNote, undefined);
console.log("commerce content fixtures passed");
