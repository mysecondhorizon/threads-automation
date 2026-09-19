import { requestOpenAiJson } from "./ai.js";
import { listProductOpportunityAssets } from "./product-opportunity-assets.js";
import { getMedia } from "./media.js";
import { getEffectivePromptProfile, composeEffectiveThreadsPrompt } from "./prompt-profile.js";
import { DEFAULT_WORKSPACE_ID } from "./workspace-foundation.js";
import { buildCurrentTopicGenerationContext, readCurrentTopicInventory } from "./current-topic-inventory.js";

export const COMMERCE_CONTENT_BASIS = "PRODUCT_OPPORTUNITY";
export const COMMERCE_CONTENT_ANGLES = ["FAILURE", "OBSERVATION", "REVERSAL", "DISCOVERY", "COMPARISON", "RELATABLE_MOMENT", "QUESTION", "PRACTICAL_TIP"];
export const COMMERCE_HOOK_TYPES = ["CONTRARIAN", "CURIOSITY", "CONFESSION", "SPECIFIC_MOMENT", "UNEXPECTED_RESULT", "DIRECT_QUESTION", "OBSERVATION"];

export class CommerceContentError extends Error {
  constructor(message, code = "commerce_content_failed") {
    super(message);
    this.name = "CommerceContentError";
    this.code = code;
  }
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function workspace(value) {
  return value === undefined || value === null ? DEFAULT_WORKSPACE_ID : text(value);
}

function storedWorkspace(value) {
  return text(value?.workspaceId) || DEFAULT_WORKSPACE_ID;
}

function fail(message, code) {
  throw new CommerceContentError(message, code);
}

function usableCommerceMedia(media, workspaceId) {
  return media && storedWorkspace(media) === workspaceId && media.sourceType === "product" && media.active === true && ["image", "video"].includes(media.mediaKind)
    ? media
    : null;
}

function experienceNote(media) {
  return text(media?.experienceNote) || null;
}

function normalizedWords(value) {
  return text(value).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
}

const WEAK_COMMERCE_TOPIC_TOKENS = new Set([
  "추석", "명절", "가을", "겨울", "봄", "여름", "계절", "선물", "할인", "세일", "상품", "제품", "구매", "온라인", "오프라인", "추천", "생활", "관리",
]);

function isWeakCommerceTopicToken(value) {
  const token = text(value).toLowerCase();
  return WEAK_COMMERCE_TOPIC_TOKENS.has(token) ||
    ["추석", "명절", "가을", "겨울", "봄", "여름", "선물", "할인", "세일", "상품", "제품", "구매", "온라인", "오프라인", "추천", "생활", "관리"].some((prefix) => token.startsWith(prefix));
}

function topicWords(topic) {
  return normalizedWords([
    topic?.subject,
    topic?.personaRelevance,
    ...(Array.isArray(topic?.talkingPoints) ? topic.talkingPoints : []),
    ...(Array.isArray(topic?.allowedAngles) ? topic.allowedAngles : []),
  ].join(" "));
}

export function selectRelevantCommerceCurrentTopic(opportunity, topics) {
  const opportunityWords = new Set(normalizedWords([
    opportunity?.productName,
    opportunity?.category,
    opportunity?.problem,
    opportunity?.audience,
    opportunity?.situation,
    opportunity?.angle,
    opportunity?.discoveryReason,
  ].join(" ")).filter((word) => !isWeakCommerceTopicToken(word)));
  if (!opportunityWords.size || !Array.isArray(topics)) return null;

  const candidates = [];
  for (const topic of topics.slice(0, 8)) {
    const context = buildCurrentTopicGenerationContext(topic);
    if (!context) continue;
    const overlap = [...new Set(topicWords(context)
      .filter((word) => !isWeakCommerceTopicToken(word))
      .filter((word) => opportunityWords.has(word)))];
    if (!overlap.length) continue;
    candidates.push({
      context,
      score: overlap.reduce((total, word) => total + (word.length >= 5 ? 3 : 2), 0),
    });
  }
  candidates.sort((left, right) => right.score - left.score || left.context.topicId.localeCompare(right.context.topicId));
  return candidates[0]?.context || null;
}

export function normalizeCommerceStoryMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const expectedKeys = ["contentAngle", "hookType", "usedCurrentTopic", "currentTopicId", "usedUserExperience"];
  if (Object.keys(value).length !== expectedKeys.length || Object.keys(value).some((key) => !expectedKeys.includes(key))) return null;
  const contentAngle = text(value.contentAngle);
  const hookType = text(value.hookType);
  const usedCurrentTopic = value.usedCurrentTopic === true;
  const currentTopicId = text(value.currentTopicId) || null;
  const usedUserExperience = value.usedUserExperience === true;
  if (!COMMERCE_CONTENT_ANGLES.includes(contentAngle) || !COMMERCE_HOOK_TYPES.includes(hookType)) return null;
  if ((usedCurrentTopic && !currentTopicId) || (!usedCurrentTopic && currentTopicId)) return null;
  return { contentAngle, hookType, usedCurrentTopic, currentTopicId, usedUserExperience };
}

