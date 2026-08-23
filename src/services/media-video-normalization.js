import {
  getMediaObject,
  putMediaObject,
} from "./media-storage.js";
import {
  getContainer,
} from "@cloudflare/containers";

const VIDEO_CONTENT_TYPE = "video/mp4";
const NORMALIZER_INSTANCE_NAME = "video-orientation-normalizer";
const ALLOWED_ROTATIONS = new Set([90, 180, 270]);

export function createNormalizedVideoObjectKey(sourceObjectKey) {
  const source = String(sourceObjectKey || "");
  if (!source.endsWith("-source.mp4")) {
    throw new Error("Temporary source video object key is invalid");
  }
  return `${source.slice(0, -"-source.mp4".length)}-normalized.mp4`;
}

export async function normalizeVideoOrientation(
  env,
  { sourceObjectKey, normalizedObjectKey, rotationDegrees }
) {
  if (!ALLOWED_ROTATIONS.has(rotationDegrees)) {
    throw new Error("Video rotation is invalid");
  }
  if (!env?.VIDEO_NORMALIZER) {
    throw new Error("Video normalizer binding is unavailable");
  }
  const source = await getMediaObject(env, sourceObjectKey);
  if (!source?.body) throw new Error("Temporary source video could not be read for normalization");
  const container = getContainer(env.VIDEO_NORMALIZER, NORMALIZER_INSTANCE_NAME);
  const normalizedBody = await container.normalizeVideo(source.body, rotationDegrees);
  if (!normalizedBody || typeof normalizedBody.getReader !== "function") {
    throw new Error("Video normalizer did not return a stream");
  }
  await putMediaObject(env, normalizedObjectKey, normalizedBody, {
    httpMetadata: { contentType: VIDEO_CONTENT_TYPE },
  });
}
