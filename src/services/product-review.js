import { getJson, putJson } from "./kv.js";
import { getActiveProducts, buildProductContext, isValidOperatorProductLink } from "./products.js";
import { buildThreadContext } from "./thread-context.js";
import {
  generateDistinctThreadPost,
  SAFE_FORMAT_DIVERSITY_OPTIONS,
} from "./post-regenerator.js";
import { validateAutoPostText, validateAutoPostPolicy } from "./auto-post-validator.js";
import { getRecentPostLogs } from "./logger.js";
import { analyzePostFormat, stripAffiliateDisclosure } from "./post-format.js";

const STORE_KEY = "product_review_candidates";
const MAX_CANDIDATES = 50;
const SEOUL_TIME_ZONE = "Asia/Seoul";

export const MANUAL_PRODUCT_TEST_SOURCE = "manual_product_test";
export const PRODUCT_REVIEW_TOPIC_TAG = "광고";

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
    isValidOperatorProductLink(product.affiliateLink) &&
    text(product.affiliateDisclosure) &&
    (text(product.description) || text(product.selectionReason) || text(product.experience))
  );
}

export function selectProductForReview(products, candidates, requestedProductId) {
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
  const normalizedTarget = text(target);
  return normalizedTarget
    ? text(value).split(normalizedTarget).join("").trim()
    : text(value);
}

function removeUrls(value) {
  return text(value)
    .replace(
      /https?:\/\/\S+|www\.\S+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/giu,
      ""
    )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n")
    .trim();
}

function removeUnexpectedAffiliateDisclosure(value) {
  return text(value)
    .replace(
      /(?:이|본)\s*포스팅은[^\n]*쿠팡\s*파트너스[^\n]*(?:수수료|제공받)[^\n]*/gu,
      ""
    )
    .replace(
      /쿠팡\s*파트너스[^\n]*(?:수수료|경제적\s*이해관계|제공받)[^\n]*/gu,
      ""
    );
}

function buildProductReviewAiContext(product) {
  const context = buildProductContext([product]);
  return {
    ...context,
    availableProducts: context.availableProducts.map((item) => ({
      ...item,
      linkEnabled: false,
    })),
    productDetails: context.productDetails.map((item) => ({
      ...item,
      affiliateLink: "",
      affiliateDisclosure: "",
      linkEnabled: false,
    })),
  };
}

function sanitizeProductReviewBody(value, product) {
  return removeUrls(
    removeUnexpectedAffiliateDisclosure(
      removeExactValue(
        stripAffiliateDisclosure(value, [product.affiliateDisclosure]),
        product.affiliateLink
      )
    )
  );
}

function buildServerManagedFirstComment(product) {
  return `${text(product.affiliateLink)}\n\n${text(product.affiliateDisclosure)}`;
}

export function buildProductReviewPayload(generatedPost, product) {
  if (!isProductReviewEligible(product)) {
    throw new ProductReviewError(
      "Product data does not satisfy review candidate requirements.",
      "product_review_product_unavailable"
    );
  }
  const body = sanitizeProductReviewBody(
    generatedPost?.body ?? generatedPost?.text,
    product
  );
  if (!body) {
    throw new ProductReviewError("Generated product text is empty.", "product_review_text_empty");
  }
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
    firstComment: buildServerManagedFirstComment(product),
    firstCommentTopicTag: PRODUCT_REVIEW_TOPIC_TAG,
  };
}

export async function generateProductReviewCandidate(
  env,
  {
    productId = null,
    source = "cron_product_review",
    cron = null,
    scheduledTime = null,
    generatePost = null,
  } = {}
) {
  const [products, store, context] = await Promise.all([
    getActiveProducts(env),
    readStore(env),
    buildThreadContext(env),
  ]);
  const product = selectProductForReview(products, store.candidates, text(productId) || null);
  context.products = buildProductReviewAiContext(product);
  context.publishing.productConnectedAvailable = true;
  context.publishing.affiliateLinkAvailable = true;
  context.publishing.linkAvailable = true;
  context.publishing.serverManagedAffiliateComment = true;
  context.publishing.firstCommentTopicTag = PRODUCT_REVIEW_TOPIC_TAG;
  context.publishing.goal = [
    `Create one product-connected review candidate for product ID ${product.id}.`,
    "Use only facts and experience supplied in products data.",
    "Set productConnected, affiliateLinkUsed, and affiliateDisclosureRequired to true.",
    "Write only the product experience in text. Do not write an affiliate disclosure, URL, or affiliate link.",
    "Return firstComment as an empty string because the server will build it from stored product data.",
    "Keep the product experience body within 500 characters.",
  ].join(" ");
  context.publishing.requestedTone =
    "A realistic Korean office worker in their mid-to-late 30s describing a natural moment of need without sounding like a reviewer or trend-chaser.";

  const generationOptions = {
    threshold: 0.62,
    maxRecentPosts: 20,
    maxAttempts: 2,
    ...SAFE_FORMAT_DIVERSITY_OPTIONS,
  };
  if (typeof generatePost === "function") generationOptions.generatePost = generatePost;
  const generation = await generateDistinctThreadPost(env, context, generationOptions);
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
      formatSignature: analyzePostFormat(payload.text).signature,
      targetFormatId: generation.targetFormat?.id || null,
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
  return store.candidates
    .slice(0, Math.max(1, Math.min(Number(limit || 30), MAX_CANDIDATES)))
    .map(normalizeStoredProductReviewCandidate);
}

