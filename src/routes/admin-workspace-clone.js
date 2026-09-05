import { resolveCurrentSession } from "../middleware/auth.js";
import { getWorkspaceForOwner } from "../services/login-foundation.js";
import { DEFAULT_WORKSPACE_ID } from "../services/workspace-foundation.js";
import {
  WorkspaceCloneError,
  cloneWorkspace,
  getCloneDestinationOccupancy,
  getCloneSourceDestinationComparison,
} from "../services/workspace-clone.js";

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

function sanitizeOccupancy(occupancy) {
  const count = (store) => Number.isSafeInteger(store?.count) && store.count >= 0
    ? store.count
    : 0;
  const promptProfile = { empty: occupancy?.promptProfile?.empty === true };
  const products = { empty: occupancy?.products?.empty === true, count: count(occupancy?.products) };
  const media = { empty: occupancy?.media?.empty === true, count: count(occupancy?.media) };
  const contentPool = { empty: occupancy?.contentPool?.empty === true, count: count(occupancy?.contentPool) };
  return {
    promptProfile,
    products,
    media,
    contentPool,
    destinationEmpty: promptProfile.empty && products.empty && media.empty && contentPool.empty,
  };
}

function sanitizeComparison(comparison) {
  const count = (store, field) => Number.isSafeInteger(store?.[field]) && store[field] >= 0
    ? store[field]
    : 0;
  const store = (value) => ({
    sourceCount: count(value, "sourceCount"),
    destinationCount: count(value, "destinationCount"),
    equivalentCount: count(value, "equivalentCount"),
    destinationOnlyCount: count(value, "destinationOnlyCount"),
    sourceOnlyCount: count(value, "sourceOnlyCount"),
  });
  return {
    promptProfile: {
      sourceExists: comparison?.promptProfile?.sourceExists === true,
      destinationExists: comparison?.promptProfile?.destinationExists === true,
      equivalent: comparison?.promptProfile?.equivalent === true,
    },
    products: store(comparison?.products),
    media: store(comparison?.media),
    contentPool: store(comparison?.contentPool),
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
  const destinationWorkspace = await resolveRegisteredDestination(env, current);
  if (!input || !destinationWorkspace) return null;

  return {
    sourceWorkspaceId: DEFAULT_WORKSPACE_ID,
    destinationWorkspaceId: destinationWorkspace.id,
  };
}

async function resolveRegisteredDestination(env, current) {
  if (current.session.legacy) return null;
  const selectedWorkspaceId = current.session.selectedWorkspaceId;
  if (
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

  return destinationWorkspace?.active ? destinationWorkspace : null;
}

export async function handleAdminWorkspaceClonePreflight(
  request,
  env,
  {
    inspect = getCloneDestinationOccupancy,
    compare = getCloneSourceDestinationComparison,
  } = {},
) {
  if (request.method !== "GET") return failure("Method Not Allowed", 405);

  const current = await resolveCurrentSession(request, env);
  if (!current) return failure("Unauthorized", 401);
  if (current.session.legacy) return failure("Forbidden", 403);
  const destinationWorkspace = await resolveRegisteredDestination(env, current);
  if (!destinationWorkspace) return failure("Invalid workspace clone request", 400);

  try {
    const [occupancy, comparison] = await Promise.all([
      inspect(env, destinationWorkspace.id),
      compare(env, destinationWorkspace.id),
    ]);
    const sanitizedOccupancy = sanitizeOccupancy(occupancy);
    return response({
      ok: true,
      destination: {
        workspaceId: destinationWorkspace.id,
        name: destinationWorkspace.name,
      },
      stores: {
        promptProfile: sanitizedOccupancy.promptProfile,
        products: sanitizedOccupancy.products,
        media: sanitizedOccupancy.media,
        contentPool: sanitizedOccupancy.contentPool,
      },
      destinationEmpty: sanitizedOccupancy.destinationEmpty,
      comparison: sanitizeComparison(comparison),
    }, 200);
  } catch {
    return failure("Workspace clone preflight failed", 500, {
      code: "workspace_clone_preflight_failed",
    });
  }
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
