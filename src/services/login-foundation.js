import {
  getJson,
  getText,
  putJson,
} from "./kv.js";

import {
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_OWNER_USER_ID,
  getDefaultWorkspace,
} from "./workspace-foundation.js";

export const USERS_KEY = "operator_users:v1";
export const WORKSPACES_KEY = "operator_workspaces:v1";
export const USER_AUTH_KEY_PREFIX = "operator_user_auth:";
export const ADMIN_SESSION_KEY_PREFIX = "admin_session:";
export const LEGACY_USER_ID = DEFAULT_WORKSPACE_OWNER_USER_ID;

const STORE_VERSION = 1;
const PASSWORD_AUTH_VERSION = 1;
const PASSWORD_AUTH_ALGORITHM = "PBKDF2-SHA-256";
// Cloudflare Workers WebCrypto rejects PBKDF2 iteration counts above 100,000.
const PASSWORD_AUTH_ITERATIONS = 100_000;
const LEGACY_PASSWORD_AUTH_ITERATIONS = 310_000;
const PASSWORD_AUTH_KEY_LENGTH = 32;
const PASSWORD_AUTH_SALT_LENGTH = 16;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/u;

export class LoginFoundationError extends Error {
  constructor(message, code = "login_foundation_failed") {
    super(message);
    this.name = "LoginFoundationError";
    this.code = code;
  }
}

