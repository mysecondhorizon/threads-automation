import { config } from "../config.js";
import { getProducts } from "./products.js";
import { isMediaAvailable, listMedia } from "./media.js";
import { getScoredContentPoolCandidates } from "./content-pool-scoring.js";

export const DEFAULT_AI_CANDIDATE_LIMIT = 5;

export class AiCandidateSelectionError extends Error {
  constructor(message, code = "ai_candidate_selection_invalid", details = null) {
    super(message);
    this.name = "AiCandidateSelectionError";
    this.code = code;
    this.details = details;
  }
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizeLimit(value) {
  if (value === undefined) return DEFAULT_AI_CANDIDATE_LIMIT;
  return Math.max(1, Math.min(50, Math.trunc(Number(value) || DEFAULT_AI_CANDIDATE_LIMIT)));
}

function mediaPublicUrl(mediaId) {
  return `${config.app.baseUrl}/media/${encodeURIComponent(mediaId)}`;
}

function publicProduct(product) {
  if (!product || product.active !== true) return null;
  return {
    productId: product.id,
    productKey: product.productKey || null,
    name: product.name,
    category: product.category,
    description: product.description,
    experienceStatus: product.experienceStatus,
    experience: product.experience,
    selectionReason: product.selectionReason,
  };
}

function publicMedia(media, at) {
  if (!media || media.active !== true) return null;
  return {
    mediaId: media.id,
    sourceType: media.sourceType,
    altText: media.altText,
    description: media.description,
    tags: Array.isArray(media.tags) ? [...media.tags] : [],
    publicUrl: mediaPublicUrl(media.id),
    availability: {
      active: media.active === true,
      available: isMediaAvailable(media, at),
      maxUses: media.maxUses,
      usedCount: media.usedCount,
      cooldownDays: media.cooldownDays,
      lastUsedAt: media.lastUsedAt,
    },
  };
}

function packageCandidate(scored, productsById, mediaById, at) {
  const candidate = scored.candidate || {};
  const product = candidate.productId
    ? publicProduct(productsById.get(candidate.productId))
    : null;
  const media = (Array.isArray(candidate.mediaIds) ? candidate.mediaIds : [])
    .map((mediaId) => publicMedia(mediaById.get(mediaId), at))
    .filter((item) => item?.availability.available === true);

  return {
    candidateId: candidate.id,
    type: candidate.type,
    priority: candidate.priority,
    score: scored.score,
    scoreBreakdown: { ...scored.scoreBreakdown },
    topics: Array.isArray(candidate.topics) ? [...candidate.topics] : [],
    allowedContentTypes: Array.isArray(candidate.allowedContentTypes)
      ? [...candidate.allowedContentTypes]
      : [],
    productId: candidate.productId || null,
    product,
    mediaIds: Array.isArray(candidate.mediaIds) ? [...candidate.mediaIds] : [],
    media,
  };
}

export async function buildAiCandidatePackage(env, options = {}) {
  const at = new Date(options.at || new Date());
  if (Number.isNaN(at.getTime())) {
    throw new AiCandidateSelectionError(
      "Candidate package evaluation time is invalid",
      "ai_candidate_time_invalid"
    );
  }

  const scored = await getScoredContentPoolCandidates(env, {
    at,
    type: options.type,
    contentType: options.contentType,
  });
  const eligible = scored.filter((item) => item.eligible).slice(0, normalizeLimit(options.limit));
  const productIds = new Set(eligible.map((item) => item.candidate?.productId).filter(Boolean));
  const mediaIds = new Set(
    eligible.flatMap((item) => Array.isArray(item.candidate?.mediaIds) ? item.candidate.mediaIds : [])
  );

  const [products, mediaRecords] = await Promise.all([
    productIds.size ? getProducts(env) : [],
    mediaIds.size ? listMedia(env) : [],
  ]);
  const productsById = new Map(products.map((product) => [product.id, product]));
  const mediaById = new Map(mediaRecords.map((media) => [media.id, media]));

  return {
    version: 1,
    generatedAt: at.toISOString(),
    limit: normalizeLimit(options.limit),
    candidates: eligible.map((item) => packageCandidate(item, productsById, mediaById, at)),
  };
}

function selectionError(message, code, details = null) {
  return new AiCandidateSelectionError(message, code, details);
}

export function validateAiCandidateSelection(candidatePackage, selection) {
  const candidates = Array.isArray(candidatePackage?.candidates)
    ? candidatePackage.candidates
    : [];
  const candidateId = text(selection?.candidateId);
  const candidate = candidates.find((item) => item.candidateId === candidateId);
  if (!candidate) {
    throw selectionError("AI selected an unknown candidate", "ai_candidate_not_found", { candidateId });
  }

  const contentType = text(selection?.contentType);
  if (!contentType) {
    throw selectionError("AI selection contentType is required", "ai_selection_content_type_missing");
  }
  if (candidate.allowedContentTypes.length && !candidate.allowedContentTypes.includes(contentType)) {
    throw selectionError("AI selected an unsupported contentType", "ai_selection_content_type_mismatch", { candidateId, contentType });
  }

  if (candidate.productId && !candidate.product) {
    throw selectionError("AI candidate product is missing or inactive", "ai_selection_product_unavailable", { candidateId, productId: candidate.productId });
  }

  const productId = selection?.productId == null ? null : text(selection.productId);
  if (productId !== null && productId !== candidate.productId) {
    throw selectionError("AI selected a product not linked to the candidate", "ai_selection_product_mismatch", { candidateId, productId });
  }
  if (productId !== null && !candidate.product) {
    throw selectionError("AI selected a missing or inactive product", "ai_selection_product_unavailable", { candidateId, productId });
  }

  const mediaId = selection?.mediaId == null ? null : text(selection.mediaId);
  const media = mediaId === null ? null : candidate.media.find((item) => item.mediaId === mediaId);
  if (mediaId !== null && !media) {
    throw selectionError("AI selected media not linked to the candidate", "ai_selection_media_mismatch", { candidateId, mediaId });
  }

  return {
    candidateId,
    productId,
    mediaId,
    contentType,
    reason: text(selection?.reason) || null,
    publicUrl: media?.publicUrl || null,
  };
}

export function selectDeterministicAiFallback(candidatePackage, contentType = "TEXT") {
  const candidate = candidatePackage?.candidates?.[0];
  if (!candidate) {
    throw selectionError("No eligible candidate is available for fallback", "ai_fallback_candidate_missing");
  }
  const selectedType = candidate.allowedContentTypes.includes(contentType)
    ? contentType
    : candidate.allowedContentTypes[0] || contentType;
  return validateAiCandidateSelection(candidatePackage, {
    candidateId: candidate.candidateId,
    productId: candidate.productId,
    mediaId: candidate.media?.[0]?.mediaId || null,
    contentType: selectedType,
    reason: "deterministic_scoring_fallback",
  });
}
