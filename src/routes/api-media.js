import { requireAdminApiSession } from "../middleware/auth.js";
import { getMedia, listMedia, updateMedia } from "../services/media.js";
import { fail, ok } from "../utils/response.js";

function toOperatorMedia(media) {
  return {
    id: media.id,
    kind: media.mediaKind === "video" ? "video" : "image",
    sourceType: media.sourceType === "product" ? "product" : "general",
    description: media.description || "",
    tags: Array.isArray(media.tags) ? [...media.tags] : [],
    experienceTags: Array.isArray(media.experienceTags) ? [...media.experienceTags] : [],
    experienceNote: media.experienceNote || "",
    active: media.active === true,
    createdAt: media.createdAt,
    updatedAt: media.updatedAt,
    previewUrl: `/media/${encodeURIComponent(media.id)}`,
  };
}

async function authorize(request, env) {
  return requireAdminApiSession(request, env, { allowSelectedWorkspace: true });
}

function parsePatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Media update must be an object" };
  }
  const allowed = new Set(["description", "tags", "experienceTags", "experienceNote", "active"]);
  if (!Object.keys(value).length || Object.keys(value).some((key) => !allowed.has(key))) {
    return { error: "Only description, tags, experienceTags, experienceNote, and active can be updated" };
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
} = {}) {
  const authorization = await authorize(request, env);
  if (!authorization.ok) return authorization.response;
  if (request.method !== "GET") return fail("Method Not Allowed", 405);
  try {
    const media = await list(env, { sourceType: "general" }, authorization.workspaceId);
    return ok({ media: media.map(toOperatorMedia) });
  } catch (error) {
    return errorResponse(error, "Media lookup failed");
  }
}

export async function handleOperatorMediaById(request, env, mediaId, {
  get = getMedia,
  update = updateMedia,
} = {}) {
  const authorization = await authorize(request, env);
  if (!authorization.ok) return authorization.response;
  if (request.method !== "PATCH") return fail("Method Not Allowed", 405);

  const parsed = parsePatch(await readJson(request));
  if (parsed.error) return fail(parsed.error, 400, { code: "invalid_media_update" });

  try {
    const existing = await get(env, mediaId, authorization.workspaceId);
    if (!existing) {
      return fail("Media not found", 404, { code: "media_not_found" });
    }
    return ok({ media: toOperatorMedia(await update(env, mediaId, parsed.update, authorization.workspaceId)) });
  } catch (error) {
    if (error?.code === "media_not_found") {
      return fail("Media not found", 404, { code: "media_not_found" });
    }
    return errorResponse(error, "Media update failed");
  }
}
