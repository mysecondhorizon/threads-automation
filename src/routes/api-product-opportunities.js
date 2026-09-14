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
import { CoupangPartnersError, searchCoupangProducts } from "../services/coupang-partners.js";
import { CommerceContentError, generateCommerceContent } from "../services/commerce-content.js";
import { CommercePublishError, publishCommerceContent } from "../services/commerce-publish.js";
import { getPublishedCommercePostsForOpportunity } from "../services/history.js";
import { buildProductOpportunityPerformanceSummary } from "../services/analytics.js";
import { resolveWorkspaceThreadsConnectedAccount } from "../services/connected-accounts.js";
import { resolveExecutionContext } from "../services/execution-context.js";
import { DEFAULT_WORKSPACE_ID } from "../services/workspace-foundation.js";
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

function coupangErrorResponse(error) {
  if (!(error instanceof CoupangPartnersError)) {
    return fail("Coupang product search failed", 502, { code: "coupang_upstream_failed" });
  }
  if (error.code === "coupang_search_invalid") {
    return fail("Invalid Coupang product search", 400, { code: error.code });
  }
  if (error.code === "coupang_rate_limited") {
    return fail("Coupang product search is temporarily unavailable", 429, { code: error.code });
  }
  if (error.code === "coupang_credentials_unavailable") {
    return fail("Coupang product search is unavailable", 503, { code: error.code });
  }
  return fail("Coupang product search failed", 502, { code: error.code === "coupang_auth_failed" ? error.code : "coupang_upstream_failed" });
}

function commerceContentErrorResponse(error) {
  if (error instanceof CommerceContentError) {
    if (error.code === "commerce_content_opportunity_not_found") {
      return fail("Product Opportunity not found", 404, { code: error.code });
    }
    if (error.code === "commerce_content_product_name_required") {
      return fail("Product Opportunity productName is required", 400, { code: error.code });
    }
    return fail("Commerce content generation failed", 502, { code: "commerce_content_generation_failed" });
  }
  return fail("Commerce content generation failed", 502, { code: "commerce_content_generation_failed" });
}

function commercePublishErrorResponse(error) {
  if (error instanceof CommercePublishError) {
    if (error.code === "commerce_publish_opportunity_not_found") {
      return fail("Product Opportunity not found", 404, { code: error.code });
    }
    if (["commerce_publish_text_required", "commerce_publish_media_unsupported", "commerce_publish_media_not_linked", "commerce_publish_media_invalid"].includes(error.code)) {
      return fail(error.message, 400, { code: error.code });
    }
    return fail("Commerce publishing failed", error.status || 502, { code: error.code });
  }
  return fail("Commerce publishing failed", 502, { code: "commerce_publish_failed" });
}

async function readPublishInput(request) {
  try {
    const input = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const keys = Object.keys(input);
    if (!keys.length || keys.some((key) => key !== "text" && key !== "mediaId")) return null;
    if (typeof input.text !== "string") return null;
    if (input.mediaId !== undefined && input.mediaId !== null && (typeof input.mediaId !== "string" || !input.mediaId.trim())) return null;
    return { text: input.text, mediaId: typeof input.mediaId === "string" ? input.mediaId.trim() : null };
  } catch { return null; }
}

async function resolvePublishMedia(env, opportunityId, workspaceId, mediaId, {
  listLinks = listProductOpportunityAssets,
  get = getMedia,
} = {}) {
  if (!mediaId) return null;
  const linked = await listLinks(env, opportunityId, workspaceId);
  if (!linked.some((record) => record.workspaceId === workspaceId && record.opportunityId === opportunityId && record.mediaId === mediaId)) {
    throw new CommercePublishError("Selected media is not linked to this Product Opportunity", {
      code: "commerce_publish_media_not_linked",
    });
  }
  const media = await get(env, mediaId, workspaceId);
  if (!media || media.workspaceId !== workspaceId || media.sourceType !== "product" || media.active !== true) {
    throw new CommercePublishError("Selected Commerce media is not available", {
      code: "commerce_publish_media_invalid",
    });
  }
  if (media.mediaKind !== "image") {
    throw new CommercePublishError("Only linked images can be published with Commerce content", {
      code: "commerce_publish_media_unsupported",
    });
  }
  return media;
}

function searchQuery(request) {
  try {
    return new URL(request.url).searchParams.get("q") || "";
  } catch {
    return "";
  }
}

