import assert from "node:assert/strict";
import { CommerceContentError, buildCommerceContentInput, generateCommerceContent, selectCommerceContentAsset, selectCommerceNarrativeSource, selectRelevantCommerceCurrentTopic } from "./commerce-content.js";
import { composeEffectiveThreadsPrompt } from "./prompt-profile.js";

const opportunity = { id: "opportunity-1", workspaceId: "workspace-a", productName: "Compact car vacuum", category: "car cleanup", brand: "Example", sourceUrl: "https://example.test/product", affiliateLink: "https://example.test/affiliate", problem: "Dust builds up in the car", audience: "Drivers", situation: "Weekend car cleanup", angle: "Small cleanup routine", discoveryReason: "Frequently requested", trendScore: 80 };
const experienceMedia = { id: "media-experience", workspaceId: "workspace-a", sourceType: "product", mediaKind: "image", active: true, experienceTags: ["car"], experienceNote: "I used it for a short car cleanup after a weekend drive.", description: "Car interior" };
const tagsOnlyMedia = { id: "media-tags", workspaceId: "workspace-a", sourceType: "product", mediaKind: "video", active: true, experienceTags: ["car"], description: "Car interior" };
const links = [{ workspaceId: "workspace-a", opportunityId: "opportunity-1", mediaId: "media-tags" }, { workspaceId: "workspace-a", opportunityId: "opportunity-1", mediaId: "media-experience" }];
const topic = (subject, extras = {}) => ({ category: "consumer_lifestyle", subject, capturedAt: "2026-09-14T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", verifiedFacts: [subject], talkingPoints: [subject], personaRelevance: subject, allowedAngles: [subject], forbiddenClaims: [], sourceReferences: [{ url: "https://example.test/topic", title: "Topic" }], ...extras });

assert.equal(selectCommerceContentAsset(links, [tagsOnlyMedia, experienceMedia], "workspace-a").id, "media-experience");
assert.equal(selectCommerceContentAsset([{ ...links[0], mediaId: "media-experience" }], [{ ...experienceMedia, active: false }], "workspace-a"), null);
assert.deepEqual(selectCommerceNarrativeSource(opportunity, experienceMedia), { source:"USER_EXPERIENCE", field:"experienceNote", value:experienceMedia.experienceNote });
assert.deepEqual(selectCommerceNarrativeSource(opportunity, tagsOnlyMedia), { source:"AI_INFERENCE", field:"angle", value:opportunity.angle });
assert.deepEqual(selectCommerceNarrativeSource({ ...opportunity, angle:"", situation:"", problem:"" }, null), { source:"PRODUCT_FACT", field:"productName", value:opportunity.productName });
assert.deepEqual(selectCommerceNarrativeSource({ ...opportunity, angle:"", situation:"A weekend car cleanup", problem:"Dust builds up" }, null), { source:"AI_INFERENCE", field:"situation", value:"A weekend car cleanup" });
assert.deepEqual(selectCommerceNarrativeSource({ ...opportunity, angle:"", situation:"", problem:"Dust builds up" }, null), { source:"AI_INFERENCE", field:"problem", value:"Dust builds up" });

const refrigeratorOpportunity = { ...opportunity, productName: "명절 후 냉장고 정리·식재료 관리 키트", category: "주방 정리용품", problem: "명절 후 남은 식재료와 반찬이 냉장고 안에서 섞인다.", situation: "추석 음식과 평소 식재료가 한꺼번에 들어와 냉장고가 포화되는 시기", angle: "투명 용기·날짜 라벨·냉장/냉동 구역 분리·세로 적층" };
assert.equal(selectRelevantCommerceCurrentTopic(refrigeratorOpportunity, [topic("추석 온라인 세일과 오프라인 장보기 비교")]), null);

const petOpportunity = { ...opportunity, productName: "가을 반려동물 털·냄새 관리 소모품 묶음", category: "반려동물 생활용품", problem: "반려동물 털과 냄새 관리가 필요하다." };
const syntheticCompositePetOpportunity = { ...petOpportunity, angle: "먼지 억제력·흡수력·냄새 관리·보관 편의" };
assert.match(selectRelevantCommerceCurrentTopic(petOpportunity, [topic("환절기 반려동물 털빠짐과 집안 냄새 관리")]).subject, /반려동물/u);
assert.equal(selectRelevantCommerceCurrentTopic(petOpportunity, [topic("가을 온라인 세일과 쇼핑 추천")]), null);
const strongestTopic = selectRelevantCommerceCurrentTopic(petOpportunity, [topic("반려동물 장난감 추천"), topic("반려동물 털 냄새 관리")]);
assert.match(strongestTopic.subject, /털 냄새 관리/u);

