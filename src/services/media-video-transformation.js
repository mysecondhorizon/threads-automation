import {
  getMediaObject,
} from "./media-storage.js";

const FRAME_POSITIONS = [0.15, 0.29, 0.43, 0.57, 0.71, 0.85];

function requireMediaBinding(media) {
  if (!media || typeof media.input !== "function") {
    throw new Error("Cloudflare Media binding is unavailable");
  }
}

function seconds(value) {
  return `${Number(value.toFixed(3))}s`;
}

export function createVideoFrameTimestamps(durationSeconds) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Video duration is invalid");
  }
  const values = new Set();
  for (const position of FRAME_POSITIONS) {
    const timestamp = Math.min(
      Math.max(0, durationSeconds * position),
      Math.max(0, durationSeconds - 0.001)
    );
    values.add(Number(timestamp.toFixed(3)));
  }
  const timestamps = [...values].sort((left, right) => left - right);
  if (timestamps.length < 3) {
    throw new Error("Video is too short to extract enough distinct frames");
  }
  return timestamps;
}

export async function extractVideoFrames(env, objectKey, timestamps) {
  requireMediaBinding(env.MEDIA);
  const frames = [];
  for (const timestampSeconds of timestamps) {
    const original = await getMediaObject(env, objectKey);
    if (!original?.body) throw new Error("Temporary video could not be read for frame extraction");
    const result = env.MEDIA.input(original.body)
      .transform({ width: 640, fit: "scale-down" })
      .output({ mode: "frame", time: seconds(timestampSeconds), format: "jpg" });
    const [response, contentType] = await Promise.all([
      result.response(),
      result.contentType(),
    ]);
    if (!response?.ok) throw new Error("Video frame extraction failed");
    if (contentType !== "image/jpeg") {
      throw new Error("Video frame transformation did not return a JPEG");
    }
    const imageBytes = new Uint8Array(await response.arrayBuffer());
    if (!imageBytes.byteLength) throw new Error("Video frame extraction returned an empty image");
    frames.push({
      timestampSeconds,
      imageBytes,
      contentType,
    });
  }
  return frames;
}

export async function transformVideoClip(
  env,
  objectKey,
  { startTimeSeconds, durationSeconds }
) {
  requireMediaBinding(env.MEDIA);
  const original = await getMediaObject(env, objectKey);
  if (!original?.body) throw new Error("Temporary video could not be read for final transform");
  const result = env.MEDIA.input(original.body)
    .transform({ width: 1080, height: 1920, fit: "scale-down" })
    .output({
      mode: "video",
      time: seconds(startTimeSeconds),
      duration: seconds(durationSeconds),
      audio: true,
    });
  const [body, contentType] = await Promise.all([
    result.media(),
    result.contentType(),
  ]);
  if (!body || contentType !== "video/mp4") {
    throw new Error("Video transformation did not return an MP4");
  }
  return { body, contentType };
}
