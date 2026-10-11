import { resolveCurrentSession } from "./auth.js";
import { getJson } from "../services/kv.js";
import { LEGACY_USER_ID, USERS_KEY } from "../services/login-foundation.js";
import { hasPlatformOperatorGrant } from "../services/platform-operators.js";
import { fail } from "../utils/response.js";

function denied(status) {
  const response = fail(status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : "Authorization unavailable", status);
  response.headers.set("cache-control", "no-store");
  return { ok: false, response };
}

// Opt-in guard for future platform operations. Existing admin/app routes are
// unchanged. Operator authority never grants Workspace ownership or selection.
export async function requirePlatformOperatorSession(request, env) {
  try {
    const current = await resolveCurrentSession(request, env);
    if (!current) return denied(401);
    if (current.session.legacy || current.user.id === LEGACY_USER_ID) return denied(403);

    // Existing user lookup returns the first normalized match. A privileged
    // boundary must not accept an ambiguous/disabled duplicate identity.
    const users = await getJson(env, USERS_KEY);
    if (users?.version !== 1 || !Array.isArray(users.users)) return denied(403);
    const matches = users.users.filter(user => typeof user?.id === "string" && user.id.trim() === current.user.id);
    if (matches.length !== 1 || matches[0].id !== current.user.id || matches[0].active !== true) return denied(403);
    if (!await hasPlatformOperatorGrant(env, current.user.id)) return denied(403);

    // No session token, selected Workspace, credentials or global data access.
    return Object.freeze({ ok: true, operator: Object.freeze({ userId: current.user.id }) });
  } catch {
    // KV/session failures cannot accidentally turn into authorization success.
    return denied(503);
  }
}
