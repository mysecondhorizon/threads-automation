import { getJson, putJson } from "./kv.js";

import {
  DEFAULT_WORKSPACE_ID,
} from "./workspace-foundation.js";

export const PRODUCT_OPPORTUNITIES_KEY = "product_opportunities:v1";

export const PRODUCT_OPPORTUNITY_STATUSES = Object.freeze([
  "DISCOVERED",
  "RECOMMENDED",
  "APPROVED",
  "READY",
  "USED",
  "REJECTED",
  "ARCHIVED",
]);

const STATUS_VALUES = new Set(PRODUCT_OPPORTUNITY_STATUSES);
const SCORE_FIELDS = Object.freeze([
  "trendScore",
  "personaFitScore",
  "purchaseIntentScore",
  "contentPotentialScore",
  "experiencePotentialScore",
  "affiliatePotentialScore",
  "opportunityScore",
]);
const OPTIONAL_TEXT_FIELDS = Object.freeze([
  "brand",
  "sourceUrl",
  "affiliateLink",
  "problem",
  "audience",
  "situation",
  "angle",
  "discoveryReason",
]);

export class ProductOpportunityError extends Error {
  constructor(message, code = "product_opportunity_failed") {
    super(message);
    this.name = "ProductOpportunityError";
    this.code = code;
  }
}

function fail(message, code) {
  return new ProductOpportunityError(message, code);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value) {
  return text(value) || null;
}

function normalizeWorkspaceId(workspaceId) {
  if (workspaceId === undefined || workspaceId === null) {
    return DEFAULT_WORKSPACE_ID;
  }
  const normalized = text(workspaceId);
  if (!normalized) {
    throw fail("Product Opportunity workspace id is invalid", "product_opportunity_workspace_invalid");
  }
  return normalized;
}

function storedWorkspaceId(record) {
  return text(record?.workspaceId) || DEFAULT_WORKSPACE_ID;
}

function isInWorkspace(record, workspaceId) {
  return storedWorkspaceId(record) === workspaceId;
}

function requiredText(value, field) {
  const normalized = text(value);
  if (!normalized) {
    throw fail(`Product Opportunity ${field} is required`, `product_opportunity_${field}_required`);
  }
  return normalized;
}

function normalizeStatus(value) {
  const normalized = text(value);
  if (!STATUS_VALUES.has(normalized)) {
    throw fail("Product Opportunity status is invalid", "product_opportunity_status_invalid");
  }
  return normalized;
}

function normalizeUrl(value, field) {
  const normalized = nullableText(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Unsupported protocol");
    }
    return url.toString();
  } catch {
    throw fail(`Product Opportunity ${field} is invalid`, `product_opportunity_${field}_invalid`);
  }
}

function normalizeSignalSources(value) {
  if (!Array.isArray(value)) {
    throw fail("Product Opportunity signalSources must be an array", "product_opportunity_signal_sources_invalid");
  }
  const values = value.map((item) => {
    if (typeof item !== "string") {
      throw fail("Product Opportunity signalSources must contain strings", "product_opportunity_signal_sources_invalid");
    }
    return item.trim();
  }).filter(Boolean);
  return [...new Set(values)];
}

function normalizeScore(value, field) {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw fail(`Product Opportunity ${field} is invalid`, `product_opportunity_${field}_invalid`);
  }
  return value;
}

function normalizeUseCount(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw fail("Product Opportunity useCount is invalid", "product_opportunity_use_count_invalid");
  }
  return value;
}

function normalizeTimestamp(value, field) {
  if (value === null) return null;
  const normalized = nullableText(value);
  if (!normalized) return null;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw fail(`Product Opportunity ${field} is invalid`, `product_opportunity_${field}_invalid`);
  }
  return date.toISOString();
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function hasOwn(input, field) {
  return Object.prototype.hasOwnProperty.call(input || {}, field);
}

function inputValue(input, existing, field, fallback) {
  return hasOwn(input, field) ? input[field] : existing?.[field] ?? fallback;
}

