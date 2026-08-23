import {
  requestOpenAiJson,
} from "./ai.js";

const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 40;
const MAX_TOPICS = 6;
const MAX_TOPIC_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 300;
const MAX_SCENE_TYPE_LENGTH = 60;
const MAX_USABLE_ANGLES = 6;
const MAX_USABLE_ANGLE_LENGTH = 100;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    startTimeSeconds: { type: "number" },
    durationSeconds: { type: "number" },
    tags: { type: "array", maxItems: MAX_TAGS, items: { type: "string" } },
    topics: { type: "array", maxItems: MAX_TOPICS, items: { type: "string" } },
    description: { type: "string" },
    sceneType: { anyOf: [{ type: "string" }, { type: "null" }] },
    usableAngles: { type: "array", maxItems: MAX_USABLE_ANGLES, items: { type: "string" } },
  },
  required: ["startTimeSeconds", "durationSeconds", "tags", "topics", "description", "sceneType", "usableAngles"],
};

function text(value) {
  return String(value ?? "").trim();
}

function list(value, maxItems, maxLength) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).flatMap((item) => {
    const normalized = text(item).slice(0, maxLength);
    const key = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(key) || seen.size >= maxItems) return [];
    seen.add(key);
    return [normalized];
  });
}

function dataUrl(frame) {
  if (!(frame?.imageBytes instanceof Uint8Array) || !frame.imageBytes.byteLength) {
    throw new Error("Video frame bytes are required");
  }
  let binary = "";
  for (let offset = 0; offset < frame.imageBytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...frame.imageBytes.subarray(offset, offset + 0x8000));
  }
  return `data:${frame.contentType || "image/jpeg"};base64,${btoa(binary)}`;
}

export function normalizeVideoVisionMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Video Vision metadata must be an object");
  }
  const metadata = {
    startTimeSeconds: value.startTimeSeconds,
    durationSeconds: value.durationSeconds,
    tags: list(value.tags, MAX_TAGS, MAX_TAG_LENGTH),
    topics: list(value.topics, MAX_TOPICS, MAX_TOPIC_LENGTH),
    description: text(value.description).slice(0, MAX_DESCRIPTION_LENGTH),
    sceneType: text(value.sceneType).slice(0, MAX_SCENE_TYPE_LENGTH) || null,
    usableAngles: list(value.usableAngles, MAX_USABLE_ANGLES, MAX_USABLE_ANGLE_LENGTH),
  };
  if (!metadata.tags.length && !metadata.topics.length && !metadata.description) {
    throw new Error("Video Vision metadata contains no relevance metadata");
  }
  return metadata;
}

export function validateVideoClipTiming(value, sourceDurationSeconds) {
  const source = Number(sourceDurationSeconds);
  const start = Number(value?.startTimeSeconds);
  const requestedDuration = Number(value?.durationSeconds);
  if (!Number.isFinite(source) || source < 2 || !Number.isFinite(start) || !Number.isFinite(requestedDuration) || start < 0 || requestedDuration <= 0) {
    throw new Error("Video clip timing is invalid");
  }
  const minimum = source >= 5 ? 5 : 2;
  const maximum = source >= 8 ? 8 : source;
  const durationSeconds = Math.min(Math.max(requestedDuration, minimum), maximum);
  const startTimeSeconds = Math.min(start, Math.max(0, source - durationSeconds));
  return { startTimeSeconds, durationSeconds };
}

export async function analyzeVideoFrames(env, frames, { requestJson = requestOpenAiJson } = {}) {
  if (!Array.isArray(frames) || frames.length < 3) {
    throw new Error("At least three video frames are required for analysis");
  }
  const content = [{
    type: "input_text",
    text: "Analyze these timestamped video frames. Select a short 5-8 second clip that is visually clear and useful with a Threads post. Prefer visible motion, interaction, product use, scenery change, or understandable action. Avoid static, blurry, transitional, or unsupported claims. Generate concise Korean metadata grounded only in the frames.",
  }];
  for (const frame of frames) {
    content.push({ type: "input_text", text: `Frame timestamp: ${frame.timestampSeconds}s` });
    content.push({ type: "input_image", image_url: dataUrl(frame) });
  }
  return normalizeVideoVisionMetadata(await requestJson(env, {
    instructions: "Return only the requested JSON. Do not infer events, people, brands, or text that are not visibly supported by the frames.",
    input: [{ role: "user", content }],
    name: "media_video_clip_selection",
    schema: SCHEMA,
  }));
}
