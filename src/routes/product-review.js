import { requireAdminApiSession } from "../middleware/auth.js";
import { getActiveProducts } from "../services/products.js";
import {
  ProductReviewError,
  generateProductReviewCandidate,
  isProductReviewEligible,
  listProductReviewCandidates,
} from "../services/product-review.js";
import { ok, fail } from "../utils/response.js";

async function readJsonBody(request) {
  if (!String(request.headers.get("content-type") || "").includes("application/json")) {
    throw new ProductReviewError("A JSON request body is required.", "invalid_content_type");
  }
  try {
    return await request.json();
  } catch {
    throw new ProductReviewError("The JSON request body is invalid.", "invalid_json_body");
  }
}

export async function handleProductReviews(request, env) {
  const auth = await requireAdminApiSession(request, env);
  if (!auth.ok) return auth.response;

  try {
    if (request.method === "GET") {
      const [products, candidates] = await Promise.all([
        getActiveProducts(env),
        listProductReviewCandidates(env),
      ]);
      return ok({
        products: products.filter(isProductReviewEligible).map((product) => ({
          id: product.id,
          name: product.name,
          category: product.category || null,
        })),
        candidates,
      });
    }

    if (request.method === "POST") {
      const body = await readJsonBody(request);
      const candidate = await generateProductReviewCandidate(env, {
        productId: String(body?.productId || "").trim() || null,
        source: "manual_product_test",
      });
      return ok({ candidate });
    }

    return fail("Method not allowed", 405);
  } catch (error) {
    if (error instanceof ProductReviewError) {
      return fail(error.message, 400, { code: error.code, details: error.details });
    }
    console.error("Unexpected product review route error", error);
    return fail("Unexpected server error", 500);
  }
}