export function selectCommerceContentAsset(links, mediaRecords, workspaceId) {
  const scope = workspace(workspaceId);
  if (!scope || !Array.isArray(links) || !Array.isArray(mediaRecords)) return null;
  const mediaById = new Map(mediaRecords.map((media) => [text(media?.id), usableCommerceMedia(media, scope)]));
  const candidates = links
    .filter((link) => storedWorkspace(link) === scope)
    .map((link) => ({ link, media: mediaById.get(text(link?.mediaId)) }))
    .filter((candidate) => candidate.media)
    .sort((left, right) => {
      const experienceOrder = Number(Boolean(experienceNote(right.media))) - Number(Boolean(experienceNote(left.media)));
      if (experienceOrder) return experienceOrder;
      return text(left.media.id).localeCompare(text(right.media.id));
    });
  return candidates[0]?.media || null;
}

export function selectCommerceNarrativeSource(opportunity, media) {
  const note = experienceNote(media);
  if (note) return { source: "USER_EXPERIENCE", field: "experienceNote", value: note };
  for (const field of ["angle", "situation", "problem"]) {
    const value = text(opportunity?.[field]);
    if (value) return { source: "AI_INFERENCE", field, value };
  }
  const productName = text(opportunity?.productName);
  return productName ? { source: "PRODUCT_FACT", field: "productName", value: productName } : null;
}

