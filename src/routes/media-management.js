import { requireAdminApiSession } from "../middleware/auth.js";
import { ok, fail } from "../utils/response.js";
import { listMedia, updateMedia, removeMedia } from "../services/media.js";
import { batchUploadMedia } from "../services/media-batch.js";
import {
  createContentPoolItem,
  getContentPoolItem,
  listContentPool,
  updateContentPoolItem,
  removeContentPoolItem,
  getAvailableContentPoolCandidates,
} from "../services/content-pool.js";
import { getWeeklyInventory } from "../services/weekly-inventory.js";

function booleanQuery(value) {
  if (value === null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("Boolean query value must be true or false");
}

async function authorize(request, env) {
  const auth = await requireAdminApiSession(request, env);
  return auth.ok ? null : auth.response;
}

function apiError(error, fallback) {
  console.error(error);
  return fail(error?.message || fallback, 400);
}

export async function handleMediaLibrary(request, env, url) {
  const unauthorized = await authorize(request, env);
  if (unauthorized) return unauthorized;
  try {
    if (request.method === "GET") {
      return ok({ media: await listMedia(env, {
        sourceType: url.searchParams.get("sourceType") || undefined,
        productId: url.searchParams.has("productId")
          ? url.searchParams.get("productId") : undefined,
        active: booleanQuery(url.searchParams.get("active")),
      }) });
    }
    const body = await request.json();
    if (request.method === "PATCH") {
      return ok({ media: await updateMedia(env, body.id, body) });
    }
    if (request.method === "DELETE") {
      return ok({ removed: await removeMedia(env, body.id) });
    }
    return fail("Method Not Allowed", 405);
  } catch (error) {
    return apiError(error, "Media Library API Error");
  }
}

export async function handleMediaBatchUpload(request, env) {
  const unauthorized = await authorize(request, env);
  if (unauthorized) return unauthorized;
  if (request.method !== "POST") return fail("Method Not Allowed", 405);
  try {
    const form = await request.formData();
    const manifest = form.get("manifest");
    const result = await batchUploadMedia(env, {
      files: form.getAll("files"),
      manifestText: manifest && typeof manifest.text === "function"
        ? await manifest.text() : String(manifest || ""),
      defaults: {
        sourceType: form.get("sourceType"),
        productId: form.get("productId"),
        altText: form.get("altText"),
        description: form.get("description"),
        tags: form.get("tags"),
        topics: form.get("topics"),
        allowedContentTypes: form.get("allowedContentTypes"),
        priority: form.get("priority"),
        maxUses: form.get("maxUses"),
        cooldownDays: form.get("cooldownDays"),
      },
      createPoolItems: form.get("createPoolItems") !== "false",
    });
    return ok(result);
  } catch (error) {
    return apiError(error, "Batch upload failed");
  }
}

export async function handleContentPool(request, env, url) {
  const unauthorized = await authorize(request, env);
  if (unauthorized) return unauthorized;
  try {
    if (request.method === "GET") {
      const id = url.searchParams.get("id");
      if (id) return ok({ item: await getContentPoolItem(env, id) });
      if (url.searchParams.get("available") === "true") {
        return ok({ items: await getAvailableContentPoolCandidates(env, {
          type: url.searchParams.get("type") || undefined,
          limit: Number(url.searchParams.get("limit") || 100),
        }) });
      }
      return ok({ items: await listContentPool(env, {
        type: url.searchParams.get("type") || undefined,
        active: booleanQuery(url.searchParams.get("active")),
      }) });
    }
    const body = await request.json();
    if (request.method === "POST") {
      return ok({ item: await createContentPoolItem(env, body) });
    }
    if (request.method === "PATCH") {
      return ok({ item: await updateContentPoolItem(env, body.id, body) });
    }
    if (request.method === "DELETE") {
      return ok({ removed: await removeContentPoolItem(env, body.id) });
    }
    return fail("Method Not Allowed", 405);
  } catch (error) {
    return apiError(error, "Content Pool API Error");
  }
}

export async function handleWeeklyInventory(request, env, url) {
  const unauthorized = await authorize(request, env);
  if (unauthorized) return unauthorized;
  if (request.method !== "GET") return fail("Method Not Allowed", 405);
  try {
    const expectedPostCount = Number(url.searchParams.get("expectedPostCount"));
    return ok({ inventory: await getWeeklyInventory(env, { expectedPostCount }) });
  } catch (error) {
    return apiError(error, "Weekly inventory lookup failed");
  }
}