function normalizeOpportunity(input, existing, workspaceId, createdId = null) {
  const now = new Date().toISOString();
  const opportunity = {
    id: existing?.id || createdId || createId(),
    workspaceId,
    productName: requiredText(inputValue(input, existing, "productName", null), "productName"),
    category: requiredText(inputValue(input, existing, "category", null), "category"),
    status: normalizeStatus(inputValue(input, existing, "status", null)),
    signalSources: normalizeSignalSources(inputValue(input, existing, "signalSources", [])),
    useCount: normalizeUseCount(inputValue(input, existing, "useCount", 0)),
    lastUsedAt: normalizeTimestamp(inputValue(input, existing, "lastUsedAt", null), "lastUsedAt"),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  for (const field of OPTIONAL_TEXT_FIELDS) {
    const value = inputValue(input, existing, field, null);
    opportunity[field] = field === "sourceUrl" || field === "affiliateLink"
      ? normalizeUrl(value, field)
      : nullableText(value);
  }
  for (const field of SCORE_FIELDS) {
    opportunity[field] = normalizeScore(inputValue(input, existing, field, null), field);
  }
  return opportunity;
}

function hydrateOpportunity(record) {
  try {
    const id = text(record?.id);
    if (!id) return null;
    const opportunity = normalizeOpportunity(record, {
      id,
      createdAt: nullableText(record?.createdAt),
    }, storedWorkspaceId(record));
    return {
      ...opportunity,
      createdAt: nullableText(record?.createdAt) || opportunity.createdAt,
      updatedAt: nullableText(record?.updatedAt) || opportunity.updatedAt,
    };
  } catch {
    return null;
  }
}

async function readStore(env) {
  const stored = await getJson(env, PRODUCT_OPPORTUNITIES_KEY);
  const records = Array.isArray(stored?.records) ? stored.records : [];
  return {
    rawRecords: records,
    records: records.map(hydrateOpportunity).filter(Boolean),
  };
}

async function writeStore(env, records) {
  await putJson(env, PRODUCT_OPPORTUNITIES_KEY, {
    version: 1,
    updatedAt: new Date().toISOString(),
    records,
  });
}

function mergeWorkspaceRecords(records, workspaceId, workspaceRecords) {
  return [
    ...workspaceRecords,
    ...records.filter((record) => !isInWorkspace(record, workspaceId)),
  ];
}

export async function listProductOpportunities(env, workspaceId) {
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  return (await readStore(env)).records.filter((record) =>
    isInWorkspace(record, resolvedWorkspaceId)
  );
}

export async function getProductOpportunityById(env, opportunityId, workspaceId) {
  const id = text(opportunityId);
  if (!id) return null;
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  return (await readStore(env)).records.find((record) =>
    record.id === id && isInWorkspace(record, resolvedWorkspaceId)
  ) || null;
}

export async function saveProductOpportunity(env, input, workspaceId) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw fail("Product Opportunity input is invalid", "product_opportunity_input_invalid");
  }
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const suppliedId = hasOwn(input, "id") ? text(input.id) : "";
  if (hasOwn(input, "id") && !suppliedId) {
    throw fail("Product Opportunity id is invalid", "product_opportunity_id_invalid");
  }

  const store = await readStore(env);
  const existing = suppliedId
    ? store.records.find((record) => record.id === suppliedId) || null
    : null;
  if (suppliedId && !existing && store.rawRecords.some((record) => text(record?.id) === suppliedId)) {
    throw fail("Product Opportunity record is invalid", "product_opportunity_record_invalid");
  }
  if (existing && !isInWorkspace(existing, resolvedWorkspaceId)) {
    throw fail("Product Opportunity was not found", "product_opportunity_not_found");
  }

  const opportunity = normalizeOpportunity(input, existing, resolvedWorkspaceId, suppliedId || null);
  const workspaceRecords = store.records.filter((record) => isInWorkspace(record, resolvedWorkspaceId));
  const nextWorkspaceRecords = existing
    ? workspaceRecords.map((record) => record.id === opportunity.id ? opportunity : record)
    : [opportunity, ...workspaceRecords];
  await writeStore(
    env,
    mergeWorkspaceRecords(store.rawRecords, resolvedWorkspaceId, nextWorkspaceRecords)
  );
  return opportunity;
}

export async function removeProductOpportunity(env, opportunityId, workspaceId) {
  const id = text(opportunityId);
  if (!id) return false;
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const store = await readStore(env);
  const workspaceRecords = store.records.filter((record) => isInWorkspace(record, resolvedWorkspaceId));
  const nextWorkspaceRecords = workspaceRecords.filter((record) => record.id !== id);
  if (nextWorkspaceRecords.length === workspaceRecords.length) return false;
  await writeStore(
    env,
    mergeWorkspaceRecords(store.rawRecords, resolvedWorkspaceId, nextWorkspaceRecords)
  );
  return true;
}
