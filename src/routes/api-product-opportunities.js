import { requireAdminApiSession } from "../middleware/auth.js";
import {
  ProductOpportunityError,
  getProductOpportunityById,
  listProductOpportunities,
  removeProductOpportunity,
  saveProductOpportunity,
} from "../services/product-opportunities.js";
import { discoverProductOpportunities } from "../services/product-opportunity-discovery.js";
import {
  ProductOpportunityAssetError,
  linkProductOpportunityAsset,
  listProductOpportunityAssets,
  unlinkProductOpportunityAsset,
} from "../services/product-opportunity-assets.js";
import { getProductOpportunityAssetCandidates } from "../services/product-opportunity-asset-matcher.js";
import { getMedia } from "../services/media.js";
import { fail, ok } from "../utils/response.js";

const EDITABLE_FIELDS = new Set([
  "productName",
  "category",
  "status",
  "brand",
  "sourceUrl",
  "affiliateLink",
  "problem",
  "audience",
  "situation",
  "angle",
  "discoveryReason",
  "signalSources",
  "trendScore",
  "personaFitScore",
  "purchaseIntentScore",
  "contentPotentialScore",
  "experiencePotentialScore",
  "affiliatePotentialScore",
  "opportunityScore",
  "useCount",
  "lastUsedAt",
]);

async function authorize(request, env) {
  return requireAdminApiSession(request, env, { allowSelectedWorkspace: true });
}

async function readInput(request) {
  try {
    const input = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    if (!Object.keys(input).length || Object.keys(input).some((key) => !EDITABLE_FIELDS.has(key))) {
      return null;
    }
    return input;
  } catch {
    return null;
  }
}

function errorResponse(error) {
  if (error instanceof ProductOpportunityError) {
    if (error.code === "product_opportunity_not_found") {
      return fail("Product Opportunity not found", 404, { code: error.code });
    }
    return fail("Invalid Product Opportunity", 400, { code: error.code });
  }
  return fail("Product Opportunity request failed", 400, { code: "product_opportunity_request_failed" });
}

function safeAsset(media) {
  return { id: media.id, kind: media.mediaKind === "video" ? "video" : "image", description: media.description || "", tags: Array.isArray(media.tags) ? [...media.tags] : [], experienceTags: Array.isArray(media.experienceTags) ? [...media.experienceTags] : [], experienceNote: media.experienceNote || null, hasUserExperience: Boolean(media.experienceNote), active: media.active === true, sceneType: media.sceneType || null, usableAngles: Array.isArray(media.usableAngles) ? [...media.usableAngles] : [], previewUrl: `/media/${encodeURIComponent(media.id)}` };
}

async function readMediaId(request) {
  try {
    const input = await request.json();
    return input && typeof input === "object" && !Array.isArray(input) && Object.keys(input).length === 1 && typeof input.mediaId === "string" && input.mediaId.trim() ? input.mediaId.trim() : null;
  } catch { return null; }
}

function assetErrorResponse(error) {
  if (error instanceof ProductOpportunityAssetError && /_not_found$/u.test(error.code)) return fail("Product Opportunity or media not found", 404, { code: error.code });
  if (error instanceof ProductOpportunityAssetError) return fail("Invalid Product Opportunity asset", 400, { code: error.code });
  return fail("Product Opportunity asset request failed", 400, { code: "product_opportunity_asset_request_failed" });
}