export function buildCommerceContentInput({ opportunity, media, currentTopic = null }) {
  const note = experienceNote(media);
  const narrativeSource = selectCommerceNarrativeSource(opportunity, media);
  const narrativeFields = Object.fromEntries(
    ["angle", "situation", "problem"]
      .filter((field) => field !== narrativeSource?.field)
      .map((field) => [field, text(opportunity?.[field]) || null]),
  );
  const mediaEvidence = media ? {
    mediaKind: media.mediaKind === "video" ? "video" : "image",
    description: text(media.description) || null,
    altText: text(media.altText) || null,
    tags: Array.isArray(media.tags) ? media.tags.map(text).filter(Boolean) : [],
    experienceTags: Array.isArray(media.experienceTags) ? media.experienceTags.map(text).filter(Boolean) : [],
  } : null;

  return JSON.stringify({
    subject: {
      source: "PRODUCT_OPPORTUNITY",
      productName: text(opportunity?.productName),
      category: text(opportunity?.category) || null,
    },
    narrativeSource,
    primaryStoryIdeaTask: {
      requirement: "Before writing, choose exactly one human-scale observation, tension, realization, comparison, question, or practical thought directly supported by NARRATIVE_SOURCE. Return that one thought as primaryStoryIdea and materially develop it in the final text.",
      sourceRole: "NARRATIVE_SOURCE is source material, not an outline, checklist, set of required items, or text that must be fully paraphrased. A composite source may contain several commercial criteria or solutions; select one underlying thought and omit the rest unless a small supporting reference is naturally necessary.",
      provenance: "Choosing a primaryStoryIdea never strengthens the factual authority of NARRATIVE_SOURCE. AI_INFERENCE remains non-personal inference; PRODUCT_FACT remains factual reference only; USER_EXPERIENCE remains limited to its exact note.",
    },
    evidenceOnly: {
      productOpportunity: {
        brand: text(opportunity?.brand) || null,
        category: text(opportunity?.category) || null,
        narrativeFields,
        audience: text(opportunity?.audience) || null,
        discoveryReason: text(opportunity?.discoveryReason) || null,
      },
      ...(mediaEvidence ? { media: mediaEvidence } : {}),
      ...(currentTopic ? {
        currentTopic: {
          subject: currentTopic.subject,
          verifiedFacts: currentTopic.verifiedFacts,
          talkingPoints: currentTopic.talkingPoints,
          personaRelevance: currentTopic.personaRelevance,
          allowedAngles: currentTopic.allowedAngles,
        },
      } : {}),
    },
    provenanceSafety: {
      PRODUCT_FACT: "ProductOpportunity subject and evidenceOnly fields are factual reference only, not personal experience evidence.",
      USER_EXPERIENCE: note ? "Only narrativeSource.value is factual first-person experience evidence." : "No USER_EXPERIENCE evidence is available.",
      AI_INFERENCE: "Narrative field labels are framing only, never personal experience or objective product fact.",
      CURRENT_TOPIC: currentTopic ? { forbiddenClaims: currentTopic.forbiddenClaims } : null,
    },
    outputControl: {
      language: "Korean",
      format: "Write a concise Korean Threads-native Commerce story.",
      roles: "SUBJECT defines what the post must materially remain about. NARRATIVE_SOURCE supplies material from which PRIMARY_STORY_IDEA selects one thought to develop. EVIDENCE_ONLY is optional reference material for factual accuracy only: it is not a checklist, outline, or set of facts that must appear in the post, and most or all of it may be omitted. PROVENANCE_SAFETY defines what may be claimed. EVIDENCE_ONLY must never override NARRATIVE_SOURCE, PRIMARY_STORY_IDEA, or SUBJECT.",
      story: "ProductOpportunity is the mandatory SUBJECT. First choose one PRIMARY_STORY_IDEA directly supported by NARRATIVE_SOURCE, then let that idea earn attention before a natural product/problem connection. Do not cover every criterion, solution, or observation contained in a composite NARRATIVE_SOURCE. The product name need not appear in the opening or at all when the connection remains material. The post must stand on its own even without a purchase. Do not lead with catalog benefits, recommendation, CTA, SEO, listicle, feature dump, fake quote, fake dialogue, fake number, or hard-sell language. Avoid routine openings about fatigue, aging, office complaints, parenting exhaustion, or financial anxiety unless the supplied material genuinely requires them. Current Topic is EVIDENCE_ONLY supporting flavor: never use it as the main story, replace the ProductOpportunity subject or PRIMARY_STORY_IDEA with it, or make the ProductOpportunity incidental merely because the topic is timely.",
      angleSelection: `Choose exactly one contentAngle from ${COMMERCE_CONTENT_ANGLES.join(", ")} and one hookType from ${COMMERCE_HOOK_TYPES.join(", ")}. The labels describe a useful generated strategy, never a rigid writing template. The opening one or two lines must create factual curiosity or tension, never fake clickbait. A FAILURE or CONFESSION first-person claim is allowed only when NARRATIVE_SOURCE is USER_EXPERIENCE and explicitly supports it. A QUESTION must be specific and genuinely debatable, never generic engagement bait.`,
      safety: note
        ? "Any first-person claim must stay strictly within narrativeSource.value. Do not add purchase, ownership, duration, comparison, location, price, specification, satisfaction, or use facts not explicitly in that note. experienceTags, visual tags, description, and altText are context only, never personal experience evidence."
        : "Do not use first-person product-use, purchase, ownership, satisfaction, comparison-from-use, or long-term-experience claims. Write non-first-person commerce copy only. experienceTags, visual tags, description, and altText are context only, never personal experience evidence.",
      urlPolicy: "Do not fabricate, embed, or imply a source URL or affiliate link in the prose. They remain metadata outside the draft.",
      avoid: ["hard-sell language", "affiliate language", "fake urgency", "fabricated discounts or prices", "unsupported specifications", "fake testimonials", "fabricated comparison claims", "generic engagement bait", "fake personal history"],
    },
  });
}

