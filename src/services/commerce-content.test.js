import assert from "node:assert/strict";

import {
  CommerceContentError,
  buildCommerceContentInput,
  generateCommerceContent,
  selectCommerceContentAsset,
} from "./commerce-content.js";

const opportunity = {
  id: "opportunity-1", workspaceId: "workspace-a", productName: "Compact vacuum", category: "car", brand: "Example", sourceUrl: "https://example.test/product", affiliateLink: "https://example.test/affiliate", problem: "Dust builds up in the car", audience: "Drivers", situation: "Weekend cleanup", angle: "Small cleanup routine", discoveryReason: "Frequently requested", trendScore: 80,
};
const experienceMedia = { id: "media-experience", workspaceId: "workspace-a", sourceType: "product", mediaKind: "image", active: true, experienceTags: ["car"], experienceNote: "I used it for a short car cleanup after a weekend drive.", description: "Car interior" };
const tagsOnlyMedia = { id: "media-tags", workspaceId: "workspace-a", sourceType: "product", mediaKind: "video", active: true, experienceTags: ["car"], description: "Car interior" };
const links = [{ workspaceId: "workspace-a", opportunityId: "opportunity-1", mediaId: "media-tags" }, { workspaceId: "workspace-a", opportunityId: "opportunity-1", mediaId: "media-experience" }];

assert.equal(selectCommerceContentAsset(links, [tagsOnlyMedia, experienceMedia], "workspace-a").id, "media-experience");
assert.equal(selectCommerceContentAsset([{ ...links[0], mediaId: "media-experience" }], [{ ...experienceMedia, active: false }], "workspace-a"), null);
assert.equal(selectCommerceContentAsset([{ ...links[0], mediaId: "foreign" }], [{ ...experienceMedia, id: "foreign", workspaceId: "workspace-b" }], "workspace-a"), null);

let generatedInput = null;
const generated = await generateCommerceContent({}, { workspaceId: "workspace-a", opportunity }, {
  listLinks: async () => links,
  getMedia: async (_env, id) => id === "media-experience" ? experienceMedia : tagsOnlyMedia,
  getProfile: async () => ({ profile: {} }),
  composePrompt: () => "persona prompt",
  generate: async (_env, value) => { generatedInput = value; return { text: "차 안 정리할 때 작은 도구 하나가 동선을 줄여줄 수 있겠어요." }; },
});
assert.equal(generated.contentBasis, "PRODUCT_OPPORTUNITY");
assert.equal(generated.mediaId, "media-experience");
assert.equal(generated.usedUserExperience, true);
assert.equal(generated.affiliateLink, opportunity.affiliateLink);
assert.match(generatedInput.input, /userExperienceNote/);
assert.match(generatedInput.input, /strictly within userExperienceNote/);
assert.match(generatedInput.input, /Do not copy, rewrite, shorten/);

const noExperience = await generateCommerceContent({}, { workspaceId: "workspace-a", opportunity }, {
  listLinks: async () => [{ ...links[0], mediaId: "media-tags" }],
  getMedia: async () => tagsOnlyMedia,
  getProfile: async () => ({ profile: {} }), composePrompt: () => "persona prompt",
  generate: async (_env, value) => { generatedInput = value; return { text: "차 안 정리 도구를 고를 때는 보관성과 쓰임을 먼저 살펴보면 좋겠습니다." }; },
});
assert.equal(noExperience.usedUserExperience, false);
assert.match(generatedInput.input, /Do not use first-person product-use/);
assert.doesNotMatch(generatedInput.input, /userExperienceNote/);

const textOnly = await generateCommerceContent({}, { workspaceId: "workspace-a", opportunity }, {
  listLinks: async () => [], getMedia: async () => null, getProfile: async () => ({ profile: {} }), composePrompt: () => "persona prompt", generate: async () => ({ text: "필요한 순간에 꺼내기 쉬운 도구인지부터 보면 선택이 한결 편해집니다." }),
});
assert.equal(textOnly.mediaId, null);
assert.equal(textOnly.usedUserExperience, false);

await assert.rejects(() => generateCommerceContent({}, { workspaceId: "workspace-a", opportunity: { ...opportunity, productName: "" } }), (error) => error instanceof CommerceContentError && error.code === "commerce_content_product_name_required");
assert.doesNotMatch(buildCommerceContentInput({ opportunity, media: tagsOnlyMedia }), /userExperienceNote/);
console.log("commerce content fixtures passed");
