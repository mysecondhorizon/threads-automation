import { getCookieValue } from "../utils/cookie.js";
import { fail } from "../utils/response.js";
import {
  LEGACY_USER_ID,
  getParsedAdminSession,
  getUserById,
} from "../services/login-foundation.js";
import { DEFAULT_WORKSPACE_ID } from "../services/workspace-foundation.js";

const LEGACY_CURRENT_USER = Object.freeze({
  id: LEGACY_USER_ID,
  displayName: "Legacy Operator",
  active: true,
});

export async function resolveCurrentSession(request, env) {
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
      session,
      user: { ...LEGACY_CURRENT_USER },
    };
  }

  const user = await getUserById(env, session.userId);
  if (!user || !user.active) return null;

  return {
    sessionId,
    session,
    user: {
      id: user.id,
      displayName: user.displayName,
      active: true,
    },
  };
}

export async function resolveCurrentUser(request, env) {
  const resolved = await resolveCurrentSession(request, env);
  return resolved?.user ?? null;
}

export async function requireAdminSession(request, env) {
  const resolved = await resolveCurrentSession(request, env);
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
    session: resolved.session,
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
    if (
      !result.session.legacy &&
      result.session.selectedWorkspaceId &&
      result.session.selectedWorkspaceId !== DEFAULT_WORKSPACE_ID
    ) {
      return {
        ok: false,
        response: fail("Workspace data access is not available yet", 409),
      };
    }
    return result;
  }

  return {
    ok: false,
    response: fail("Unauthorized", 401),
  };
}
