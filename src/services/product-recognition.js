import { requestOpenAiJson } from "./ai.js";
import { getMedia } from "./media.js";
import { getMediaObject } from "./media-storage.js";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    category: { type: "string" },
    description: { type: "string" },
  },
  required: ["name", "category", "description"],
};

function text(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function normalizeRecognizedProduct(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Product recognition result is invalid");
  const product = { name: text(value.name, 120), category: text(value.category, 80), description: text(value.description, 500) };
  if (!product.name || !product.category) throw new Error("Product recognition result is incomplete");
  return product;
}

export async function recognizeProductFromMedia(env, mediaId, { requestJson = requestOpenAiJson, get = getMedia, getObject = getMediaObject, workspaceId } = {}) {
  const media = await get(env, mediaId, workspaceId);
  if (!media || media.sourceType !== "product" || media.mediaKind !== "image") throw new Error("A product image is required");
  const object = await getObject(env, media.objectKey);
  if (!object || typeof object.arrayBuffer !== "function") throw new Error("Product image is unavailable");
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (!bytes.byteLength) throw new Error("Product image is empty");
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  const result = await requestJson(env, {
    instructions: "Identify only the visibly supported product. Return a concise Korean product name, product category, and description. Do not infer price, a purchase link, a brand when unclear, or facts not visible in the image.",
    input: [{ role: "user", content: [{ type: "input_text", text: "Recognize this product for an operator to review." }, { type: "input_image", image_url: `data:image/jpeg;base64,${btoa(binary)}` }] }],
    name: "operator_product_recognition",
    schema: SCHEMA,
  });
  return normalizeRecognizedProduct(result);
}
