import { requireAdminApiSession } from "../middleware/auth.js";
import { getActiveProducts } from "../services/products.js";
import {
  ProductReviewError,
  generateProductReviewCandidate,
  isProductReviewEligible,
  listProductReviewCandidates,
  removePendingProductReviewCandidates,
  removeProductReviewCandidate,
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
        products: products.map((product) => ({
          id: product.id,
          name: product.name,
          category: product.category || null,
          eligible: isProductReviewEligible(product),
        })),
        candidates,
      });
    }

    if (request.method === "POST") {
      const body = await readJsonBody(request);
      if (body?.action === "remove_candidate") {
        const candidate = await removeProductReviewCandidate(
          env,
          body.candidateId
        );
        return ok({ candidate });
      }
      if (body?.action === "remove_pending") {
        return ok(
          await removePendingProductReviewCandidates(env)
        );
      }
      const requestedProductId = String(body?.productId || "").trim() || null;
      const selectionMode =
        body?.selectionMode === "direct" ||
        (body?.selectionMode === undefined && requestedProductId)
          ? "direct"
          : "auto";
      if (selectionMode === "direct" && !requestedProductId) {
        throw new ProductReviewError(
          "Direct selection requires a product.",
          "product_review_product_required"
        );
      }
      const candidate = await generateProductReviewCandidate(env, {
        productId: selectionMode === "direct" ? requestedProductId : null,
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
