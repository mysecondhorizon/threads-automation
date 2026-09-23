import { requireAdminApiSession } from "../middleware/auth.js";
import { refreshScopedPostInsights, InsightCollectionError } from "../services/threads-sync.js";
import { ok, fail } from "../utils/response.js";

export async function handlePostInsights(request, env, url, { collect = refreshScopedPostInsights } = {}) {
  const adminAuth = await requireAdminApiSession(request, env, { allowSelectedWorkspace: true });
  if (!adminAuth.ok) return adminAuth.response;
  const postId = String(url.searchParams.get("post_id") || "").trim();
  if (!postId) return fail("post_id가 필요합니다.", 400);
  try {
    const insights = await collect(env, postId, { workspaceId: adminAuth.workspaceId });
    return ok({ insights });
  } catch (error) {
    return fail("게시물 인사이트 조회에 실패했습니다.",
      error instanceof InsightCollectionError ? error.status : 502,
      { code: error instanceof InsightCollectionError ? error.code : "insight_collection_failed" });
  }
}
