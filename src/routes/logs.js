import { requireAdminApiSession } from "../middleware/auth.js";
import { getPostLogs } from "../services/logger.js";
import { ok } from "../utils/response.js";

export async function handleLogs(request, env) {
  const auth = await requireAdminApiSession(request, env);

  if (!auth.ok) {
    return auth.response;
  }

  const logs = await getPostLogs(env);

  return ok({
    count: logs.length,
    logs,
  });
}
