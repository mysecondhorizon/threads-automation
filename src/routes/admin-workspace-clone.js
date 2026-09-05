import { resolveCurrentSession } from "../middleware/auth.js";
import { getWorkspaceForOwner } from "../services/login-foundation.js";
import { DEFAULT_WORKSPACE_ID } from "../services/workspace-foundation.js";
import { WorkspaceCloneError, cloneWorkspace } from "../services/workspace-clone.js";

const CONFIRMATION = "CLONE_WORKSPACE";
const ALLOWED_INPUT_KEYS = new Set([
  "sourceWorkspaceId",
  "destinationWorkspaceId",
  "confirm",
]);

function response(payload, status) {
  return Response.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function failure(error, status, extra = {}) {
  return response({ ok: false, error, ...extra }, status);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isWorkspaceId(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sanitizeStringList(value, maxLength = 1024) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.length <= maxLength)
    : [];
}

function sanitizeCreated(created) {
  return {
    promptProfilePersisted: created?.promptProfilePersisted === true,
    productIds: sanitizeStringList(created?.productIds, 120),
    mediaIds: sanitizeStringList(created?.mediaIds, 120),
    contentPoolIds: sanitizeStringList(created?.contentPoolIds, 120),
    objectKeys: sanitizeStringList(created?.objectKeys),
  };
}

async function parseInput(request, allowedKeys) {
  let input;
  try {
    input = await request.json();
  } catch {
    return null;
  }

  if (
    !isPlainObject(input) ||
    Object.keys(input).some((key) => !allowedKeys.has(key)) ||
    input.confirm !== CONFIRMATION
  ) {
    return null;
  }
  return input;
}

async function resolveCloneInput(request, env, current) {
  if (current.session.legacy) {
    const input = await parseInput(request, ALLOWED_INPUT_KEYS);
    if (!input || !isWorkspaceId(input.sourceWorkspaceId) || !isWorkspaceId(input.destinationWorkspaceId)) {
      return null;
    }
    return {
      sourceWorkspaceId: input.sourceWorkspaceId,
      destinationWorkspaceId: input.destinationWorkspaceId,
    };
  }

  const input = await parseInput(request, new Set(["confirm"]));
  const selectedWorkspaceId = current.session.selectedWorkspaceId;
  if (
    !input ||
    !isWorkspaceId(selectedWorkspaceId) ||
    selectedWorkspaceId === DEFAULT_WORKSPACE_ID
  ) {
    return null;
  }

  const destinationWorkspace = await getWorkspaceForOwner(
    env,
    selectedWorkspaceId,
    current.user.id,
  );
  if (!destinationWorkspace?.active) return null;

  return {
    sourceWorkspaceId: DEFAULT_WORKSPACE_ID,
    destinationWorkspaceId: destinationWorkspace.id,
  };
}

export async function handleAdminWorkspaceClone(
  request,
  env,
  { clone = cloneWorkspace } = {},
) {
  if (request.method !== "POST") {
    return failure("Method Not Allowed", 405);
  }

  const session = await resolveCurrentSession(request, env);
  if (!session) {
    return failure("Unauthorized", 401);
  }
  const input = await resolveCloneInput(request, env, session);
  if (!input) {
    return failure("Invalid workspace clone request", 400);
  }

  try {
    const result = await clone(env, {
      sourceWorkspaceId: input.sourceWorkspaceId,
      destinationWorkspaceId: input.destinationWorkspaceId,
    });
    return response({
      ok: true,
      sourceWorkspaceId: result.sourceWorkspaceId,
      destinationWorkspaceId: result.destinationWorkspaceId,
      operationId: result.operationId,
      created: sanitizeCreated(result.created),
    }, 200);
  } catch (error) {
    if (error instanceof WorkspaceCloneError) {
      const partial = error.code === "workspace_clone_partial";
      return failure("Workspace clone failed", partial ? 500 : 409, {
        code: error.code,
        stage: error.stage,
        ...(partial ? { created: sanitizeCreated(error.created) } : {}),
      });
    }
    return failure("Workspace clone failed", 500, {
      code: "workspace_clone_failed",
    });
  }
}
