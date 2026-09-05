import { requireAdminApiSession } from "../middleware/auth.js";
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

export async function handleOperatorMediaUpload(request, env, { batchUpload = runBatchUpload } = {}) {
  const auth = await requireAdminApiSession(request, env, { allowSelectedWorkspace: true });
  if (!auth.ok) return auth.response;
  if (request.method !== "POST") return fail("Method Not Allowed", 405);
  try {
    const form = await request.formData();
    const files = form.getAll("files");
    if (!files.length) return fail("Upload at least one file", 400, { code: "media_files_required" });
    const experienceTags = String(form.get("experienceTags") || "");
    const experienceNote = String(form.get("experienceNote") || "");
    const result = await batchUpload(env, {
      files,
      defaults: {
        sourceType: "general",
        experienceTags,
        experienceNote,
      },
      createPoolItems: true,
    }, auth.workspaceId);
    return ok({ results: (Array.isArray(result?.results) ? result.results : []).map(toOperatorResult) });
  } catch (error) {
    console.error("Operator media upload failed", { code: error?.code || "media_upload_failed" });
    return fail("Media upload failed", 400, { code: error?.code || "media_upload_failed" });
  }
}
