import { requireAdminApiSession } from "../middleware/auth.js";
import { recognizeProductFromMedia } from "../services/product-recognition.js";
import { fail, ok } from "../utils/response.js";

export async function handleOperatorProductAnalyze(request, env, { recognize = recognizeProductFromMedia } = {}) {
  const auth = await requireAdminApiSession(request, env); if (!auth.ok) return auth.response;
  if (request.method !== "POST") return fail("Method Not Allowed", 405);
  try {
    const body = await request.json();
    const mediaId = typeof body?.mediaId === "string" ? body.mediaId.trim() : "";
    if (!mediaId) return fail("mediaId is required", 400, { code: "product_media_required" });
    return ok({ product: await recognize(env, mediaId) });
  } catch (error) { return fail("Product recognition failed", 400, { code: "product_recognition_failed" }); }
}