export async function handleProductOpportunityAssets(request, env, opportunityId, assetPath = null, {
  getOpportunity = getProductOpportunityById,
  candidates = getProductOpportunityAssetCandidates,
  listLinks = listProductOpportunityAssets,
  link = linkProductOpportunityAsset,
  unlink = unlinkProductOpportunityAsset,
  get = getMedia,
} = {}) {
  const authorization = await authorize(request, env);
  if (!authorization.ok) return authorization.response;
  const opportunity = await getOpportunity(env, opportunityId, authorization.workspaceId);
  if (!opportunity) return fail("Product Opportunity not found", 404, { code: "product_opportunity_not_found" });
  try {
    if (assetPath === "candidates") {
      if (request.method !== "GET") return fail("Method Not Allowed", 405);
      return ok({ candidates: await candidates(env, opportunity, authorization.workspaceId) });
    }
    if (assetPath === null) {
      if (request.method === "GET") {
        const links = await listLinks(env, opportunityId, authorization.workspaceId);
        const media = await Promise.all(links.map((record) => get(env, record.mediaId, authorization.workspaceId)));
        return ok({ assets: media.filter(Boolean).map(safeAsset) });
      }
      if (request.method !== "POST") return fail("Method Not Allowed", 405);
      const mediaId = await readMediaId(request);
      if (!mediaId) return fail("Invalid Product Opportunity asset", 400, { code: "product_opportunity_asset_input_invalid" });
      const relation = await link(env, opportunityId, mediaId, authorization.workspaceId);
      const media = await get(env, mediaId, authorization.workspaceId);
      return ok({ relation, asset: safeAsset(media) }, relation.created ? 201 : 200);
    }
    if (request.method !== "DELETE") return fail("Method Not Allowed", 405);
    const removed = await unlink(env, opportunityId, assetPath, authorization.workspaceId);
    return removed ? ok({ removed: true }) : fail("Product Opportunity asset not found", 404, { code: "product_opportunity_asset_not_found" });
  } catch (error) { return assetErrorResponse(error); }
}

async function hasEmptyBody(request) {
  try {
    return !(await request.text()).trim();
  } catch {
    return false;
  }
}

export async function handleProductOpportunityDiscovery(request, env, {
  discover = discoverProductOpportunities,
} = {}) {
  const authorization = await authorize(request, env);
  if (!authorization.ok) return authorization.response;
  if (request.method !== "POST") return fail("Method Not Allowed", 405);
  if (!await hasEmptyBody(request)) {
    return fail("Invalid Product Opportunity discovery request", 400, { code: "product_opportunity_discovery_input_invalid" });
  }
  try {
    return ok({ discovery: await discover(env, { workspaceId: authorization.workspaceId }) });
  } catch {
    return fail("Product Opportunity discovery failed", 502, { code: "product_opportunity_discovery_failed" });
  }
}

export async function handleProductOpportunitiesCollection(request, env, {
  list = listProductOpportunities,
  save = saveProductOpportunity,
} = {}) {
  const authorization = await authorize(request, env);
  if (!authorization.ok) return authorization.response;

  try {
    if (request.method === "GET") {
      return ok({ opportunities: await list(env, authorization.workspaceId) });
    }
    if (request.method !== "POST") return fail("Method Not Allowed", 405);
    const input = await readInput(request);
    if (!input) return fail("Invalid Product Opportunity", 400, { code: "product_opportunity_input_invalid" });
    return ok({ opportunity: await save(env, input, authorization.workspaceId) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleProductOpportunityById(request, env, opportunityId, {
  get = getProductOpportunityById,
  save = saveProductOpportunity,
  remove = removeProductOpportunity,
} = {}) {
  const authorization = await authorize(request, env);
  if (!authorization.ok) return authorization.response;

  try {
    if (request.method === "GET") {
      const opportunity = await get(env, opportunityId, authorization.workspaceId);
      return opportunity
        ? ok({ opportunity })
        : fail("Product Opportunity not found", 404, { code: "product_opportunity_not_found" });
    }
    if (request.method === "PATCH") {
      const input = await readInput(request);
      if (!input) return fail("Invalid Product Opportunity", 400, { code: "product_opportunity_input_invalid" });
      const existing = await get(env, opportunityId, authorization.workspaceId);
      if (!existing) return fail("Product Opportunity not found", 404, { code: "product_opportunity_not_found" });
      return ok({ opportunity: await save(env, { ...input, id: opportunityId }, authorization.workspaceId) });
    }
    if (request.method === "DELETE") {
      const removed = await remove(env, opportunityId, authorization.workspaceId);
      return removed
        ? ok({ removed: true })
        : fail("Product Opportunity not found", 404, { code: "product_opportunity_not_found" });
    }
    return fail("Method Not Allowed", 405);
  } catch (error) {
    return errorResponse(error);
  }
}
