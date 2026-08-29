import { getJson, putJson } from "./kv.js";

import {
  getMedia,
} from "./media.js";

import {
  getProductById,
} from "./products.js";

import {
  DEFAULT_WORKSPACE_ID,
} from "./workspace-foundation.js";

const CONTENT_POOL_KEY = "content_pool";
const MAX_POOL_ITEMS = 1000;
const TYPES = new Set(["general", "product"]);

function normalizeWorkspaceId(workspaceId) {
  if (workspaceId === undefined || workspaceId === null) {
    return DEFAULT_WORKSPACE_ID;
  }
  if (typeof workspaceId !== "string" || !workspaceId.trim()) {
    throw fail("Content Pool workspace id is invalid", "content_pool_workspace_invalid");
  }
  return workspaceId.trim();
}

function storedWorkspaceId(item) {
  const workspaceId = typeof item?.workspaceId === "string"
    ? item.workspaceId.trim()
    : "";
  return workspaceId || DEFAULT_WORKSPACE_ID;
}

function isInWorkspace(item, workspaceId) {
  return storedWorkspaceId(item) === workspaceId;
}

function mergeWorkspaceItems(items, workspaceId, workspaceItems) {
  return [
    ...workspaceItems.slice(0, MAX_POOL_ITEMS),
    ...items.filter((item) => !isInWorkspace(item, workspaceId)),
  ];
}

export class ContentPoolError extends Error {
  constructor(message, code = "content_pool_failed", details = null) {
    super(message);
    this.name = "ContentPoolError";
    this.code = code;
    this.details = details;
  }
}

function fail(message, code, details = null) {
  return new ContentPoolError(message, code, details);
}

function text(value) {
  return String(value ?? "").trim();
}

function nullableText(value) {
  return text(value) || null;
}

function stringList(value) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[|;,]/u)
      : value == null ? [] : [value];
  return [...new Set(values.map(text).filter(Boolean))];
}

function typeValue(value, fallback = "general") {
  const normalized = text(value ?? fallback).toLowerCase();
  if (!TYPES.has(normalized)) {
    throw fail("Content Pool type must be general or product", "content_pool_type_invalid");
  }
  return normalized;
}

function integer(value, fallback, field, { min = 0, nullable = false } = {}) {
  if (value === undefined) return fallback;
  if (nullable && (value === null || value === "")) return null;
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < min) {
    throw fail(`Content Pool ${field} is invalid`, `content_pool_${field}_invalid`);
  }
  return normalized;
}

function booleanValue(value, fallback = true) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw fail("Content Pool active must be a boolean", "content_pool_active_invalid");
  }
  return value;
}

