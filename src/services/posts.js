import { getJson, putJson } from "./kv.js";

export const OPERATOR_POSTS_KEY = "operator_posts:v1";

const STORE_VERSION = 1;
const POST_STATUSES = new Set(["DRAFT", "READY", "PUBLISHED"]);
const WRITABLE_STATUSES = new Set(["DRAFT", "READY"]);
const POST_FORMATS = new Set(["TEXT", "HTML"]);
const POST_SOURCE_TYPES = new Set(["MANUAL", "AI"]);
const CREATE_FIELDS = new Set([
  "title",
  "body",
  "format",
  "sourceType",
  "topicId",
  "targetApp",
  "status",
]);
const UPDATE_FIELDS = new Set(CREATE_FIELDS);
const PROTECTED_FIELDS = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "publishedAt",
  "publishedPostId",
]);

export class PostsError extends Error {
  constructor(message, { code = "posts_error", status = 400 } = {}) {
    super(message);
    this.name = "PostsError";
    this.code = code;
    this.status = status;
  }
}

function invalid(message) {
  throw new PostsError(message, { code: "invalid_post" });
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(`${label} must be an object`);
  }
  return value;
}

function assertKnownFields(input, allowedFields) {
  for (const key of Object.keys(input)) {
    if (PROTECTED_FIELDS.has(key)) {
      invalid(`${key} is managed by the server`);
    }
    if (!allowedFields.has(key)) {
      invalid(`Unknown post field: ${key}`);
    }
  }
}

function normalizeRequiredBody(value) {
  if (typeof value !== "string") invalid("body must be a string");
  const body = value.trim();
  if (!body) invalid("body is required");
  return body;
}

function normalizeNullableText(value, fieldName) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") invalid(`${fieldName} must be a string or null`);
  const normalized = value.trim();
  if (!normalized) invalid(`${fieldName} must be a nonempty string or null`);
  return normalized;
}

function normalizeOptionalTitle(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") invalid("title must be a string or null");
  return value.trim() || null;
}

function normalizeEnum(value, values, fieldName, fallback) {
  const normalized = value === undefined ? fallback : value;
  if (typeof normalized !== "string" || !values.has(normalized)) {
    invalid(`${fieldName} is invalid`);
  }
  return normalized;
}

function isIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function normalizeStoredPost(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PostsError("Post store contains an invalid record", { code: "invalid_post_store" });
  }

  const post = {
    id: value.id,
    status: value.status,
    format: value.format,
    title: value.title,
    body: value.body,
    sourceType: value.sourceType,
    topicId: value.topicId,
    targetApp: value.targetApp,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    publishedAt: value.publishedAt,
    publishedPostId: value.publishedPostId,
  };

  if (typeof post.id !== "string" || !post.id.trim()) {
    throw new PostsError("Post store contains an invalid id", { code: "invalid_post_store" });
  }
  if (!POST_STATUSES.has(post.status) || !POST_FORMATS.has(post.format) || !POST_SOURCE_TYPES.has(post.sourceType)) {
    throw new PostsError("Post store contains an invalid enum", { code: "invalid_post_store" });
  }
  if (typeof post.body !== "string" || !post.body.trim()) {
    throw new PostsError("Post store contains an invalid body", { code: "invalid_post_store" });
  }
  if (post.title !== null && typeof post.title !== "string") {
    throw new PostsError("Post store contains an invalid title", { code: "invalid_post_store" });
  }
  for (const fieldName of ["topicId", "targetApp", "publishedAt", "publishedPostId"]) {
    if (post[fieldName] !== null && typeof post[fieldName] !== "string") {
      throw new PostsError(`Post store contains an invalid ${fieldName}`, { code: "invalid_post_store" });
    }
  }
  if (!isIsoDate(post.createdAt) || !isIsoDate(post.updatedAt) || (post.publishedAt !== null && !isIsoDate(post.publishedAt))) {
    throw new PostsError("Post store contains an invalid timestamp", { code: "invalid_post_store" });
  }
  return post;
}

async function readStore(env) {
  const stored = await getJson(env, OPERATOR_POSTS_KEY);
  if (stored === null) {
    return { version: STORE_VERSION, updatedAt: null, records: [] };
  }
  if (!stored || typeof stored !== "object" || Array.isArray(stored) || stored.version !== STORE_VERSION || !Array.isArray(stored.records)) {
    throw new PostsError("Post store is malformed", { code: "invalid_post_store" });
  }

  const records = stored.records.map(normalizeStoredPost);
  const ids = new Set();
  for (const record of records) {
    if (ids.has(record.id)) {
      throw new PostsError("Post store contains duplicate ids", { code: "invalid_post_store" });
    }
    ids.add(record.id);
  }
  if (stored.updatedAt !== null && !isIsoDate(stored.updatedAt)) {
    throw new PostsError("Post store contains an invalid updatedAt", { code: "invalid_post_store" });
  }
  return {
    version: STORE_VERSION,
    updatedAt: stored.updatedAt,
    records,
  };
}

