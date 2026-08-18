import {
  AiServiceError,
  requestOpenAiJson,
} from "./ai.js";

import {
  AiCandidateSelectionError,
  buildAiCandidatePackage,
  selectDeterministicAiFallback,
  validateAiCandidateSelection,
} from "./ai-candidate-package.js";

const SELECTION_INSTRUCTIONS = [
  "Select exactly one candidate from the supplied candidate package.",
  "Return only JSON matching the supplied schema.",
  "candidateId must be one of the supplied candidate IDs.",
  "productId and mediaId must be IDs actually connected to that candidate, or null.",
  "Do not invent IDs, URLs, products, images, or data not present in the package.",
  "Do not return or create a URL; the server will resolve any public media URL.",
].join(" ");

const SELECTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidateId: { type: "string" },
    productId: { anyOf: [{ type: "string" }, { type: "null" }] },
    mediaId: { anyOf: [{ type: "string" }, { type: "null" }] },
    contentType: { type: "string" },
    reason: { type: "string" },
  },
  required: ["candidateId", "productId", "mediaId", "contentType", "reason"],
};

function text(value) {
  return String(value ?? "").trim();
}

function normalizeSelectionResponse(payload) {
  const selection = payload?.selection && typeof payload.selection === "object"
    ? payload.selection
    : payload;
  if (!selection || Array.isArray(selection) || typeof selection !== "object") {
    throw new AiCandidateSelectionError(
      "AI selection response is not an object",
      "ai_selection_response_invalid"
    );
  }
  return {
    candidateId: text(selection.candidateId),
    productId: selection.productId == null ? null : text(selection.productId),
    mediaId: selection.mediaId == null ? null : text(selection.mediaId),
    contentType: text(selection.contentType),
    reason: text(selection.reason),
  };
}

function failureCategory(error) {
  if (error instanceof AiCandidateSelectionError) return "selection_validation";
  if (error instanceof AiServiceError) return error.details?.category || "ai_request";
  return "ai_request";
}

function fallbackResult(candidatePackage, error) {
  const selection = selectDeterministicAiFallback(candidatePackage);
  return {
    selection,
    source: "fallback",
    reason: "deterministic_scoring_fallback",
    fallback: {
      category: failureCategory(error),
    },
  };
}

export async function selectAiCandidate(env, options = {}) {
  const candidatePackage = options.candidatePackage || await buildAiCandidatePackage(env, options);

  try {
    const payload = await requestOpenAiJson(env, {
      instructions: SELECTION_INSTRUCTIONS,
      input: JSON.stringify({
        task: "candidate_selection",
        candidates: candidatePackage.candidates,
      }),
      name: "content_pool_candidate_selection",
      schema: SELECTION_SCHEMA,
    });
    const selection = validateAiCandidateSelection(
      candidatePackage,
      normalizeSelectionResponse(payload)
    );
    return {
      selection,
      source: "ai",
      reason: selection.reason,
      fallback: null,
    };
  } catch (error) {
    return fallbackResult(candidatePackage, error);
  }
}
