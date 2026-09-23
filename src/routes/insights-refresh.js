import { requireAdminApiSession } from "../middleware/auth.js";
import { syncThreadsData, InsightCollectionError } from "../services/threads-sync.js";
import { ok, fail } from "../utils/response.js";

export async function handleRefreshInsights(request, env, { sync = syncThreadsData } = {}) {
  const adminAuth = await requireAdminApiSession(request, env, { allowSelectedWorkspace: true });
  if (!adminAuth.ok) return adminAuth.response;
  try {
    return ok(await sync(env, { workspaceId: adminAuth.workspaceId }));
  } catch (error) {
    return fail("Threads 인사이트를 갱신하지 못했습니다.",
      error instanceof InsightCollectionError ? error.status : 502,
      { code: error instanceof InsightCollectionError ? error.code : "insight_collection_failed" });
  }
}
