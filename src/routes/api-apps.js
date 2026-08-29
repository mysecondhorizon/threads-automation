import { requireAdminApiSession } from "../middleware/auth.js";
import {
  AppsError,
  createApp,
  deleteApp,
  getApp,
  listApps,
  updateApp,
} from "../services/apps.js";
import { fail, ok } from "../utils/response.js";

function toErrorResponse(error) {
  if (error instanceof AppsError) {
    return fail(error.message, error.status, { code: error.code });
  }
  return fail("App request failed", 500, { code: "app_request_failed" });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new AppsError("Request body must be valid JSON", { code: "invalid_app" });
  }
}

export async function handleAppsCollection(request, env) {
  const auth = await requireAdminApiSession(request, env);
  if (!auth.ok) return auth.response;

  try {
    if (request.method === "GET") return ok({ apps: await listApps(env) });
    if (request.method === "POST") return ok({ app: await createApp(env, await readJson(request)) }, 201);
    return fail("Method Not Allowed", 405);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function handleAppById(request, env, appId) {
  const auth = await requireAdminApiSession(request, env);
  if (!auth.ok) return auth.response;

  try {
    if (request.method === "GET") {
      const app = await getApp(env, appId);
      return app ? ok({ app }) : fail("App not found", 404, { code: "app_not_found" });
    }
    if (request.method === "PATCH") {
      const app = await updateApp(env, appId, await readJson(request));
      return app ? ok({ app }) : fail("App not found", 404, { code: "app_not_found" });
    }
    if (request.method === "DELETE") {
      const deleted = await deleteApp(env, appId);
      return deleted ? ok({ deleted: true }) : fail("App not found", 404, { code: "app_not_found" });
    }
    return fail("Method Not Allowed", 405);
  } catch (error) {
    return toErrorResponse(error);
  }
}
