import { requireAdminApiSession } from "../middleware/auth.js";
import { listMedia } from "../services/media.js";
import { fail, ok } from "../utils/response.js";

const PRODUCT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function runBatchUpload(env, input) {
  const { batchUploadMedia } = await import("../services/media-batch.js");
  return batchUploadMedia(env, input);
}

function toOperatorProductMedia(media) {
  return {
    id: media.id,
    kind: "image",
    description: media.description || "",
    tags: Array.isArray(media.tags) ? [...media.tags] : [],
    active: media.active === true,
    createdAt: media.createdAt,
    updatedAt: media.updatedAt,
    previewUrl: `/media/${encodeURIComponent(media.id)}`,
  };
}

async function authorize(request, env) {
  const auth = await requireAdminApiSession(request, env);
  return auth.ok ? null : auth.response;
}

export async function handleOperatorProductMedia(request, env, {
  list = listMedia,
  batchUpload = runBatchUpload,
} = {}) {
  const unauthorized = await authorize(request, env);
  if (unauthorized) return unauthorized;

  try {
    if (request.method === "GET") {
      const media = await list(env, { sourceType: "product" });
      return ok({
        media: media
          .filter((item) => item.sourceType === "product" && item.mediaKind === "image")
          .map(toOperatorProductMedia),
      });
    }
    if (request.method !== "POST") return fail("Method Not Allowed", 405);

    const form = await request.formData();
    const files = form.getAll("files");
    if (!files.length) return fail("Upload at least one product image", 400, { code: "product_media_files_required" });
    if (files.some((file) => !file || !PRODUCT_IMAGE_TYPES.has(file.type))) {
      return fail("Only JPEG, PNG, and WebP product images are supported", 400, { code: "product_image_type_invalid" });
    }
    const result = await batchUpload(env, {
      files,
      defaults: { sourceType: "product" },
      // Preserve Product Content Pool behavior. Product type remains isolated
      // from the GENERAL AUTO media candidate path.
      createPoolItems: true,
    });
    const media = (Array.isArray(result?.results) ? result.results : [])
      .filter((item) => item?.status === "success" && item.media?.sourceType === "product")
      .map((item) => toOperatorProductMedia(item.media));
    if (!media.length) return fail("Product image upload failed", 400, { code: "product_media_upload_failed" });
    return ok({ media });
  } catch (error) {
    console.error("Operator product media request failed", { code: error?.code || "product_media_request_failed" });
    return fail("Product media request failed", 400, { code: error?.code || "product_media_request_failed" });
  }
}
