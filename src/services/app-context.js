import { putText } from "./kv.js";
import {
  ADMIN_SESSION_KEY_PREFIX,
  getWorkspaceForOwner,
  listWorkspacesForOwner,
} from "./login-foundation.js";
import { DEFAULT_WORKSPACE_ID, getDefaultWorkspace } from "./workspace-foundation.js";
import { resolveCurrentSession } from "../middleware/auth.js";

export class AppContextError extends Error {
  constructor(message, code = "app_context_failed") {
    super(message);
    this.name = "AppContextError";
    this.code = code;
  }
}

function fail(message, code) {
  throw new AppContextError(message, code);
}

function sanitizeWorkspace(workspace) {
  if (!workspace) return null;
  return {
    id: workspace.id,
    name: workspace.name,
    active: workspace.active,
  };
}

export async function resolveCurrentAppContext(request, env) {
  const resolved = await resolveCurrentSession(request, env);
  if (!resolved) return null;

  if (resolved.session.legacy) {
    const workspace = sanitizeWorkspace(getDefaultWorkspace());
    return {
      legacy: true,
      sessionId: resolved.sessionId,
      user: resolved.user,
      currentWorkspace: workspace,
      workspaces: [workspace],
      hasSelectedNonDefaultWorkspace: false,
    };
  }

  const workspaces = (await listWorkspacesForOwner(env, resolved.user.id, {
    activeOnly: true,
  })).map(sanitizeWorkspace);
  const selectedWorkspaceId = resolved.session.selectedWorkspaceId;
  if (selectedWorkspaceId === null) {
    return {
      legacy: false,
      sessionId: resolved.sessionId,
      user: resolved.user,
      currentWorkspace: null,
      workspaces,
      hasSelectedNonDefaultWorkspace: false,
    };
  }

  const selected = await getWorkspaceForOwner(
    env,
    selectedWorkspaceId,
    resolved.user.id,
  );
  const currentWorkspace = selected?.active && selected.id !== DEFAULT_WORKSPACE_ID
    ? sanitizeWorkspace(selected)
    : null;

  return {
    legacy: false,
    sessionId: resolved.sessionId,
    user: resolved.user,
    currentWorkspace,
    workspaces,
    hasSelectedNonDefaultWorkspace:
      selectedWorkspaceId !== DEFAULT_WORKSPACE_ID,
  };
}

export async function resolveCurrentWorkspace(request, env) {
  return (await resolveCurrentAppContext(request, env))?.currentWorkspace ?? null;
}

export function isUnscopedAppAccessBlocked(appContext) {
  return Boolean(
    appContext &&
    !appContext.legacy &&
    appContext.hasSelectedNonDefaultWorkspace,
  );
}

export async function selectCurrentWorkspace(request, env, workspaceId, { now = Date.now() } = {}) {
  const resolved = await resolveCurrentSession(request, env);
  if (!resolved) {
    fail("Workspace selection is unavailable", "workspace_selection_unauthenticated");
  }
  if (resolved.session.legacy) {
    fail("Workspace selection is unavailable", "workspace_selection_unavailable");
  }

  const session = resolved.session;
  let workspace;
  try {
    workspace = await getWorkspaceForOwner(env, workspaceId, resolved.user.id);
  } catch {
    fail("Workspace selection is invalid", "workspace_selection_invalid");
  }

  if (!workspace || !workspace.active || workspace.id === DEFAULT_WORKSPACE_ID) {
    fail("Workspace selection is invalid", "workspace_selection_invalid");
  }

  const remainingSeconds = Math.floor((Date.parse(session.expiresAt) - now) / 1000);
  if (remainingSeconds < 1) {
    fail("Workspace session has expired", "workspace_session_expired");
  }

  const updatedSession = {
    version: session.version,
    userId: session.userId,
    selectedWorkspaceId: workspace.id,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  };
  await putText(
    env,
    `${ADMIN_SESSION_KEY_PREFIX}${resolved.sessionId}`,
    JSON.stringify(updatedSession),
    { expirationTtl: remainingSeconds },
  );

  return sanitizeWorkspace(workspace);
}