function dateValue(value, fallback = null) {
  if (value === undefined) return fallback;
  const normalized = nullableText(value);
  if (!normalized) return null;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw fail("Content Pool date is invalid", "content_pool_date_invalid");
  }
  return date.toISOString();
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function normalizeItem(input, existing = null, workspaceId = DEFAULT_WORKSPACE_ID) {
  const now = new Date().toISOString();
  const type = typeValue(input?.type, existing?.type || "general");
  const availableFrom = dateValue(input?.availableFrom, existing?.availableFrom ?? null);
  const availableUntil = dateValue(input?.availableUntil, existing?.availableUntil ?? null);
  if (availableFrom && availableUntil && availableFrom > availableUntil) {
    throw fail("Content Pool availability period is invalid", "content_pool_period_invalid");
  }

  const mediaIds = stringList(
    input?.mediaIds === undefined ? existing?.mediaIds : input.mediaIds
  );
  if (mediaIds.length === 0) {
    throw fail("Content Pool mediaIds must contain at least one media id", "content_pool_media_ids_empty");
  }

  return {
    id: existing?.id || createId(),
    workspaceId,
    type,
    mediaIds,
    productId: type === "product"
      ? nullableText(input?.productId === undefined ? existing?.productId : input.productId)
      : null,
    topics: stringList(input?.topics === undefined ? existing?.topics : input.topics),
    allowedContentTypes: stringList(
      input?.allowedContentTypes === undefined
        ? existing?.allowedContentTypes
        : input.allowedContentTypes
    ),
    priority: integer(input?.priority, existing?.priority ?? 0, "priority"),
    availableFrom,
    availableUntil,
    maxUses: integer(input?.maxUses, existing?.maxUses ?? 1, "max_uses", { min: 1 }),
    usedCount: integer(input?.usedCount, existing?.usedCount ?? 0, "used_count"),
    lastUsedAt: dateValue(input?.lastUsedAt, existing?.lastUsedAt ?? null),
    cooldownDays: integer(input?.cooldownDays, existing?.cooldownDays ?? 0, "cooldown_days"),
    active: booleanValue(input?.active, existing?.active ?? true),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function hydrateItem(input) {
  const type = TYPES.has(input?.type) ? input.type : "general";
  const workspaceId = typeof input?.workspaceId === "string" && input.workspaceId.trim()
    ? input.workspaceId.trim()
    : null;
  return {
    id: text(input?.id),
    ...(workspaceId ? { workspaceId } : {}),
    type,
    mediaIds: stringList(input?.mediaIds),
    productId: type === "product" ? nullableText(input?.productId) : null,
    topics: stringList(input?.topics),
    allowedContentTypes: stringList(input?.allowedContentTypes),
    priority: Number.isInteger(input?.priority) ? input.priority : 0,
    availableFrom: nullableText(input?.availableFrom),
    availableUntil: nullableText(input?.availableUntil),
    maxUses: Number.isInteger(input?.maxUses) && input.maxUses > 0 ? input.maxUses : 1,
    usedCount: Number.isInteger(input?.usedCount) && input.usedCount >= 0 ? input.usedCount : 0,
    lastUsedAt: nullableText(input?.lastUsedAt),
    cooldownDays: Number.isInteger(input?.cooldownDays) && input.cooldownDays >= 0
      ? input.cooldownDays : 0,
    active: input?.active !== false,
    createdAt: nullableText(input?.createdAt),
    updatedAt: nullableText(input?.updatedAt),
  };
}

async function readStore(env) {
  const stored = await getJson(env, CONTENT_POOL_KEY);
  if (!stored || !Array.isArray(stored.items)) {
    return { version: 1, updatedAt: null, rawItems: [], items: [] };
  }
  return {
    version: Number(stored.version || 1),
    updatedAt: stored.updatedAt || null,
    rawItems: stored.items,
    items: stored.items.map(hydrateItem).filter((item) => item.id && item.mediaIds.length),
  };
}

async function writeStore(env, items) {
  const value = { version: 1, updatedAt: new Date().toISOString(), items };
  await putJson(env, CONTENT_POOL_KEY, value);
  return value;
}

async function assertMediaReferences(env, item, workspaceId) {
  for (const mediaId of item.mediaIds) {
    const media = await getMedia(env, mediaId, workspaceId);
    if (!media) {
      throw fail(
        "Content Pool media must belong to the same workspace",
        "content_pool_media_workspace_mismatch",
        { mediaId }
      );
    }
  }
}

async function assertProductReference(env, item, workspaceId) {
  if (!item.productId) return;
  const product = await getProductById(env, item.productId, workspaceId);
  if (!product) {
    throw fail(
      "Content Pool product must belong to the same workspace",
      "content_pool_product_workspace_mismatch",
      { productId: item.productId }
    );
  }
}

export function isContentPoolItemAvailable(item, at = new Date()) {
  const now = new Date(at).getTime();
  if (!item?.active || Number.isNaN(now)) return false;
  if (item.availableFrom && new Date(item.availableFrom).getTime() > now) return false;
  if (item.availableUntil && new Date(item.availableUntil).getTime() < now) return false;
  if (item.usedCount >= item.maxUses) return false;
  if (item.lastUsedAt && item.cooldownDays > 0) {
    const nextUseAt = new Date(item.lastUsedAt).getTime() + item.cooldownDays * 86400000;
    if (nextUseAt > now) return false;
  }
  return true;
}

export async function createContentPoolItem(env, input, workspaceId) {
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const store = await readStore(env);
  const workspaceItems = store.items.filter((item) => isInWorkspace(item, resolvedWorkspaceId));
  if (workspaceItems.length >= MAX_POOL_ITEMS) {
    throw fail("Content Pool has reached its item limit", "content_pool_limit_reached");
  }
  const item = normalizeItem(input, null, resolvedWorkspaceId);
  await assertMediaReferences(env, item, resolvedWorkspaceId);
  await assertProductReference(env, item, resolvedWorkspaceId);
  await writeStore(env, mergeWorkspaceItems(store.rawItems, resolvedWorkspaceId, [item, ...workspaceItems]));
  return item;
}

export async function createContentPoolBatch(env, inputs, workspaceId) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    return { created: [], failures: [] };
  }
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const store = await readStore(env);
  const workspaceItems = store.items.filter((item) => isInWorkspace(item, resolvedWorkspaceId));
  const created = [];
  const failures = [];
  for (let index = 0; index < inputs.length; index += 1) {
    if (workspaceItems.length + created.length >= MAX_POOL_ITEMS) {
      failures.push({ index, code: "content_pool_limit_reached", message: "Content Pool limit reached" });
      continue;
    }
    try {
      const item = normalizeItem(inputs[index], null, resolvedWorkspaceId);
      await assertMediaReferences(env, item, resolvedWorkspaceId);
      await assertProductReference(env, item, resolvedWorkspaceId);
      created.push(item);
    } catch (error) {
      failures.push({ index, code: error?.code || "content_pool_validation_failed", message: error?.message || String(error) });
    }
  }
  if (created.length) {
    await writeStore(
      env,
      mergeWorkspaceItems(
        store.rawItems,
        resolvedWorkspaceId,
        [...created].reverse().concat(workspaceItems)
      )
    );
  }
  return { created, failures };
}