function fail(message, code) {
  throw new LoginFoundationError(message, code);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIsoTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function normalizeId(value, label) {
  if (typeof value !== "string" || !ID_PATTERN.test(value.trim())) {
    fail(`${label} is invalid`, `${label.toLowerCase().replaceAll(" ", "_")}_invalid`);
  }
  return value.trim();
}

export function normalizeLoginId(loginId) {
  if (typeof loginId !== "string") {
    fail("User login id is invalid", "user_login_id_invalid");
  }

  const normalized = loginId.trim().normalize("NFKC").toLocaleLowerCase("en-US");
  if (!normalized || normalized.length > 120 || /\s/u.test(normalized)) {
    fail("User login id is invalid", "user_login_id_invalid");
  }
  return normalized;
}

function normalizeDisplayName(value, label) {
  if (typeof value !== "string") {
    fail(`${label} is invalid`, `${label.toLowerCase().replaceAll(" ", "_")}_invalid`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > 120) {
    fail(`${label} is invalid`, `${label.toLowerCase().replaceAll(" ", "_")}_invalid`);
  }
  return normalized;
}

function normalizeStoredUser(value) {
  if (!isPlainObject(value)) return null;

  try {
    const id = normalizeId(value.id, "User id");
    const loginId = normalizeLoginId(value.loginId);
    const displayName = normalizeDisplayName(value.displayName, "User display name");

    if (
      typeof value.active !== "boolean" ||
      !isIsoTimestamp(value.createdAt) ||
      !isIsoTimestamp(value.updatedAt)
    ) {
      return null;
    }

    return {
      id,
      loginId,
      displayName,
      active: value.active,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    };
  } catch {
    return null;
  }
}

function normalizeStoredWorkspace(value) {
  if (!isPlainObject(value)) return null;

  try {
    const id = normalizeId(value.id, "Workspace id");
    const ownerUserId = normalizeId(value.ownerUserId, "Workspace owner user id");
    const name = normalizeDisplayName(value.name, "Workspace name");

    if (
      id === DEFAULT_WORKSPACE_ID ||
      typeof value.active !== "boolean" ||
      !isIsoTimestamp(value.createdAt) ||
      !isIsoTimestamp(value.updatedAt)
    ) {
      return null;
    }

    return {
      id,
      ownerUserId,
      name,
      active: value.active,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    };
  } catch {
    return null;
  }
}

async function readUsers(env) {
  const stored = await getJson(env, USERS_KEY);
  if (
    !isPlainObject(stored) ||
    stored.version !== STORE_VERSION ||
    !Array.isArray(stored.users)
  ) {
    return [];
  }
  return stored.users.map(normalizeStoredUser).filter(Boolean);
}

async function readWorkspaces(env) {
  const stored = await getJson(env, WORKSPACES_KEY);
  if (
    !isPlainObject(stored) ||
    stored.version !== STORE_VERSION ||
    !Array.isArray(stored.workspaces)
  ) {
    return [];
  }
  return stored.workspaces.map(normalizeStoredWorkspace).filter(Boolean);
}

function generatedId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function timestampNow(now) {
  const value = now instanceof Date ? now : new Date(now ?? Date.now());
  if (!Number.isFinite(value.getTime())) {
    fail("Timestamp is invalid", "timestamp_invalid");
  }
  return value.toISOString();
}

export async function listUsers(env, { activeOnly = false } = {}) {
  const users = await readUsers(env);
  return users.filter((user) => !activeOnly || user.active);
}

export async function getUserById(env, userId) {
  const normalizedUserId = normalizeId(userId, "User id");
  return (await readUsers(env)).find((user) => user.id === normalizedUserId) ?? null;
}

export async function getUserByLoginId(env, loginId) {
  const normalizedLoginId = normalizeLoginId(loginId);
  return (await readUsers(env)).find((user) => user.loginId === normalizedLoginId) ?? null;
}

export async function createUser(
  env,
  { loginId, displayName, active = true },
  { now, createUserId = () => generatedId("user") } = {},
) {
  const normalizedLoginId = normalizeLoginId(loginId);
  const normalizedDisplayName = normalizeDisplayName(displayName, "User display name");
  if (typeof active !== "boolean") {
    fail("User active is invalid", "user_active_invalid");
  }

  const users = await readUsers(env);
  if (users.some((user) => user.loginId === normalizedLoginId)) {
    fail("User login id already exists", "user_login_id_duplicate");
  }

  const id = normalizeId(createUserId(), "User id");
  if (users.some((user) => user.id === id)) {
    fail("User id already exists", "user_id_duplicate");
  }

  const createdAt = timestampNow(now);
  const user = {
    id,
    loginId: normalizedLoginId,
    displayName: normalizedDisplayName,
    active,
    createdAt,
    updatedAt: createdAt,
  };

  await putJson(env, USERS_KEY, {
    version: STORE_VERSION,
    users: [...users, user],
  });
  return user;
}

export async function listWorkspacesForOwner(
  env,
  ownerUserId,
  { activeOnly = false } = {},
) {
  const normalizedOwnerUserId = normalizeId(ownerUserId, "Workspace owner user id");
  const workspaces = (await readWorkspaces(env)).filter(
    (workspace) => workspace.ownerUserId === normalizedOwnerUserId,
  );

  if (normalizedOwnerUserId === DEFAULT_WORKSPACE_OWNER_USER_ID) {
    workspaces.unshift(getDefaultWorkspace());
  }

  return workspaces.filter((workspace) => !activeOnly || workspace.active);
}

export async function getWorkspaceForOwner(env, workspaceId, ownerUserId) {
  const normalizedWorkspaceId = normalizeId(workspaceId, "Workspace id");
  const normalizedOwnerUserId = normalizeId(ownerUserId, "Workspace owner user id");

  if (normalizedWorkspaceId === DEFAULT_WORKSPACE_ID) {
    return normalizedOwnerUserId === DEFAULT_WORKSPACE_OWNER_USER_ID
      ? getDefaultWorkspace()
      : null;
  }

  return (await readWorkspaces(env)).find(
    (workspace) =>
      workspace.id === normalizedWorkspaceId &&
      workspace.ownerUserId === normalizedOwnerUserId,
  ) ?? null;
}

export async function getWorkspaceById(env, workspaceId) {
  const normalizedWorkspaceId = normalizeId(workspaceId, "Workspace id");
  if (normalizedWorkspaceId === DEFAULT_WORKSPACE_ID) {
    return getDefaultWorkspace();
  }
  return (await readWorkspaces(env)).find(
    (workspace) => workspace.id === normalizedWorkspaceId,
  ) ?? null;
}

export async function createWorkspace(
  env,
  { ownerUserId, name, active = true },
  { now, createWorkspaceId = () => generatedId("workspace") } = {},
) {
  const normalizedOwnerUserId = normalizeId(ownerUserId, "Workspace owner user id");
  const normalizedName = normalizeDisplayName(name, "Workspace name");
  if (typeof active !== "boolean") {
    fail("Workspace active is invalid", "workspace_active_invalid");
  }

  const workspaces = await readWorkspaces(env);
  const id = normalizeId(createWorkspaceId(), "Workspace id");
  if (id === DEFAULT_WORKSPACE_ID) {
    fail("Default Workspace is synthetic", "workspace_default_synthetic");
  }
  if (workspaces.some((workspace) => workspace.id === id)) {
    fail("Workspace id already exists", "workspace_id_duplicate");
  }

  const createdAt = timestampNow(now);
  const workspace = {
    id,
    ownerUserId: normalizedOwnerUserId,
    name: normalizedName,
    active,
    createdAt,
    updatedAt: createdAt,
  };

  await putJson(env, WORKSPACES_KEY, {
    version: STORE_VERSION,
    workspaces: [...workspaces, workspace],
  });
  return workspace;
}

function encodeBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function decodeBase64(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function isValidPassword(password) {
  return typeof password === "string" && password.length > 0 && password.length <= 1024;
}

function normalizePasswordAuthRecord(value) {
  if (!isPlainObject(value) || value.version !== PASSWORD_AUTH_VERSION) {
    return null;
  }
  if (
    value.algorithm !== PASSWORD_AUTH_ALGORITHM ||
    ![
      PASSWORD_AUTH_ITERATIONS,
      LEGACY_PASSWORD_AUTH_ITERATIONS,
    ].includes(value.iterations) ||
    value.derivedKeyLength !== PASSWORD_AUTH_KEY_LENGTH ||
    !isIsoTimestamp(value.updatedAt)
  ) {
    return null;
  }

  const salt = decodeBase64(value.salt);
  const hash = decodeBase64(value.hash);
  if (
    !salt || salt.byteLength !== PASSWORD_AUTH_SALT_LENGTH ||
    !hash || hash.byteLength !== PASSWORD_AUTH_KEY_LENGTH
  ) {
    return null;
  }

  return {
    version: PASSWORD_AUTH_VERSION,
    algorithm: PASSWORD_AUTH_ALGORITHM,
    iterations: value.iterations,
    derivedKeyLength: PASSWORD_AUTH_KEY_LENGTH,
    salt: value.salt,
    hash: value.hash,
    updatedAt: value.updatedAt,
  };
}

async function derivePasswordHash(password, salt, iterations = PASSWORD_AUTH_ITERATIONS) {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    passwordKey,
    PASSWORD_AUTH_KEY_LENGTH * 8,
  );
  return new Uint8Array(bits);
}

function timingSafeEqualBytes(left, right) {
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array)) {
    return false;
  }

  let difference = left.byteLength ^ right.byteLength;
  const length = Math.max(left.byteLength, right.byteLength);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export async function createPasswordAuthRecord(password, { now } = {}) {
  if (!isValidPassword(password)) {
    fail("Password is invalid", "password_invalid");
  }

  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_AUTH_SALT_LENGTH));
  const hash = await derivePasswordHash(password, salt);
  return {
    version: PASSWORD_AUTH_VERSION,
    algorithm: PASSWORD_AUTH_ALGORITHM,
    iterations: PASSWORD_AUTH_ITERATIONS,
    derivedKeyLength: PASSWORD_AUTH_KEY_LENGTH,
    salt: encodeBase64(salt),
    hash: encodeBase64(hash),
    updatedAt: timestampNow(now),
  };
}