let generatedInput = null;
let generationCalls = 0;
const generated = await generateCommerceContent({}, { workspaceId: "workspace-a", opportunity }, {
  listLinks: async () => links,
  getMedia: async (_env, id) => id === "media-experience" ? experienceMedia : tagsOnlyMedia,
  getProfile: async () => ({ profile: {} }), composePrompt: composeEffectiveThreadsPrompt,
  generate: async (_env, value) => { generationCalls += 1; generatedInput = value; return { text: "A small cleanup tool can make a weekend routine feel much lighter.", primaryStoryIdea: "A small cleanup routine feels lighter when one friction point disappears.", contentAngle: "DISCOVERY", hookType: "SPECIFIC_MOMENT" }; },
});
assert.equal(generated.contentBasis, "PRODUCT_OPPORTUNITY");
assert.equal(generated.mediaId, "media-experience");
assert.equal(generated.usedUserExperience, true);
assert.equal(generated.contentAngle, "DISCOVERY");
assert.equal(generated.hookType, "SPECIFIC_MOMENT");
assert.equal(generated.usedCurrentTopic, false);
assert.equal(generated.affiliateLink, opportunity.affiliateLink);
assert.equal(generationCalls, 1);
assert.equal(Object.hasOwn(generated, "primaryStoryIdea"), false);
assert.match(generatedInput.instructions, /ONE POST = ONE IDEA/);
assert.match(generatedInput.instructions, /prefer omission over completeness/);
assert.match(generatedInput.instructions, /generic balanced explanations/);
const experiencePayload = JSON.parse(generatedInput.input);
assert.deepEqual(experiencePayload.subject, { source:"PRODUCT_OPPORTUNITY", productName:opportunity.productName, category:opportunity.category });
assert.deepEqual(experiencePayload.narrativeSource, { source:"USER_EXPERIENCE", field:"experienceNote", value:experienceMedia.experienceNote });
assert.equal(experiencePayload.evidenceOnly.productOpportunity.narrativeFields.angle, opportunity.angle);
assert.equal(experiencePayload.evidenceOnly.media.experienceNote, undefined);
assert.equal(experiencePayload.provenanceSafety.USER_EXPERIENCE, "Only narrativeSource.value is factual first-person experience evidence.");
assert.match(experiencePayload.primaryStoryIdeaTask.requirement, /exactly one human-scale/u);
assert.match(experiencePayload.primaryStoryIdeaTask.provenance, /AI_INFERENCE remains non-personal inference/u);
assert.match(generatedInput.input, /EVIDENCE_ONLY is optional reference material for factual accuracy only/);
assert.match(generatedInput.input, /not a checklist, outline, or set of facts that must appear/);
assert.match(generatedInput.input, /mandatory SUBJECT/);
assert.match(generatedInput.input, /never use it as the main story/);
assert.match(generatedInput.input, /product name need not appear in the opening or at all/);
assert.doesNotMatch(generatedInput.input, /ONE POST = ONE IDEA/);
assert.doesNotMatch(generatedInput.input, /compressed buying guides/);

const noExperience = await generateCommerceContent({}, { workspaceId: "workspace-a", opportunity }, {
  listLinks: async () => [{ ...links[0], mediaId: "media-tags" }], getMedia: async () => tagsOnlyMedia,
  getProfile: async () => ({ profile: {} }), composePrompt: () => "persona prompt",
  generate: async (_env, value) => { generationCalls += 1; generatedInput = value; return { text: "The easiest cleanup routine is usually the one that removes one small friction point.", primaryStoryIdea: "A cleanup routine becomes easier when one friction point disappears.", contentAngle: "OBSERVATION", hookType: "CURIOSITY" }; },
});
assert.equal(noExperience.usedUserExperience, false);
assert.match(generatedInput.input, /Do not use first-person product-use/);
const noExperiencePayload = JSON.parse(generatedInput.input);
assert.deepEqual(noExperiencePayload.narrativeSource, { source:"AI_INFERENCE", field:"angle", value:opportunity.angle });
assert.equal(noExperiencePayload.primaryStoryIdeaTask.sourceRole.includes("not an outline, checklist"), true);
assert.equal(noExperiencePayload.evidenceOnly.productOpportunity.narrativeFields.angle, undefined);
assert.equal(noExperiencePayload.evidenceOnly.productOpportunity.narrativeFields.situation, opportunity.situation);
assert.equal(noExperiencePayload.evidenceOnly.productOpportunity.narrativeFields.problem, opportunity.problem);
assert.equal(JSON.stringify(noExperiencePayload).includes("trendScore"), false);
assert.deepEqual(generatedInput.schema.required, ["text", "primaryStoryIdea", "contentAngle", "hookType"]);
assert.equal(Object.hasOwn(generatedInput.schema.properties, "primaryStoryIdea"), true);

