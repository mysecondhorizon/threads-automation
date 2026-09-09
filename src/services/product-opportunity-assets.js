import { getJson, putJson } from "./kv.js";
import { getMedia } from "./media.js";
import { getProductOpportunityById } from "./product-opportunities.js";
import { DEFAULT_WORKSPACE_ID } from "./workspace-foundation.js";

export const PRODUCT_OPPORTUNITY_ASSETS_KEY = "product_opportunity_assets:v1";

export class ProductOpportunityAssetError extends Error {
  constructor(message, code = "product_opportunity_asset_failed") {
    super(message);
    this.name = "ProductOpportunityAssetError";
    this.code = code;
  }
}

function text(value) { return typeof value === "string" ? value.trim() : ""; }
function workspace(value) { return value === undefined || value === null ? DEFAULT_WORKSPACE_ID : text(value); }
function fail(message, code) { throw new ProductOpportunityAssetError(message, code); }
function validRecord(record) {
  return record && typeof record === "object" && text(record.workspaceId) && text(record.opportunityId) && text(record.mediaId)
    ? { workspaceId: text(record.workspaceId), opportunityId: text(record.opportunityId), mediaId: text(record.mediaId), linkedAt: text(record.linkedAt) || null }
    : null;
}
async function read(env) {
  const stored = await getJson(env, PRODUCT_OPPORTUNITY_ASSETS_KEY);
  return (Array.isArray(stored?.records) ? stored.records : []).map(validRecord).filter(Boolean);
}
async function write(env, records) {
  await putJson(env, PRODUCT_OPPORTUNITY_ASSETS_KEY, { version: 1, updatedAt: new Date().toISOString(), records });
}
async function validateOpportunityAndMedia(env, opportunityId, mediaId, workspaceId, { getOpportunity = getProductOpportunityById, get = getMedia } = {}) {
  const opportunity = await getOpportunity(env, opportunityId, workspaceId);
  if (!opportunity) fail("Product Opportunity was not found", "product_opportunity_asset_opportunity_not_found");
  const media = await get(env, mediaId, workspaceId);
  if (!media) fail("Product media was not found", "product_opportunity_asset_media_not_found");
  if (media.sourceType !== "product" || media.active !== true || !["image", "video"].includes(media.mediaKind)) {
    fail("Product media is not eligible", "product_opportunity_asset_media_invalid");
  }
  return { opportunity, media };
}

export async function listProductOpportunityAssets(env, opportunityId, workspaceId) {
  const scope = workspace(workspaceId);
  if (!scope || !text(opportunityId)) return [];
  return (await read(env)).filter((record) => record.workspaceId === scope && record.opportunityId === text(opportunityId));
}

export async function linkProductOpportunityAsset(env, opportunityId, mediaId, workspaceId, dependencies = {}) {
  const scope = workspace(workspaceId);
  if (!scope || !text(opportunityId) || !text(mediaId)) fail("Product Opportunity asset link is invalid", "product_opportunity_asset_input_invalid");
  await validateOpportunityAndMedia(env, opportunityId, mediaId, scope, dependencies);
  const records = await read(env);
  const existing = records.find((record) => record.workspaceId === scope && record.opportunityId === text(opportunityId) && record.mediaId === text(mediaId));
  if (existing) return { ...existing, created: false };
  const record = { workspaceId: scope, opportunityId: text(opportunityId), mediaId: text(mediaId), linkedAt: new Date().toISOString() };
  await write(env, [...records, record]);
  return { ...record, created: true };
}

export async function unlinkProductOpportunityAsset(env, opportunityId, mediaId, workspaceId) {
  const scope = workspace(workspaceId);
  const records = await read(env);
  const remaining = records.filter((record) => !(record.workspaceId === scope && record.opportunityId === text(opportunityId) && record.mediaId === text(mediaId)));
  if (remaining.length === records.length) return false;
  await write(env, remaining);
  return true;
}
