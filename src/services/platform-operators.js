import { getJson } from "./kv.js";
import { LEGACY_USER_ID } from "./login-foundation.js";

export const PLATFORM_OPERATOR_GRANTS_KEY = "platform_operator_grants:v1";
export const MAX_PLATFORM_OPERATOR_GRANTS = 100;
const validId = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/u.test(value) && value !== LEGACY_USER_ID;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, keys) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

// This lookup is not authentication. Only a validated, active structured-session
// user may be checked by the operator middleware. There is intentionally no
// grant writer or public bootstrap endpoint in this foundation tranche.
export async function hasPlatformOperatorGrant(env, userId) {
  if (!validId(userId)) return false;
  const stored = await getJson(env, PLATFORM_OPERATOR_GRANTS_KEY);
  if (!object(stored) || !exactKeys(stored, ["version", "grants"]) || stored.version !== 1 ||
      !Array.isArray(stored.grants) || stored.grants.length > MAX_PLATFORM_OPERATOR_GRANTS) return false;
  const seen = new Set();
  let granted = false;
  for (const grant of stored.grants) {
    if (!object(grant) || !exactKeys(grant, ["userId", "active"]) || !validId(grant.userId) ||
        typeof grant.active !== "boolean" || seen.has(grant.userId)) return false;
    seen.add(grant.userId);
    if (grant.userId === userId && grant.active) granted = true;
  }
  return granted;
}
