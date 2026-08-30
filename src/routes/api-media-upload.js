import { requireAdminApiSession } from "../middleware/auth.js";
import { getProductById } from "../services/products.js";
import { DEFAULT_WORKSPACE_ID } from "../services/workspace-foundation.js";
import { fail, ok } from "../utils/response.js";

async function runBatchUpload(env, input) {
  const { batchUploadMedia } = await import("../services/media-batch.js");
  return batchUploadMedia(env, input);
}

function toOperatorMedia(media) {
  if (!media) return null;
  return {
    id: media.id,
    kind: media.mediaKind === "video" ? "video" : "image",
    description: media.description || "",
    tags: Array.isArray(media.tags) ? [...media.tags] : [],
    active: media.active === true,
    createdAt: media.createdAt,
    updatedAt: media.updatedAt,
    previewUrl: `/media/${encodeURIComponent(media.id)}`,
  };
}

function toOperatorResult(result) {
  const media = toOperatorMedia(result?.media);
  const succeeded = Boolean(media) && (result?.status === "success" || result?.status === "partial");
  return {
    fileName: String(result?.fileName || "file"),
    status: succeeded ? "success" : "failed",
    ...(media ? { media } : {}),
    ...(succeeded ? {} : { error: "Unable to process this file" }),
  };
}

function parseUploadSourceType(value) {
  const sourceType = typeof value === "string" ? value.trim().toLowerCase() : "";
  return sourceType === "" || sourceType === "general" || sourceType === "product"
    ? sourceType || "general"
    : null;
}

function parseOptionalProductId(value) {
  if (value === null || value === undefined) return { productId: null };
  if (typeof value !== "string") return { error: "productId must be a string" };
  const productId = value.trim();
  if (!productId) return { productId: null };
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(productId)) {
    return { error: "productId must be a valid product ID" };
  }
  return { productId };
}

export async function handleOperatorMediaUpload(request, env, {
  batchUpload = runBatchUpload,
  getProduct = getProductById,
} = {}) {
  const auth = await requireAdminApiSession(request, env);
  if (!auth.ok) return auth.response;
  if (request.method !== "POST") return fail("Method Not Allowed", 405);
  try {
    const form = await request.formData();
    const files = form.getAll("files");
    if (!files.length) return fail("Upload at least one file", 400, { code: "media_files_required" });
    const sourceType = parseUploadSourceType(form.get("sourceType"));
    if (!sourceType) return fail("sourceType must be general or product", 400, { code: "media_source_type_invalid" });
    const parsedProductId = parseOptionalProductId(form.get("productId"));
    if (parsedProductId.error) return fail(parsedProductId.error, 400, { code: "media_product_link_invalid" });
    if (sourceType !== "product" && parsedProductId.productId) {
      return fail("Only Product Media can set productId", 400, { code: "media_product_link_invalid" });
    }
    if (parsedProductId.productId) {
      const product = await getProduct(env, parsedProductId.productId, DEFAULT_WORKSPACE_ID);
      if (!product) return fail("Product not found", 404, { code: "product_not_found" });
    }
    const experienceTags = String(form.get("experienceTags") || "");
    const experienceNote = String(form.get("experienceNote") || "");
    const result = await batchUpload(env, {
      files,
      defaults: {
        sourceType,
        productId: parsedProductId.productId,
        experienceTags,
        experienceNote,
      },
      createPoolItems: true,
    }, DEFAULT_WORKSPACE_ID);
    return ok({ results: (Array.isArray(result?.results) ? result.results : []).map(toOperatorResult) });
  } catch (error) {
    console.error("Operator media upload failed", { code: error?.code || "media_upload_failed" });
    return fail("Media upload failed", 400, { code: error?.code || "media_upload_failed" });
  }
}
