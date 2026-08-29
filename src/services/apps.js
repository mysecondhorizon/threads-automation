import { getJson, putJson } from "./kv.js";

export const OPERATOR_APPS_KEY = "operator_apps:v1";
export const BUILT_IN_THREADS_APP_ID = "threads-primary";

const STORE_VERSION = 1;
const APP_TYPES = new Set(["THREADS", "WORDPRESS", "CUSTOM_API"]);
const R11A_CREATABLE_TYPES = new Set(["THREADS"]);
const WRITABLE_FIELDS = new Set(["name", "type", "active"]);

export class AppsError extends Error {
  constructor(message, { code = "apps_error", status = 400 } = {}) {
    super(message);
    this.name = "AppsError";
    this.code = code;
    this.status = status;
  }
}

function invalid(message) {
  throw new AppsError(message, { code: "invalid_app" });
}

function nowIso() {
  return new Date().toISOString();
}

function createId() {
  return crypto.randomUUID();
}

function defaultThreadsApp(timestamp) {
  return {
    id: BUILT_IN_THREADS_APP_ID,
    name: "Second Horizon Threads",
    type: "THREADS",
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function isIso(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function normalizeName(value) {
  if (typeof value !== "string") invalid("name must be a string");
  const name = value.trim();
  if (!name || name.length > 120) invalid("name must be 1 to 120 characters");
  return name;
}

function normalizeType(value, { creatable = false } = {}) {
  if (typeof value !== "string" || !APP_TYPES.has(value)) invalid("type is invalid");
  if (creatable && !R11A_CREATABLE_TYPES.has(value)) {
    throw new AppsError("This app type is not available yet", { code: "app_type_unavailable" });
  }
  return value;
}

function normalizeActive(value) {
  if (typeof value !== "boolean") invalid("active must be a boolean");
  return value;
}

function normalizeStoredRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppsError("App registry contains an invalid record", { code: "invalid_app_store", status: 500 });
  }
  const record = {
    id: value.id,
    name: value.name,
    type: value.type,
    active: value.active,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
  if (typeof record.id !== "string" || !record.id.trim() || !isIso(record.createdAt) || !isIso(record.updatedAt)) {
    throw new AppsError("App registry contains an invalid record", { code: "invalid_app_store", status: 500 });
  }
  try {
    record.name = normalizeName(record.name);
    record.type = normalizeType(record.type);
    record.active = normalizeActive(record.active);
  } catch {
    throw new AppsError("App registry contains an invalid record", { code: "invalid_app_store", status: 500 });
  }
  return record;
}

async function readStore(env) {
  const stored = await getJson(env, OPERATOR_APPS_KEY);
  if (stored === null) return null;
  if (!stored || typeof stored !== "object" || Array.isArray(stored) || stored.version !== STORE_VERSION || !Array.isArray(stored.records) || !isIso(stored.updatedAt)) {
    throw new AppsError("App registry is malformed", { code: "invalid_app_store", status: 500 });
  }
  const records = stored.records.map(normalizeStoredRecord);
  const ids = new Set();
  for (const record of records) {
    if (ids.has(record.id)) throw new AppsError("App registry contains duplicate ids", { code: "invalid_app_store", status: 500 });
    ids.add(record.id);
  }
  return { version: STORE_VERSION, updatedAt: stored.updatedAt, records };
}

async function writeStore(env, records, updatedAt) {
  await putJson(env, OPERATOR_APPS_KEY, { version: STORE_VERSION, updatedAt, records });
}

async function ensureBuiltInThreadsApp(env) {
  const stored = await readStore(env);
  const timestamp = nowIso();
  if (!stored) {
    const records = [defaultThreadsApp(timestamp)];
    await writeStore(env, records, timestamp);
    return { version: STORE_VERSION, updatedAt: timestamp, records };
  }
  if (stored.records.some((record) => record.id === BUILT_IN_THREADS_APP_ID)) return stored;
  const records = [defaultThreadsApp(timestamp), ...stored.records];
  await writeStore(env, records, timestamp);
  return { version: STORE_VERSION, updatedAt: timestamp, records };
}

async function threadsConnectionStatus(env) {
  try {
    const auth = await getJson(env, "threads_auth");
    return typeof auth?.access_token === "string" && auth.access_token.trim()
      ? "CONNECTED"
      : "NOT_CONFIGURED";
  } catch {
    return "NEEDS_ATTENTION";
  }
}

async function toOperatorApp(env, record) {
  const builtIn = record.id === BUILT_IN_THREADS_APP_ID;
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    active: record.active,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    connectionStatus: builtIn ? await threadsConnectionStatus(env) : "NOT_CONFIGURED",
    builtIn,
    deletable: !builtIn,
  };
}

function assertInput(input, { partial = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid("app must be an object");
  const keys = Object.keys(input);
  if (!keys.length || keys.some((key) => !WRITABLE_FIELDS.has(key))) invalid("Only name, type, and active are allowed");
  const result = {};
  if (Object.hasOwn(input, "name")) result.name = normalizeName(input.name);
  else if (!partial) invalid("name is required");
  if (Object.hasOwn(input, "type")) result.type = normalizeType(input.type, { creatable: !partial });
  else if (!partial) invalid("type is required");
  if (Object.hasOwn(input, "active")) result.active = normalizeActive(input.active);
  else if (!partial) result.active = true;
  return result;
}

function sortRecords(records) {
  return [...records].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

export async function listApps(env) {
  const store = await ensureBuiltInThreadsApp(env);
  return Promise.all(sortRecords(store.records).map((record) => toOperatorApp(env, record)));
}

export async function getApp(env, appId) {
  if (typeof appId !== "string" || !appId.trim()) invalid("appId is required");
  const store = await ensureBuiltInThreadsApp(env);
  const record = store.records.find((item) => item.id === appId) || null;
  return record ? toOperatorApp(env, record) : null;
}

export async function createApp(env, input, { idFactory = createId, now = nowIso } = {}) {
  const parsed = assertInput(input);
  const timestamp = now();
  const id = idFactory();
  if (typeof id !== "string" || !id.trim()) invalid("Generated app id is invalid");
  const store = await ensureBuiltInThreadsApp(env);
  if (store.records.some((record) => record.id === id)) {
    throw new AppsError("App id already exists", { code: "duplicate_app_id", status: 409 });
  }
  const record = { id, ...parsed, createdAt: timestamp, updatedAt: timestamp };
  await writeStore(env, [...store.records, record], timestamp);
  return toOperatorApp(env, record);
}

export async function updateApp(env, appId, input, { now = nowIso } = {}) {
  if (typeof appId !== "string" || !appId.trim()) invalid("appId is required");
  const parsed = assertInput(input, { partial: true });
  const store = await ensureBuiltInThreadsApp(env);
  const index = store.records.findIndex((record) => record.id === appId);
  if (index < 0) return null;
  const existing = store.records[index];
  if (Object.hasOwn(parsed, "type") && parsed.type !== existing.type) {
    throw new AppsError("App type cannot be changed", { code: "app_type_change_forbidden" });
  }
  const updated = { ...existing, ...parsed, type: existing.type, updatedAt: now() };
  const records = [...store.records];
  records[index] = updated;
  await writeStore(env, records, updated.updatedAt);
  return toOperatorApp(env, updated);
}

export async function deleteApp(env, appId, { now = nowIso } = {}) {
  if (typeof appId !== "string" || !appId.trim()) invalid("appId is required");
  const store = await ensureBuiltInThreadsApp(env);
  const record = store.records.find((item) => item.id === appId);
  if (!record) return null;
  if (record.id === BUILT_IN_THREADS_APP_ID) {
    throw new AppsError("The built-in Threads connection cannot be deleted", { code: "built_in_app_delete_forbidden" });
  }
  await writeStore(env, store.records.filter((item) => item.id !== appId), now());
  return true;
}