async function writeStore(env, records, now) {
  await putJson(env, OPERATOR_POSTS_KEY, {
    version: STORE_VERSION,
    updatedAt: now,
    records,
  });
}

function sortNewestUpdated(records) {
  return [...records].sort((left, right) => {
    const timeDifference = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    return timeDifference || right.id.localeCompare(left.id);
  });
}

function normalizeFilters(filters = {}) {
  requirePlainObject(filters, "filters");
  const normalized = {};
  for (const [fieldName, values] of [
    ["status", POST_STATUSES],
    ["format", POST_FORMATS],
    ["sourceType", POST_SOURCE_TYPES],
  ]) {
    if (filters[fieldName] !== undefined) {
      normalized[fieldName] = normalizeEnum(filters[fieldName], values, fieldName);
    }
  }
  return normalized;
}

export async function listPosts(env, filters = {}) {
  const store = await readStore(env);
  const normalizedFilters = normalizeFilters(filters);
  return sortNewestUpdated(store.records.filter((post) => Object.entries(normalizedFilters)
    .every(([fieldName, value]) => post[fieldName] === value)));
}

export async function getPost(env, postId) {
  if (typeof postId !== "string" || !postId.trim()) invalid("postId is required");
  const store = await readStore(env);
  return store.records.find((post) => post.id === postId) || null;
}

export async function createPost(env, input, { now = new Date().toISOString(), idFactory = () => crypto.randomUUID() } = {}) {
  requirePlainObject(input, "post");
  assertKnownFields(input, CREATE_FIELDS);
  const status = normalizeEnum(input.status, WRITABLE_STATUSES, "status", "DRAFT");
  const post = {
    id: idFactory(),
    status,
    format: normalizeEnum(input.format, POST_FORMATS, "format", "TEXT"),
    title: normalizeOptionalTitle(input.title),
    body: normalizeRequiredBody(input.body),
    sourceType: normalizeEnum(input.sourceType, POST_SOURCE_TYPES, "sourceType", "MANUAL"),
    topicId: normalizeNullableText(input.topicId, "topicId"),
    targetApp: normalizeNullableText(input.targetApp, "targetApp"),
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    publishedPostId: null,
  };
  if (typeof post.id !== "string" || !post.id.trim()) invalid("Generated post id is invalid");

  const store = await readStore(env);
  if (store.records.some((record) => record.id === post.id)) {
    throw new PostsError("Post id already exists", { code: "duplicate_post_id", status: 409 });
  }
  await writeStore(env, [...store.records, post], now);
  return post;
}

export async function updatePost(env, postId, input, { now = new Date().toISOString() } = {}) {
  if (typeof postId !== "string" || !postId.trim()) invalid("postId is required");
  requirePlainObject(input, "post");
  assertKnownFields(input, UPDATE_FIELDS);
  const store = await readStore(env);
  const index = store.records.findIndex((post) => post.id === postId);
  if (index < 0) return null;

  const existing = store.records[index];
  const updated = {
    ...existing,
    ...(Object.hasOwn(input, "title") ? { title: normalizeOptionalTitle(input.title) } : {}),
    ...(Object.hasOwn(input, "body") ? { body: normalizeRequiredBody(input.body) } : {}),
    ...(Object.hasOwn(input, "format") ? { format: normalizeEnum(input.format, POST_FORMATS, "format") } : {}),
    ...(Object.hasOwn(input, "sourceType") ? { sourceType: normalizeEnum(input.sourceType, POST_SOURCE_TYPES, "sourceType") } : {}),
    ...(Object.hasOwn(input, "topicId") ? { topicId: normalizeNullableText(input.topicId, "topicId") } : {}),
    ...(Object.hasOwn(input, "targetApp") ? { targetApp: normalizeNullableText(input.targetApp, "targetApp") } : {}),
    ...(Object.hasOwn(input, "status") ? { status: normalizeEnum(input.status, WRITABLE_STATUSES, "status") } : {}),
    updatedAt: now,
  };
  const records = [...store.records];
  records[index] = updated;
  await writeStore(env, records, now);
  return updated;
}

export async function deletePost(env, postId, { now = new Date().toISOString() } = {}) {
  if (typeof postId !== "string" || !postId.trim()) invalid("postId is required");
  const store = await readStore(env);
  const post = store.records.find((record) => record.id === postId);
  if (!post) return null;
  if (post.status === "PUBLISHED") {
    throw new PostsError("Published posts cannot be deleted", { code: "published_post_delete_forbidden", status: 400 });
  }
  await writeStore(env, store.records.filter((record) => record.id !== postId), now);
  return true;
}