export async function setUserPassword(env, userId, password, options = {}) {
  const normalizedUserId = normalizeId(userId, "User id");
  const authRecord = await createPasswordAuthRecord(password, options);
  await putJson(env, `${USER_AUTH_KEY_PREFIX}${normalizedUserId}`, authRecord);
  return authRecord;
}

export async function verifyUserPassword(env, userId, password) {
  if (!isValidPassword(password)) return false;

  let normalizedUserId;
  try {
    normalizedUserId = normalizeId(userId, "User id");
  } catch {
    return false;
  }

  const record = normalizePasswordAuthRecord(
    await getJson(env, `${USER_AUTH_KEY_PREFIX}${normalizedUserId}`),
  );
  if (!record) return false;

  // Keep known legacy metadata readable, but never call Workers WebCrypto with
  // an iteration count it rejects. A legacy password must be reprovisioned.
  if (record.iterations > PASSWORD_AUTH_ITERATIONS) return false;

  const salt = decodeBase64(record.salt);
  const storedHash = decodeBase64(record.hash);
  if (!salt || !storedHash) return false;

  const derivedHash = await derivePasswordHash(password, salt, record.iterations);
  return timingSafeEqualBytes(derivedHash, storedHash);
}

export function parseAdminSessionValue(value, { now = Date.now() } = {}) {
  if (value === "valid") {
    return Object.freeze({
      version: 0,
      userId: LEGACY_USER_ID,
      selectedWorkspaceId: DEFAULT_WORKSPACE_ID,
      legacy: true,
    });
  }

  if (typeof value !== "string" || !value) return null;

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!isPlainObject(parsed)) return null;
  const allowedKeys = new Set([
    "version",
    "userId",
    "selectedWorkspaceId",
    "createdAt",
    "expiresAt",
  ]);
  if (Object.keys(parsed).some((key) => !allowedKeys.has(key))) return null;
  if (
    parsed.version !== STORE_VERSION ||
    !isIsoTimestamp(parsed.createdAt) ||
    !isIsoTimestamp(parsed.expiresAt) ||
    Date.parse(parsed.expiresAt) <= Date.parse(parsed.createdAt) ||
    Date.parse(parsed.expiresAt) <= now
  ) {
    return null;
  }

  let userId;
  try {
    userId = normalizeId(parsed.userId, "User id");
  } catch {
    return null;
  }

  let selectedWorkspaceId = null;
  if (parsed.selectedWorkspaceId !== null) {
    try {
      selectedWorkspaceId = normalizeId(parsed.selectedWorkspaceId, "Workspace id");
    } catch {
      return null;
    }
  }

  return Object.freeze({
    version: STORE_VERSION,
    userId,
    selectedWorkspaceId,
    createdAt: parsed.createdAt,
    expiresAt: parsed.expiresAt,
    legacy: false,
  });
}