const refrigeratorPayload = JSON.parse(buildCommerceContentInput({ opportunity: refrigeratorOpportunity, media: null }));
assert.deepEqual(refrigeratorPayload.narrativeSource, { source:"AI_INFERENCE", field:"angle", value:refrigeratorOpportunity.angle });
assert.equal(refrigeratorPayload.narrativeSource.value, refrigeratorOpportunity.angle);
assert.match(refrigeratorPayload.primaryStoryIdeaTask.sourceRole, /not an outline, checklist/u);
assert.match(refrigeratorPayload.outputControl.story, /Do not cover every criterion, solution, or observation/u);

const syntheticPetPayload = JSON.parse(buildCommerceContentInput({ opportunity: syntheticCompositePetOpportunity, media: null }));
assert.deepEqual(syntheticPetPayload.narrativeSource, { source:"AI_INFERENCE", field:"angle", value:syntheticCompositePetOpportunity.angle });
assert.match(syntheticPetPayload.primaryStoryIdeaTask.requirement, /choose exactly one human-scale/u);
assert.equal(syntheticPetPayload.primaryStoryIdeaTask.sourceRole.includes("composite source"), true);

const relevantTopic = await generateCommerceContent({}, { workspaceId: "workspace-a", opportunity }, {
  listLinks: async () => [], getMedia: async () => null, getProfile: async () => ({ profile: {} }), composePrompt: () => "persona prompt",
  readTopics: async () => ({ topics: [topic("car cleanup routine", { id: "topic-car", talkingPoints: ["car cleanup"], personaRelevance: "car cleanup", allowedAngles: ["routine"] })] }),
  generate: async (_env, value) => { generatedInput = value; return { text: "Cleaning a car is easier when the next step is obvious.", primaryStoryIdea: "The next cleanup step is easier when it is obvious.", contentAngle: "RELATABLE_MOMENT", hookType: "OBSERVATION" }; },
});
assert.equal(relevantTopic.usedCurrentTopic, true);
assert.match(relevantTopic.currentTopicId, /^current_topic:/u);
assert.match(generatedInput.input, /car cleanup routine/);

await assert.rejects(() => generateCommerceContent({}, { workspaceId: "workspace-a", opportunity }, { listLinks: async () => [], getMedia: async () => null, getProfile: async () => ({ profile: {} }), composePrompt: () => "persona prompt", generate: async () => ({ text: "Invalid metadata", primaryStoryIdea: "A valid thought", contentAngle: "PROMOTION", hookType: "CURIOSITY" }) }), (error) => error instanceof CommerceContentError && error.code === "commerce_content_generation_invalid");
await assert.rejects(() => generateCommerceContent({}, { workspaceId: "workspace-a", opportunity }, { listLinks: async () => [], getMedia: async () => null, getProfile: async () => ({ profile: {} }), composePrompt: () => "persona prompt", generate: async () => ({ text: "Missing idea", primaryStoryIdea: "", contentAngle: "OBSERVATION", hookType: "CURIOSITY" }) }), (error) => error instanceof CommerceContentError && error.code === "commerce_content_generation_invalid");
await assert.rejects(() => generateCommerceContent({}, { workspaceId: "workspace-a", opportunity: { ...opportunity, productName: "" } }), (error) => error instanceof CommerceContentError && error.code === "commerce_content_product_name_required");
const tagsOnlyPayload = JSON.parse(buildCommerceContentInput({ opportunity, media: tagsOnlyMedia }));
assert.equal(tagsOnlyPayload.narrativeSource.source, "AI_INFERENCE");
assert.equal(tagsOnlyPayload.evidenceOnly.media.experienceNote, undefined);
console.log("commerce content fixtures passed");
