import {
  requireAdminApiSession,
} from "../middleware/auth.js";

import {
  getScoredContentPoolCandidates,
} from "../services/content-pool-scoring.js";

import {
  buildAiCandidatePackage,
} from "../services/ai-candidate-package.js";

import {
  selectAiCandidate,
} from "../services/ai-candidate-selector.js";

import {
  ok,
  fail,
} from "../utils/response.js";

function sideEffects() {
  return {
    kvWrite: false,
    threadsPublish: false,
    poolMutation: false,
  };
}

function safeSelection(result) {
  const selection = result?.selection || {};
  const fallbackCategory =
    result?.source === "fallback"
      ? result?.fallback?.category || "deterministic_scoring_fallback"
      : null;

  return {
    candidateId: selection.candidateId || null,
    productId: selection.productId || null,
    mediaId: selection.mediaId || null,
    contentType: selection.contentType || null,
    source: result?.source === "fallback" ? "fallback" : "ai",
    reason:
      result?.source === "fallback"
        ? "deterministic_scoring_fallback"
        : "ai_selection",
    fallbackCategory,
  };
}

export async function runAiSelectionDiagnostic(
  env,
  {
    at = new Date(),
    services = {},
  } = {}
) {
  const getScored =
    services.getScoredContentPoolCandidates ||
    getScoredContentPoolCandidates;
  const buildPackage =
    services.buildAiCandidatePackage ||
    buildAiCandidatePackage;
  const selectCandidate =
    services.selectAiCandidate ||
    selectAiCandidate;

  const scoredCandidates =
    await getScored(env, { at });
  const candidatePackage =
    await buildPackage(env, { at });
  const totalCandidates =
    scoredCandidates.length;
  const eligibleCandidates =
    scoredCandidates.filter(
      (candidate) => candidate.eligible
    ).length;

  if (!candidatePackage.candidates.length) {
    return {
      totalCandidates,
      eligibleCandidates,
      packagedCandidates: 0,
      selection: null,
      validation: {
        ok: false,
        reason: "no_eligible_candidates",
      },
      sideEffects: sideEffects(),
    };
  }

  const result =
    await selectCandidate(env, {
      candidatePackage,
    });

  return {
    totalCandidates,
    eligibleCandidates,
    packagedCandidates:
      candidatePackage.candidates.length,
    selection: safeSelection(result),
    validation: {
      ok: true,
    },
    sideEffects: sideEffects(),
  };
}

export async function handleAiSelectionDiagnostic(
  request,
  env
) {
  const adminAuth =
    await requireAdminApiSession(
      request,
      env
    );

  if (!adminAuth.ok) {
    return adminAuth.response;
  }

  if (request.method !== "POST") {
    return fail("Method Not Allowed", 405);
  }

  try {
    return ok(
      await runAiSelectionDiagnostic(env)
    );
  } catch (error) {
    console.error(
      "AI selection diagnostic failed",
      {
        code: error?.code || "ai_selection_diagnostic_failed",
        category: error?.details?.category || null,
      }
    );

    return fail(
      "AI selection diagnostic failed",
      502,
      {
        code: error?.code || "ai_selection_diagnostic_failed",
        category: error?.details?.category || null,
        sideEffects: sideEffects(),
      }
    );
  }
}
