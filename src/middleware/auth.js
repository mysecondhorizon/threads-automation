import { getCookieValue } from "../utils/cookie.js";
import { fail } from "../utils/response.js";
import {
  LEGACY_USER_ID,
  getParsedAdminSession,
  getUserById,
} from "../services/login-foundation.js";

const LEGACY_CURRENT_USER = Object.freeze({
  id: LEGACY_USER_ID,
  displayName: "Legacy Operator",
  active: true,
});

async function resolveAuthenticatedSession(request, env) {
  let sessionId;
  try {
    sessionId = getCookieValue(request, "admin_session");
  } catch {
    return null;
  }
  if (!sessionId) return null;

  const session = await getParsedAdminSession(env, sessionId);
  if (!session) return null;

  if (session.legacy) {
    return {
      sessionId,
      user: { ...LEGACY_CURRENT_USER },
    };
  }

  const user = await getUserById(env, session.userId);
  if (!user || !user.active) return null;

  return {
    sessionId,
    user: {
      id: user.id,
      displayName: user.displayName,
      active: true,
    },
  };
}

export async function resolveCurrentUser(request, env) {
  const resolved = await resolveAuthenticatedSession(request, env);
  return resolved?.user ?? null;
}

export async function requireAdminSession(request, env) {
  const resolved = await resolveAuthenticatedSession(request, env);
  if (!resolved) {
    return {
      ok: false,
      response: Response.redirect(
        new URL("/admin/login", request.url).toString(),
        302
      ),
    };
  }

  return {
    ok: true,
    sessionId: resolved.sessionId,
    user: resolved.user,
  };
}

export async function requireAdminApiSession(
  request,
  env
) {
  const result = await requireAdminSession(
    request,
    env
  );

  if (result.ok) {
    return result;
  }

  return {
    ok: false,
    response: fail("Unauthorized", 401),
  };
}