function commerceInstructions(systemPrompt) {
  return `${systemPrompt}\n\nCommerce draft boundary: Return only the requested JSON. Follow the supplied provenance and safety instructions exactly. Product facts and AI inference must never become first-person personal claims.`;
}

function normalizeDraftText(value) {
  const result = text(value);
  if (!result || result.length > 500) fail("Commerce draft text is invalid", "commerce_content_generation_invalid");
  return result;
}

function normalizePrimaryStoryIdea(value) {
  const result = text(value);
  if (!result || result.length > 500) fail("Commerce primary story idea is invalid", "commerce_content_generation_invalid");
  return result;
}

export async function generateCommerceContent(env, { workspaceId, opportunity } = {}, dependencies = {}) {
  const scope = workspace(workspaceId);
  if (!scope) fail("Commerce workspace is invalid", "commerce_content_workspace_invalid");
  if (!text(opportunity?.id)) fail("Product Opportunity was not found", "commerce_content_opportunity_not_found");
  if (storedWorkspace(opportunity) !== scope) fail("Product Opportunity was not found", "commerce_content_opportunity_not_found");
  if (!text(opportunity.productName)) fail("Product Opportunity productName is required", "commerce_content_product_name_required");

  const listLinks = dependencies.listLinks || listProductOpportunityAssets;
  const get = dependencies.getMedia || getMedia;
  const getProfile = dependencies.getProfile || getEffectivePromptProfile;
  const composePrompt = dependencies.composePrompt || composeEffectiveThreadsPrompt;
  const generate = dependencies.generate || requestOpenAiJson;
  const readTopics = dependencies.readTopics || readCurrentTopicInventory;
  const selectTopic = dependencies.selectTopic || selectRelevantCommerceCurrentTopic;
  const [links, inventory] = await Promise.all([
    listLinks(env, opportunity.id, scope),
    readTopics(env).catch(() => ({ topics: [] })),
  ]);
  const mediaRecords = await Promise.all((Array.isArray(links) ? links : []).map((link) => get(env, text(link?.mediaId), scope)));
  const media = selectCommerceContentAsset(links, mediaRecords, scope);
  const currentTopic = selectTopic(opportunity, inventory?.topics);
  const profileResult = await getProfile(env, scope);
  const generated = await generate(env, {
    instructions: commerceInstructions(composePrompt(profileResult?.profile || {})),
    input: buildCommerceContentInput({ opportunity, media, currentTopic }),
    name: "commerce_threads_draft",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        text: { type: "string" },
        primaryStoryIdea: { type: "string" },
        contentAngle: { type: "string", enum: COMMERCE_CONTENT_ANGLES },
        hookType: { type: "string", enum: COMMERCE_HOOK_TYPES },
      },
      required: ["text", "primaryStoryIdea", "contentAngle", "hookType"],
    },
  });

  const storyMetadata = normalizeCommerceStoryMetadata({
    contentAngle: generated?.contentAngle,
    hookType: generated?.hookType,
    usedCurrentTopic: Boolean(currentTopic),
    currentTopicId: currentTopic?.topicId || null,
    usedUserExperience: Boolean(experienceNote(media)),
  });
  if (!storyMetadata) fail("Commerce story metadata is invalid", "commerce_content_generation_invalid");
  normalizePrimaryStoryIdea(generated?.primaryStoryIdea);

  return {
    text: normalizeDraftText(generated?.text),
    contentBasis: COMMERCE_CONTENT_BASIS,
    opportunityId: opportunity.id,
    mediaId: media?.id || null,
    mediaKind: media ? (media.mediaKind === "video" ? "video" : "image") : null,
    ...storyMetadata,
    affiliateLink: text(opportunity.affiliateLink) || null,
  };
}
