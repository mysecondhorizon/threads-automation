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
const MAX_DIAGNOSTIC_MESSAGE_LENGTH = 256;

function diagnosticMessage(error) {
  return String(error?.message || error)
    .replace(/\s+/gu, " ")
    .slice(0, MAX_DIAGNOSTIC_MESSAGE_LENGTH);
}

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
  let normalizedBody;
  try {
    normalizedBody = await container.normalizeVideo(source.body, rotationDegrees);
    console.log(
      `[video-normalize] RPC result body=${normalizedBody !== null && normalizedBody !== undefined} ` +
      `stream=${Boolean(normalizedBody && typeof normalizedBody.getReader === "function")}`
    );
  } catch (error) {
    console.error(`[video-normalize] RPC failed message=${diagnosticMessage(error)}`);
    throw error;
  }
  if (!normalizedBody || typeof normalizedBody.getReader !== "function") {
    console.error("[video-normalize] RPC returned no readable body");
    throw new Error("Video normalizer did not return a stream");
  }
  try {
    await putMediaObject(env, normalizedObjectKey, normalizedBody, {
      httpMetadata: { contentType: VIDEO_CONTENT_TYPE },
    });
    console.log(`[video-normalize] normalized temp R2 put succeeded key=${normalizedObjectKey}`);
  } catch (error) {
    console.error(`[video-normalize] normalized temp R2 put failed message=${diagnosticMessage(error)}`);
    throw error;
  }
}
