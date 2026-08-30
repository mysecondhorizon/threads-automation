import { resolveCurrentSession } from "../middleware/auth.js";
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

async function parseInput(request) {
  let input;
  try {
    input = await request.json();
  } catch {
    return null;
  }

  if (
    !isPlainObject(input) ||
    Object.keys(input).some((key) => !ALLOWED_INPUT_KEYS.has(key)) ||
    input.confirm !== CONFIRMATION ||
    !isWorkspaceId(input.sourceWorkspaceId) ||
    !isWorkspaceId(input.destinationWorkspaceId)
  ) {
    return null;
  }
  return input;
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
  if (!session.session.legacy) {
    return failure("Forbidden", 403);
  }

  const input = await parseInput(request);
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
