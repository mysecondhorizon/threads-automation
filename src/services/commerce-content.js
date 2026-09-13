import { requestOpenAiJson } from "./ai.js";
import { listProductOpportunityAssets } from "./product-opportunity-assets.js";
import { getMedia } from "./media.js";
import { getEffectivePromptProfile, composeEffectiveThreadsPrompt } from "./prompt-profile.js";
import { DEFAULT_WORKSPACE_ID } from "./workspace-foundation.js";

export const COMMERCE_CONTENT_BASIS = "PRODUCT_OPPORTUNITY";

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

export function buildCommerceContentInput({ opportunity, media }) {
  const note = experienceNote(media);
  const productFacts = {
    productName: text(opportunity?.productName),
    brand: text(opportunity?.brand) || null,
    category: text(opportunity?.category) || null,
    sourceUrl: text(opportunity?.sourceUrl) || null,
    affiliateLink: text(opportunity?.affiliateLink) || null,
  };
  const aiInference = {
    problem: text(opportunity?.problem) || null,
    audience: text(opportunity?.audience) || null,
    situation: text(opportunity?.situation) || null,
    angle: text(opportunity?.angle) || null,
    discoveryReason: text(opportunity?.discoveryReason) || null,
    scores: Object.fromEntries([
      "trendScore", "personaFitScore", "purchaseIntentScore", "contentPotentialScore", "experiencePotentialScore", "affiliatePotentialScore", "opportunityScore",
    ].map((field) => [field, Number.isFinite(opportunity?.[field]) ? opportunity[field] : null])),
  };
  const mediaContext = media ? {
    mediaKind: media.mediaKind === "video" ? "video" : "image",
    description: text(media.description) || null,
    altText: text(media.altText) || null,
    tags: Array.isArray(media.tags) ? media.tags.map(text).filter(Boolean) : [],
    experienceTags: Array.isArray(media.experienceTags) ? media.experienceTags.map(text).filter(Boolean) : [],
    ...(note ? { userExperienceNote: note } : {}),
  } : null;

  return JSON.stringify({
    productFacts,
    aiInference,
    mediaContext,
    instructions: {
      language: "Korean",
      format: "A concise, natural Threads post for a realistic mid/late-30s office worker. Practical, observant, warm and forward-looking; lightly humorous only when natural.",
      provenance: {
        PRODUCT_FACT: "Only productFacts are objective product facts.",
        USER_EXPERIENCE: note ? "Only mediaContext.userExperienceNote is factual first-person experience evidence." : "No USER_EXPERIENCE evidence is available.",
        AI_INFERENCE: "aiInference is framing only, never personal experience or product fact.",
      },
      safety: note
        ? "Any first-person claim must stay strictly within userExperienceNote. Do not add purchase, ownership, duration, comparison, location, price, specification, satisfaction, or use facts not explicitly in that note. experienceTags, visual tags, description, and altText are context only, never personal experience evidence."
        : "Do not use first-person product-use, purchase, ownership, satisfaction, comparison-from-use, or long-term-experience claims. Write non-first-person commerce copy only. experienceTags, visual tags, description, and altText are context only, never personal experience evidence.",
      urlPolicy: "Do not copy, rewrite, shorten, fabricate, or embed sourceUrl or affiliateLink in the prose. They remain metadata outside the draft.",
      avoid: ["hard-sell language", "fake urgency", "fabricated discounts or prices", "unsupported specifications", "fake testimonials", "fabricated comparison claims"],
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
  const links = await listLinks(env, opportunity.id, scope);
  const mediaRecords = await Promise.all((Array.isArray(links) ? links : []).map((link) => get(env, text(link?.mediaId), scope)));
  const media = selectCommerceContentAsset(links, mediaRecords, scope);
  const profileResult = await getProfile(env, scope);
  const generated = await generate(env, {
    instructions: commerceInstructions(composePrompt(profileResult?.profile || {})),
    input: buildCommerceContentInput({ opportunity, media }),
    name: "commerce_threads_draft",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: { text: { type: "string" } },
      required: ["text"],
    },
  });

  return {
    text: normalizeDraftText(generated?.text),
    contentBasis: COMMERCE_CONTENT_BASIS,
    opportunityId: opportunity.id,
    mediaId: media?.id || null,
    mediaKind: media ? (media.mediaKind === "video" ? "video" : "image") : null,
    usedUserExperience: Boolean(experienceNote(media)),
    affiliateLink: text(opportunity.affiliateLink) || null,
  };
}