export async function getContentPoolItem(env, itemId, workspaceId) {
  const id = text(itemId);
  if (!id) return null;
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  return (await readStore(env)).items.find((item) =>
    item.id === id && isInWorkspace(item, resolvedWorkspaceId)
  ) || null;
}

export async function listContentPool(env, options = {}, workspaceId) {
  const type = options.type === undefined ? null : typeValue(options.type);
  const active = options.active;
  if (active !== undefined && typeof active !== "boolean") {
    throw fail("Content Pool active filter must be a boolean", "content_pool_filter_invalid");
  }
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  return (await readStore(env)).items.filter((item) =>
    isInWorkspace(item, resolvedWorkspaceId) &&
    (!type || item.type === type) &&
    (active === undefined || item.active === active)
  );
}

export async function updateContentPoolItem(env, itemId, input, workspaceId) {
  const id = text(itemId);
  if (!id) throw fail("Content Pool id is required", "content_pool_id_missing");
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const store = await readStore(env);
  const workspaceItems = store.items.filter((item) => isInWorkspace(item, resolvedWorkspaceId));
  const index = workspaceItems.findIndex((item) => item.id === id);
  if (index < 0) throw fail("Content Pool item was not found", "content_pool_not_found", { itemId: id });
  const item = normalizeItem(input, workspaceItems[index], resolvedWorkspaceId);
  if (input?.mediaIds !== undefined) {
    await assertMediaReferences(env, item, resolvedWorkspaceId);
  }
  if (input?.productId !== undefined) {
    await assertProductReference(env, item, resolvedWorkspaceId);
  }
  const nextWorkspaceItems = [...workspaceItems];
  nextWorkspaceItems[index] = item;
  await writeStore(env, mergeWorkspaceItems(store.rawItems, resolvedWorkspaceId, nextWorkspaceItems));
  return item;
}

export async function removeContentPoolItem(env, itemId, workspaceId) {
  const id = text(itemId);
  if (!id) return false;
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const store = await readStore(env);
  const workspaceItems = store.items.filter((item) => isInWorkspace(item, resolvedWorkspaceId));
  const nextWorkspaceItems = workspaceItems.filter((item) => item.id !== id);
  if (nextWorkspaceItems.length === workspaceItems.length) return false;
  await writeStore(env, mergeWorkspaceItems(store.rawItems, resolvedWorkspaceId, nextWorkspaceItems));
  return true;
}

export async function getAvailableContentPoolCandidates(env, options = {}, workspaceId) {
  const at = options.at || new Date();
  const limit = integer(options.limit, 100, "limit", { min: 1 });
  const items = await listContentPool(env, { type: options.type, active: true }, workspaceId);
  return items
    .filter((item) => isContentPoolItemAvailable(item, at))
    .sort((left, right) =>
      right.priority - left.priority ||
      String(left.lastUsedAt || "").localeCompare(String(right.lastUsedAt || "")) ||
      String(left.createdAt || "").localeCompare(String(right.createdAt || ""))
    )
    .slice(0, limit);
}

export async function markContentPoolItemUsed(env, itemId, usedAt = new Date(), workspaceId) {
  const item = await getContentPoolItem(env, itemId, workspaceId);
  if (!item) throw fail("Content Pool item was not found", "content_pool_not_found", { itemId });
  return await updateContentPoolItem(env, item.id, {
    usedCount: item.usedCount + 1,
    lastUsedAt: new Date(usedAt).toISOString(),
  }, workspaceId);
}