export function createStructuredAdminSessionValue(
  userId,
  selectedWorkspaceId,
  { now = Date.now(), ttlSeconds } = {},
) {
  let normalizedUserId;
  try {
    normalizedUserId = normalizeId(userId, "User id");
  } catch {
    fail("Session user id is invalid", "session_user_id_invalid");
  }

  let normalizedWorkspaceId = null;
  if (selectedWorkspaceId !== null && selectedWorkspaceId !== undefined) {
    try {
      normalizedWorkspaceId = normalizeId(selectedWorkspaceId, "Workspace id");
    } catch {
      fail("Session Workspace id is invalid", "session_workspace_id_invalid");
    }
  }

  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    fail("Session lifetime is invalid", "session_ttl_invalid");
  }

  const createdAt = timestampNow(now);
  const expiresAt = timestampNow(Date.parse(createdAt) + ttlSeconds * 1000);
  return {
    version: STORE_VERSION,
    userId: normalizedUserId,
    selectedWorkspaceId: normalizedWorkspaceId,
    createdAt,
    expiresAt,
  };
}

export async function getParsedAdminSession(env, sessionId, options = {}) {
  let normalizedSessionId;
  try {
    normalizedSessionId = normalizeId(sessionId, "Session id");
  } catch {
    return null;
  }

  const raw = await getText(env, `${ADMIN_SESSION_KEY_PREFIX}${normalizedSessionId}`);
  return parseAdminSessionValue(raw, options);
}

/**
 * Resolves a selected Workspace only after its User ownership and active state
 * are verified. A null selection intentionally never falls back to the legacy
 * default Workspace for a non-legacy User.
 */
export async function resolveSelectedWorkspaceForSession(env, session) {
  if (!session || typeof session !== "object") return null;
  if (session.legacy) return getDefaultWorkspace();

  const user = await getUserById(env, session.userId);
  if (!user || !user.active || session.selectedWorkspaceId === null) return null;

  const workspace = await getWorkspaceForOwner(
    env,
    session.selectedWorkspaceId,
    user.id,
  );
  return workspace?.active ? workspace : null;
}
