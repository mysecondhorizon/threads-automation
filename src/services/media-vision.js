import {
  requestOpenAiJson,
} from "./ai.js";

const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 40;
const MAX_TOPICS = 6;
const MAX_TOPIC_LENGTH = 80;
const MAX_ALT_TEXT_LENGTH = 180;
const MAX_DESCRIPTION_LENGTH = 300;
const MAX_SCENE_TYPE_LENGTH = 60;
const MAX_USABLE_ANGLES = 6;
const MAX_USABLE_ANGLE_LENGTH = 100;

const GENERIC_TAGS = new Set([
  "image",
  "photo",
  "picture",
  "사진",
  "이미지",
  "일상",
  "생활",
]);

const MEDIA_VISION_INSTRUCTIONS = [
  "Analyze the image only to create metadata for selecting a relevant image for a future Threads post.",
  "Use only details visibly supported by the image. Do not infer a location, brand, person, event, experience, or situation without clear visual evidence.",
  "Do not invent OCR text. Do not create news, politics, trends, or current-topic claims from the image.",
  "Use concrete nouns and situations for tags. Avoid generic tags such as image, photo, picture, daily life, or lifestyle.",
  "Only create topics and usableAngles that naturally connect to the visible image. Do not invent personal experiences, brands, or events.",
  "Write tags, topics, altText, description, sceneType, and usableAngles primarily in natural Korean so they match Korean Threads text. Prefer natural Korean names for visibly supported Korean foods and situations. Keep an established brand, product, service, or proper name in its original or commonly used Korean form. Do not translate or infer the meaning of uncertain English text in the image.",
  "For peoplePresent, textPresent, and brandVisible, use true only when the element is clearly visible and identifiable. Use false only when the element is clearly absent. Otherwise use null, including partial or blurry people, unreadable text-like areas, and bottles, packages, or signs whose brand cannot be identified. A bottle alone is not brandVisible=true, table traces are not peoplePresent=true, and text-like shapes are not textPresent=true.",
  "Keep every value comfortably below its limit: tags under 40 characters, topics under 80, altText under 180, description under 300, sceneType under 60, and each usableAngle under 100. Be concise and use complete phrases or sentences; never fill the limit or end in the middle of a word, phrase, or sentence.",
].join("\n");

const MEDIA_VISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    tags: {
      type: "array",
      minItems: 0,
      maxItems: MAX_TAGS,
      items: { type: "string" },
    },
    topics: {
      type: "array",
      minItems: 0,
      maxItems: MAX_TOPICS,
      items: { type: "string" },
    },
    altText: { type: "string" },
    description: { type: "string" },
    sceneType: {
      anyOf: [
        { type: "string" },
        { type: "null" },
      ],
    },
    usableAngles: {
      type: "array",
      minItems: 0,
      maxItems: MAX_USABLE_ANGLES,
      items: { type: "string" },
    },
    peoplePresent: { anyOf: [{ type: "boolean" }, { type: "null" }] },
    textPresent: { anyOf: [{ type: "boolean" }, { type: "null" }] },
    brandVisible: { anyOf: [{ type: "boolean" }, { type: "null" }] },
  },
  required: [
    "tags",
    "topics",
    "altText",
    "description",
    "sceneType",
    "usableAngles",
    "peoplePresent",
    "textPresent",
    "brandVisible",
  ],
};

function text(value) {
  return String(value ?? "").trim();
}

function normalizeList(value, { maxItems, maxLength, filter = null }) {
  const values = Array.isArray(value) ? value : [];
  const normalized = [];
  const seen = new Set();

  for (const item of values) {
    const valueText = text(item).slice(0, maxLength);
    const key = valueText.toLocaleLowerCase();
    if (!valueText || seen.has(key) || (filter && !filter(valueText, key))) continue;
    seen.add(key);
    normalized.push(valueText);
    if (normalized.length >= maxItems) break;
  }

  return normalized;
}

function normalizeNullableText(value, maxLength) {
  const normalized = text(value).slice(0, maxLength);
  return normalized || null;
}

function normalizeNullableBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

export function hasMediaRelevanceMetadata(value) {
  return Boolean(
    (Array.isArray(value?.tags) && value.tags.length) ||
    (Array.isArray(value?.topics) && value.topics.length) ||
    text(value?.altText) ||
    text(value?.description)
  );
}

export function optimizedJpegDataUrl(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength) {
    throw new Error("Optimized JPEG bytes are required");
  }

  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

export function normalizeMediaVisionMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Vision metadata must be an object");
  }

  return {
    tags: normalizeList(value.tags, {
      maxItems: MAX_TAGS,
      maxLength: MAX_TAG_LENGTH,
      filter: (_item, key) => !GENERIC_TAGS.has(key),
    }),
    topics: normalizeList(value.topics, {
      maxItems: MAX_TOPICS,
      maxLength: MAX_TOPIC_LENGTH,
    }),
    altText: text(value.altText).slice(0, MAX_ALT_TEXT_LENGTH),
    description: text(value.description).slice(0, MAX_DESCRIPTION_LENGTH),
    sceneType: normalizeNullableText(value.sceneType, MAX_SCENE_TYPE_LENGTH),
    usableAngles: normalizeList(value.usableAngles, {
      maxItems: MAX_USABLE_ANGLES,
      maxLength: MAX_USABLE_ANGLE_LENGTH,
    }),
    peoplePresent: normalizeNullableBoolean(value.peoplePresent),
    textPresent: normalizeNullableBoolean(value.textPresent),
    brandVisible: normalizeNullableBoolean(value.brandVisible),
  };
}

export async function analyzeMediaImage(
  env,
  optimizedJpegBytes,
  {
    requestJson = requestOpenAiJson,
    manualMetadata = null,
  } = {}
) {
  const imageUrl = optimizedJpegDataUrl(optimizedJpegBytes);
  const result = await requestJson(env, {
    instructions: MEDIA_VISION_INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Create the requested media metadata for this image.",
          },
          {
            type: "input_image",
            image_url: imageUrl,
          },
        ],
      },
    ],
    name: "media_vision_metadata",
    schema: MEDIA_VISION_SCHEMA,
  });

  const metadata =
    normalizeMediaVisionMetadata(result);
  if (
    !hasMediaRelevanceMetadata(metadata) &&
    !hasMediaRelevanceMetadata(manualMetadata)
  ) {
    throw new Error(
      "Vision metadata contains no relevance metadata"
    );
  }

  return metadata;
}
