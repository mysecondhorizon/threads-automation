import { requireAdminApiSession } from "../middleware/auth.js";
import {
  getMedia,
  listMedia,
  resolveMediaWorkspaceId,
  updateMedia,
} from "../services/media.js";
import { getProductById, getProducts } from "../services/products.js";
import { fail, ok } from "../utils/response.js";

function toProductIdentity(product) {
  return {
    id: product.id,
    name: String(product.name || ""),
    productKey: String(product.productKey || ""),
  };
}

function toOperatorMedia(media, productsById = new Map()) {
  const linkedProduct = media.sourceType === "product" && media.productId
    ? productsById.get(media.productId) || { id: media.productId, missing: true }
    : null;
  return {
    id: media.id,
    kind: media.mediaKind === "video" ? "video" : "image",
    sourceType: media.sourceType === "product" ? "product" : "general",
    description: media.description || "",
    tags: Array.isArray(media.tags) ? [...media.tags] : [],
    experienceTags: Array.isArray(media.experienceTags) ? [...media.experienceTags] : [],
    experienceNote: media.experienceNote || "",
    linkedProduct,
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

function parsePatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Media update must be an object" };
  }
  const allowed = new Set(["description", "tags", "experienceTags", "experienceNote", "productId", "active"]);
  if (!Object.keys(value).length || Object.keys(value).some((key) => !allowed.has(key))) {
    return { error: "Only description, tags, experienceTags, experienceNote, productId, and active can be updated" };
  }
  const update = {};
  if (Object.hasOwn(value, "description")) {
    if (typeof value.description !== "string") return { error: "description must be a string" };
    update.description = value.description.trim();
  }
  if (Object.hasOwn(value, "tags")) {
    if (!Array.isArray(value.tags) || value.tags.some((tag) => typeof tag !== "string")) {
      return { error: "tags must be an array of strings" };
    }
    update.tags = [...new Set(value.tags.map((tag) => tag.trim()).filter(Boolean))];
  }
  if (Object.hasOwn(value, "experienceTags")) {
    if (!Array.isArray(value.experienceTags) || value.experienceTags.some((tag) => typeof tag !== "string")) {
      return { error: "experienceTags must be an array of strings" };
    }
    update.experienceTags = [...new Set(value.experienceTags.map((tag) => tag.trim()).filter(Boolean))];
  }
  if (Object.hasOwn(value, "experienceNote")) {
    if (typeof value.experienceNote !== "string") return { error: "experienceNote must be a string" };
    update.experienceNote = value.experienceNote.trim();
  }
  if (Object.hasOwn(value, "productId")) {
    if (value.productId !== null && typeof value.productId !== "string") {
      return { error: "productId must be a string or null" };
    }
    const productId = typeof value.productId === "string"
      ? value.productId.trim()
      : "";
    if (productId && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(productId)) {
      return { error: "productId must be a valid product ID" };
    }
    update.productId = productId || null;
  }
  if (Object.hasOwn(value, "active")) {
    if (typeof value.active !== "boolean") return { error: "active must be a boolean" };
    update.active = value.active;
  }
  return { update };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function errorResponse(error, fallback = "Media request failed") {
  console.error(fallback, { code: error?.code || "media_request_failed" });
  return fail(fallback, 400, { code: error?.code || "media_request_failed" });
}

export async function handleOperatorMediaCollection(request, env, {
  list = listMedia,
  products = getProducts,
} = {}) {
  const unauthorized = await authorize(request, env);
  if (unauthorized) return unauthorized;
  if (request.method !== "GET") return fail("Method Not Allowed", 405);
  try {
    const [media, productRecords] = await Promise.all([
      list(env, {}),
      products(env),
    ]);
    const productOptions = productRecords.map(toProductIdentity);
    const productsById = new Map(productOptions.map((product) => [product.id, product]));
    return ok({ media: media.map((item) => toOperatorMedia(item, productsById)), products: productOptions });
  } catch (error) {
    return errorResponse(error, "Media lookup failed");
  }
}

export async function handleOperatorMediaById(request, env, mediaId, {
  get = getMedia,
  update = updateMedia,
  getProduct = getProductById,
} = {}) {
  const unauthorized = await authorize(request, env);
  if (unauthorized) return unauthorized;
  if (request.method !== "PATCH") return fail("Method Not Allowed", 405);

  const parsed = parsePatch(await readJson(request));
  if (parsed.error) return fail(parsed.error, 400, { code: "invalid_media_update" });

  try {
    const existing = await get(env, mediaId);
    if (!existing) {
      return fail("Media not found", 404, { code: "media_not_found" });
    }
    const mediaWorkspaceId = resolveMediaWorkspaceId(existing.workspaceId);
    let resolvedLinkedProduct = null;
    if (Object.hasOwn(parsed.update, "productId")) {
      if (existing.sourceType !== "product") {
        return fail("Only Product Media can update productId", 400, { code: "media_product_link_invalid" });
      }
      if (parsed.update.productId) {
        resolvedLinkedProduct = await getProduct(
          env,
          parsed.update.productId,
          mediaWorkspaceId
        );
        if (!resolvedLinkedProduct) {
          return fail("Product not found", 404, { code: "product_not_found" });
        }
      }
    }
    const updated = await update(
      env,
      mediaId,
      parsed.update,
      mediaWorkspaceId
    );
    const productsById = resolvedLinkedProduct
      ? new Map([[resolvedLinkedProduct.id, toProductIdentity(resolvedLinkedProduct)]])
      : new Map();
    return ok({ media: toOperatorMedia(updated, productsById) });
  } catch (error) {
    if (error?.code === "media_not_found") {
      return fail("Media not found", 404, { code: "media_not_found" });
    }
    return errorResponse(error, "Media update failed");
  }
}