export async function handleProductOpportunityProductCandidates(request, env, opportunityId, {
  get = getProductOpportunityById,
  search = searchCoupangProducts,
} = {}) {
  const authorization = await authorize(request, env);
  if (!authorization.ok) return authorization.response;
  if (request.method !== "GET") return fail("Method Not Allowed", 405);
  const query = searchQuery(request).trim();
  if (!query || query.length > 120) {
    return fail("Invalid Coupang product search", 400, { code: "coupang_search_invalid" });
  }
  const opportunity = await get(env, opportunityId, authorization.workspaceId);
  if (!opportunity) return fail("Product Opportunity not found", 404, { code: "product_opportunity_not_found" });
  try {
    const candidates = await search(env, { query, limit: 5 });
    return ok({ query, candidates: Array.isArray(candidates) ? candidates.slice(0, 10) : [] });
  } catch (error) {
    return coupangErrorResponse(error);
  }
}

export async function handleProductOpportunityContentGeneration(request, env, opportunityId, {
  get = getProductOpportunityById,
  generate = generateCommerceContent,
} = {}) {
  const authorization = await authorize(request, env);
  if (!authorization.ok) return authorization.response;
  if (request.method !== "POST") return fail("Method Not Allowed", 405);
  if (!await hasEmptyBody(request)) {
    return fail("Invalid commerce content request", 400, { code: "commerce_content_input_invalid" });
  }
  const opportunity = await get(env, opportunityId, authorization.workspaceId);
  if (!opportunity) return fail("Product Opportunity not found", 404, { code: "product_opportunity_not_found" });
  try {
    return ok({ draft: await generate(env, { workspaceId: authorization.workspaceId, opportunity }) });
  } catch (error) {
    return commerceContentErrorResponse(error);
  }
}

export async function handleProductOpportunityContentPublish(request, env, opportunityId, {
  get = getProductOpportunityById,
  listLinks = listProductOpportunityAssets,
  getMediaById = getMedia,
  publish = publishCommerceContent,
  resolveThreadsAccount = resolveWorkspaceThreadsConnectedAccount,
  resolveContext = resolveExecutionContext,
} = {}) {
  const authorization = await authorize(request, env);
  if (!authorization.ok) return authorization.response;
  if (request.method !== "POST") return fail("Method Not Allowed", 405);
  const input = await readPublishInput(request);
  if (!input) return fail("Invalid commerce publish request", 400, { code: "commerce_publish_input_invalid" });
  if (!input.text.trim()) return fail("Reviewed text is required", 400, { code: "commerce_publish_text_required" });
  const opportunity = await get(env, opportunityId, authorization.workspaceId);
  if (!opportunity) return fail("Product Opportunity not found", 404, { code: "commerce_publish_opportunity_not_found" });
  try {
    const media = await resolvePublishMedia(env, opportunityId, authorization.workspaceId, input.mediaId, {
      listLinks,
      get: getMediaById,
    });
    const executionContext = !authorization.session.legacy && authorization.workspaceId !== DEFAULT_WORKSPACE_ID
      ? await resolveContext(env, {
        workspaceId: authorization.workspaceId,
        connectedAccountId: (await resolveThreadsAccount(env, { workspaceId: authorization.workspaceId })).id,
      })
      : null;
    const published = await publish(env, {
      workspaceId: authorization.workspaceId,
      opportunity,
      text: input.text,
      media,
      executionContext,
    });
    return ok({ published });
  } catch (error) {
    return commercePublishErrorResponse(error);
  }
}

export async function handleProductOpportunityPerformance(request, env, opportunityId, {
  get = getProductOpportunityById,
  getPublishedPosts = getPublishedCommercePostsForOpportunity,
  buildPerformance = buildProductOpportunityPerformanceSummary,
} = {}) {
  const authorization = await authorize(request, env);
  if (!authorization.ok) return authorization.response;
  if (request.method !== "GET") return fail("Method Not Allowed", 405);

  const opportunity = await get(env, opportunityId, authorization.workspaceId);
  if (!opportunity) return fail("Product Opportunity not found", 404, { code: "product_opportunity_not_found" });

  try {
    const posts = await getPublishedPosts(env, {
      workspaceId: authorization.workspaceId,
      opportunityId: opportunity.id,
    });
    return ok({
      opportunityId: opportunity.id,
      performance: await buildPerformance(env, posts),
    });
  } catch {
    return fail("Product Opportunity performance is unavailable", 502, { code: "product_opportunity_performance_unavailable" });
  }
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