export async function getProductReviewCandidate(env, candidateId) {
  const id = text(candidateId);
  if (!id) return null;
  const candidate = (await readStore(env)).candidates.find((item) => item.id === id) || null;
  return candidate ? normalizeStoredProductReviewCandidate(candidate) : null;
}

export async function removeProductReviewCandidate(env, candidateId) {
  const id = text(candidateId);
  if (!id) {
    throw new ProductReviewError(
      "A product review candidate ID is required.",
      "product_review_candidate_id_required"
    );
  }

  const store = await readStore(env);
  const candidate = store.candidates.find((item) => item.id === id) || null;
  if (!candidate) {
    throw new ProductReviewError(
      "The product review candidate was not found.",
      "product_review_candidate_not_found",
      { candidateId: id }
    );
  }
  if (candidate.status !== "pending_review") {
    throw new ProductReviewError(
      "Published product review candidates cannot be removed.",
      "product_review_candidate_remove_forbidden",
      { candidateId: id, status: candidate.status }
    );
  }

  await writeStore(
    env,
    store.candidates.filter((item) => item.id !== id)
  );
  return normalizeStoredProductReviewCandidate(candidate);
}

export async function removePendingProductReviewCandidates(env) {
  const store = await readStore(env);
  const removed = store.candidates.filter(
    (candidate) => candidate.status === "pending_review"
  );
  if (!removed.length) {
    return { removedCount: 0 };
  }

  await writeStore(
    env,
    store.candidates.filter(
      (candidate) => candidate.status !== "pending_review"
    )
  );
  return { removedCount: removed.length };
}

function buildCandidateSnapshotProduct(candidate) {
  const snapshot = candidate?.productSnapshot || {};
  return {
    active: true,
    linkEnabled: true,
    id: candidate?.productId,
    name: snapshot.name,
    description: candidate?.topic || "product review",
    affiliateLink: snapshot.affiliateLink,
    affiliateDisclosure: snapshot.affiliateDisclosure,
  };
}

function normalizeStoredProductReviewCandidate(candidate) {
  try {
    return {
      ...candidate,
      ...buildProductReviewPayload(
        {
          ...candidate,
          body: candidate.text,
        },
        buildCandidateSnapshotProduct(candidate)
      ),
    };
  } catch {
    return candidate;
  }
}

export function prepareProductReviewPublishInput(candidate, input = {}) {
  if (!candidate || candidate.status !== "pending_review") {
    throw new ProductReviewError(
      "The product review candidate is not available for publishing.",
      "product_review_candidate_unavailable"
    );
  }
  const product = buildCandidateSnapshotProduct(candidate);
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

export async function markProductReviewPublished(
  env,
  candidateId,
  postId,
  firstCommentResult = null
) {
  const store = await readStore(env);
  const index = store.candidates.findIndex((candidate) => candidate.id === candidateId);
  if (index < 0) return null;
  const now = new Date().toISOString();
  const candidate = {
    ...store.candidates[index],
    status: "published",
    postId,
    firstCommentResult: firstCommentResult
      ? {
          published: Boolean(firstCommentResult.published),
          replyId: firstCommentResult.replyId || null,
          topicTag: firstCommentResult.topicTag || null,
          topicApplied:
            typeof firstCommentResult.topicApplied === "boolean"
              ? firstCommentResult.topicApplied
              : null,
          topicError: firstCommentResult.topicError || null,
          error: firstCommentResult.error || null,
        }
      : null,
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
