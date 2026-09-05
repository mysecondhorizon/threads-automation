import { requireAdminApiSession } from "../middleware/auth.js";
import { getOperatorActivity } from "../services/activity.js";
import { fail, ok } from "../utils/response.js";

export async function handleOperatorActivity(request, env, url = new URL(request.url), { getActivity = getOperatorActivity } = {}) {
  const auth = await requireAdminApiSession(request, env, {
    allowSelectedWorkspace: true,
  });
  if (!auth.ok) return auth.response;
  if (request.method !== "GET") return fail("Method Not Allowed", 405);
  try {
    return ok(await getActivity(env, {
      limit: url.searchParams.get("limit"),
      workspaceId: auth.workspaceId,
    }));
  } catch (error) {
    console.error("Operator activity lookup failed", error);
    return fail("운영 활동을 불러오지 못했습니다.", 500);
  }
}
