import { getJson, putJson } from "./kv.js";
import { getActiveProducts, buildProductContext } from "./products.js";
import { buildThreadContext } from "./thread-context.js";
import { generateDistinctThreadPost } from "./post-regenerator.js";
import { validateAutoPostText, validateAutoPostPolicy } from "./auto-post-validator.js";
import { getRecentPostLogs } from "./logger.js";

const STORE_KEY = "product_review_candidates";
const MAX_CANDIDATES = 50;
const SEOUL_TIME_ZONE = "Asia/Seoul";

export const MANUAL_PRODUCT_TEST_SOURCE = "manual_product_test";

export class ProductReviewError extends Error {
  constructor(message, code = "product_review_failed", details = null) {
    super(message);
    this.name = "ProductReviewError";
    this.code = code;
    this.details = details;
  }
}

function text(value) {
  return String(value ?? "").trim();
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function readStore(env) {
  const stored = await getJson(env, STORE_KEY);
  return {
    version: Number(stored?.version || 1),
    candidates: Array.isArray(stored?.candidates) ? stored.candidates : [],
  };
}

async function writeStore(env, candidates) {
  const value = {
    version: 1,
    updatedAt: new Date().toISOString(),
    candidates: candidates.slice(0, MAX_CANDIDATES),
  };
  await putJson(env, STORE_KEY, value);
  return value;
}

export function isProductReviewEligible(product) {
  return Boolean(
    product?.active === true &&
    text(product.name) &&
    product.linkEnabled === true &&
    text(product.affiliateLink) &&
    text(product.affiliateDisclosure) &&
    (text(product.description) || text(product.selectionReason) || text(product.experience))
  );
}

function selectProduct(products, candidates, requestedProductId) {
  const eligible = products.filter(isProductReviewEligible);
  if (requestedProductId) {
    const selected = eligible.find((product) => product.id === requestedProductId);
    if (!selected) {
      throw new ProductReviewError(
        "The selected product is not eligible for a product review candidate.",
        "product_review_product_unavailable",
        { productId: requestedProductId }
      );
    }
    return selected;
  }
  if (!eligible.length) {
    throw new ProductReviewError(
      "No active product has the required product details, disclosure, and affiliate link.",
      "product_review_inventory_empty"
    );
  }
  const latestByProduct = new Map();
  for (const candidate of candidates) {
    if (!latestByProduct.has(candidate.productId)) {
      latestByProduct.set(candidate.productId, candidate.createdAt || "");
    }
  }
  return [...eligible].sort((left, right) =>
    String(latestByProduct.get(left.id) || "").localeCompare(
      String(latestByProduct.get(right.id) || "")
    )
  )[0];
}

function removeExactValue(value, target) {
  return text(value).split(target).join("").trim();
}

function removeUrls(value) {
  return text(value).replace(/https?:\/\/\S+/gi, "").replace(/[ \t]+\n/g, "\n").trim();
}

export function buildProductReviewPayload(generatedPost, product) {
  if (!isProductReviewEligible(product)) {
    throw new ProductReviewError(
      "Product data does not satisfy review candidate requirements.",
      "product_review_product_unavailable"
    );
  }
  const disclosure = text(product.affiliateDisclosure);
  let body = removeUrls(
    removeExactValue(generatedPost?.body ?? generatedPost?.text, product.affiliateLink)
  );
  if (!body) {
    throw new ProductReviewError("Generated product text is empty.", "product_review_text_empty");
  }
  if (!body.includes(disclosure)) body = `${body}\n\n${disclosure}`.trim();
  const validation = validateAutoPostText(body);
  return {
    text: validation.text,
    postType: text(generatedPost?.postType),
    contentType: "제품 연결형",
    topic: text(generatedPost?.topic) || text(product.name),
    emotion: text(generatedPost?.emotion),
    hookStyle: text(generatedPost?.hookStyle),
    endingStyle: text(generatedPost?.endingStyle),
    questionUsed: Boolean(generatedPost?.questionUsed),
    productId: product.id,
    productConnected: true,
    affiliateLinkUsed: true,
    affiliateDisclosureRequired: true,
    firstComment: `${text(product.name)}\n${text(product.affiliateLink)}`,
  };
}

export async function generateProductReviewCandidate(
  env,
  { productId = null, source = "cron_product_review", cron = null, scheduledTime = null } = {}
) {
  const [products, store, context] = await Promise.all([
    getActiveProducts(env),
    readStore(env),
    buildThreadContext(env),
  ]);
  const product = selectProduct(products, store.candidates, text(productId) || null);
  context.products = buildProductContext([product]);
  context.publishing.productConnectedAvailable = true;
  context.publishing.affiliateLinkAvailable = true;
  context.publishing.linkAvailable = true;
  context.publishing.goal = [
    `Create one product-connected review candidate for product ID ${product.id}.`,
    "Use only facts and experience supplied in products data.",
    "Set productConnected, affiliateLinkUsed, and affiliateDisclosureRequired to true.",
    "Put the affiliate disclosure in the body and the affiliate link only in firstComment.",
    "Keep the complete body including disclosure within 500 characters.",
  ].join(" ");
  context.publishing.requestedTone =
    "A realistic Korean office worker in their 40s describing a natural moment of need.";

  const generation = await generateDistinctThreadPost(env, context, {
    threshold: 0.62,
    maxRecentPosts: 20,
    maxAttempts: 2,
  });
  const payload = buildProductReviewPayload(generation.generatedPost, product);
  validateAutoPostPolicy(payload, context);
  const now = new Date().toISOString();
  const candidate = {
    id: createId(),
    source,
    status: "pending_review",
    productId: product.id,
    productName: product.name,
    productSnapshot: {
      id: product.id,
      name: product.name,
      affiliateLink: product.affiliateLink,
      affiliateDisclosure: product.affiliateDisclosure,
    },
    ...payload,
    cron,
    scheduledTime,
    generation: {
      attempts: generation.attempts,
      regenerated: generation.regenerated,
      highestSimilarity: generation.similarity?.highestScore ?? null,
    },
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    postId: null,
  };
  await writeStore(env, [candidate, ...store.candidates]);
  return candidate;
}

export async function listProductReviewCandidates(env, limit = 30) {
  const store = await readStore(env);
  return store.candidates.slice(0, Math.max(1, Math.min(Number(limit || 30), MAX_CANDIDATES)));
}

export async function getProductReviewCandidate(env, candidateId) {
  const id = text(candidateId);
  if (!id) return null;
  return (await readStore(env)).candidates.find((candidate) => candidate.id === id) || null;
}

export function prepareProductReviewPublishInput(candidate, input = {}) {
  if (!candidate || candidate.status !== "pending_review") {
    throw new ProductReviewError(
      "The product review candidate is not available for publishing.",
      "product_review_candidate_unavailable"
    );
  }
  const snapshot = candidate.productSnapshot || {};
  const product = {
    active: true,
    linkEnabled: true,
    id: candidate.productId,
    name: snapshot.name,
    description: candidate.topic || "product review",
    affiliateLink: snapshot.affiliateLink,
    affiliateDisclosure: snapshot.affiliateDisclosure,
  };
  const payload = buildProductReviewPayload({
    ...candidate,
    body: input.text === undefined ? candidate.text : input.text,
  }, product);
  return {
    ...payload,
    postType: text(input.postType ?? candidate.postType),
    topic: text(input.topic ?? candidate.topic),
    emotion: text(input.emotion ?? candidate.emotion),
    hookStyle: text(input.hookStyle ?? candidate.hookStyle),
    endingStyle: text(input.endingStyle ?? candidate.endingStyle),
    questionUsed: Boolean(input.questionUsed ?? candidate.questionUsed),
    source: MANUAL_PRODUCT_TEST_SOURCE,
    candidateId: candidate.id,
  };
}

export async function markProductReviewPublished(env, candidateId, postId) {
  const store = await readStore(env);
  const index = store.candidates.findIndex((candidate) => candidate.id === candidateId);
  if (index < 0) return null;
  const now = new Date().toISOString();
  const candidate = {
    ...store.candidates[index],
    status: "published",
    postId,
    publishedAt: now,
    updatedAt: now,
  };
  const candidates = [...store.candidates];
  candidates[index] = candidate;
  await writeStore(env, candidates);
  return candidate;
}

function seoulDateKey(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export async function assertManualProductPublishAvailable(env) {
  const today = seoulDateKey(new Date());
  const logs = await getRecentPostLogs(env, 100);
  const count = logs.filter((log) =>
    log?.status === "published" &&
    log?.metadata?.source === MANUAL_PRODUCT_TEST_SOURCE &&
    log?.created_at &&
    seoulDateKey(log.created_at) === today
  ).length;
  if (count >= 1) {
    throw new ProductReviewError(
      "Today's manual product test post has already been published.",
      "manual_product_daily_limit_reached"
    );
  }
  return { allowed: true, count, remaining: 1 - count, date: today };
}
