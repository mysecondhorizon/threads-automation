import assert from "node:assert/strict";

import {
  generateProductReviewCandidate,
  getProductReviewCandidate,
  listProductReviewCandidates,
  markProductReviewPublished,
  removePendingProductReviewCandidates,
  removeProductReviewCandidate,
} from "./product-review.js";

const CANDIDATES_KEY = "product_review_candidates";
const PRODUCTS_KEY = "content_products";

class MemoryKv {
  constructor(entries = {}) {
    this.values = new Map(
      Object.entries(entries).map(([key, value]) => [key, JSON.stringify(value)])
    );
  }

  async get(key, type) {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }

  async put(key, value) {
    this.values.set(key, value);
  }

  async list({ prefix = "" } = {}) {
    return {
      keys: [...this.values.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((name) => ({ name })),
    };
  }
}

function candidate(id, workspaceId, overrides = {}) {
  return {
    id,
    ...(workspaceId ? { workspaceId } : {}),
    status: "pending_review",
    productId: "product-a-one",
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}

function eligibleProduct(id, workspaceId) {
  return {
    id,
    workspaceId,
    name: id,
    description: "Useful product description",
    experience: "Used during a normal workday.",
    experienceStatus: "used",
    affiliateLink: `https://example.test/${id}`,
    affiliateDisclosure: "Affiliate disclosure.",
    linkEnabled: true,
    active: true,
  };
}

function createEnv({ candidates = [], products = [] } = {}) {
  const kv = new MemoryKv({
    [CANDIDATES_KEY]: { version: 1, candidates },
    [PRODUCTS_KEY]: { version: 1, products },
  });
  return { env: { THREADS_KV: kv }, kv };
}

async function rawCandidates(kv) {
  return (await kv.get(CANDIDATES_KEY, "json")).candidates;
}

function bodyForPattern(sentencePattern) {
  return sentencePattern
    .map((count, paragraphIndex) =>
      Array.from(
        { length: count },
        (_, sentenceIndex) => `Review ${paragraphIndex + 1}-${sentenceIndex + 1} is useful.`
      ).join(" ")
    )
    .join("\n\n");
}

function generatedProductPost(context) {
  return {
    body: bodyForPattern(context.publishing.targetFormat.selectedPattern.sentencePattern),
    postType: "story",
    contentType: "product review",
    topic: "product use",
    emotion: "calm",
    hookStyle: "situation",
    endingStyle: "reflection",
    questionUsed: false,
    productConnected: true,
    affiliateLinkUsed: true,
    affiliateDisclosureRequired: true,
    firstComment: "",
  };
}

const legacy = candidate("legacy-default");
const workspaceA = candidate("candidate-a", "workspace-a");
const workspaceB = candidate("candidate-b", "workspace-b");
const { env, kv } = createEnv({
  candidates: [legacy, workspaceA, workspaceB],
});

assert.deepEqual(
  (await listProductReviewCandidates(env)).map((item) => item.id),
  ["legacy-default"]
);
assert.deepEqual(
  (await listProductReviewCandidates(env, 30, "workspace-a")).map((item) => item.id),
  ["candidate-a"]
);
assert.equal(await getProductReviewCandidate(env, legacy.id, "workspace-a"), null);
assert.equal(await getProductReviewCandidate(env, workspaceA.id, "workspace-b"), null);

await assert.rejects(
  removeProductReviewCandidate(env, workspaceA.id, "workspace-b"),
  (error) => error?.code === "product_review_candidate_not_found"
);
assert.equal(
  await markProductReviewPublished(env, workspaceA.id, "post-1", null, "workspace-b"),
  null
);
assert.deepEqual(
  (await rawCandidates(kv)).find((item) => item.id === workspaceA.id),
  workspaceA
);

const cleaned = await removePendingProductReviewCandidates(env, "workspace-a");
assert.equal(cleaned.removedCount, 1);
assert.equal(await getProductReviewCandidate(env, workspaceA.id, "workspace-a"), null);
assert.deepEqual(
  (await rawCandidates(kv)).find((item) => item.id === workspaceB.id),
  workspaceB
);
assert.deepEqual(
  (await rawCandidates(kv)).find((item) => item.id === legacy.id),
  legacy
);

const markedLegacy = await markProductReviewPublished(env, legacy.id, "legacy-post");
assert.equal(markedLegacy.workspaceId, "default-workspace");
assert.equal(markedLegacy.status, "published");
assert.equal(
  (await rawCandidates(kv)).find((item) => item.id === legacy.id).workspaceId,
  "default-workspace"
);
assert.deepEqual(
  (await rawCandidates(kv)).find((item) => item.id === workspaceB.id),
  workspaceB
);

const historyProducts = [
  eligibleProduct("product-a-one", "workspace-a"),
  eligibleProduct("product-a-two", "workspace-a"),
];
const { env: historyEnv } = createEnv({
  products: historyProducts,
  candidates: [candidate("workspace-b-history", "workspace-b", {
    productId: "product-a-one",
    createdAt: "2099-01-01T00:00:00.000Z",
  })],
});
const historyCandidate = await generateProductReviewCandidate(
  historyEnv,
  {
    generatePost: async (_env, context) => generatedProductPost(context),
  },
  "workspace-a"
);
assert.equal(historyCandidate.workspaceId, "workspace-a");
assert.equal(
  historyCandidate.productId,
  "product-a-one",
  "foreign Workspace candidate history must not affect product selection"
);
assert.equal(
  await getProductReviewCandidate(historyEnv, historyCandidate.id, "workspace-b"),
  null
);

const cappedCandidates = Array.from(
  { length: 50 },
  (_, index) => candidate(`workspace-a-${index}`, "workspace-a", {
    productId: "product-capacity",
  })
);
const foreignCapacityCandidate = candidate("workspace-b-capacity", "workspace-b", {
  productId: "product-workspace-b",
});
const { env: capacityEnv, kv: capacityKv } = createEnv({
  products: [
    eligibleProduct("product-capacity", "workspace-a"),
    eligibleProduct("product-workspace-b", "workspace-b"),
  ],
  candidates: [...cappedCandidates, foreignCapacityCandidate],
});
const created = await generateProductReviewCandidate(
  capacityEnv,
  {
    generatePost: async (_env, context) => generatedProductPost(context),
  },
  "workspace-a"
);
assert.equal(created.workspaceId, "workspace-a");
const storedCapacity = await rawCandidates(capacityKv);
assert.equal(
  storedCapacity.filter((item) => item.workspaceId === "workspace-a").length,
  50
);
assert.deepEqual(
  storedCapacity.find((item) => item.id === foreignCapacityCandidate.id),
  foreignCapacityCandidate
);
assert.equal(storedCapacity.length, 51);

console.log("workspace-aware product review candidate fixtures passed");
