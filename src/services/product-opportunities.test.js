import assert from "node:assert/strict";

import {
  PRODUCT_OPPORTUNITIES_KEY,
  ProductOpportunityError,
  getProductOpportunityById,
  listProductOpportunities,
  removeProductOpportunity,
  saveProductOpportunity,
} from "./product-opportunities.js";

import {
  DEFAULT_WORKSPACE_ID,
} from "./workspace-foundation.js";

class MemoryKv {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries).map(([key, value]) => [key, JSON.stringify(value)]));
  }

  async get(key, type) {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }

  async put(key, value) {
    this.values.set(key, value);
  }
}

function createEnv(entries = {}) {
  return { THREADS_KV: new MemoryKv(entries) };
}

function input(overrides = {}) {
  return {
    productName: "Portable coffee grinder",
    category: "coffee",
    status: "DISCOVERED",
    ...overrides,
  };
}

async function expectCode(operation, code) {
  await assert.rejects(operation, (error) =>
    error instanceof ProductOpportunityError && error.code === code
  );
}

const env = createEnv();
const defaultOpportunity = await saveProductOpportunity(env, input({
  signalSources: ["community", "community", " search ", ""],
  trendScore: 72,
  sourceUrl: "https://example.test/source",
  affiliateLink: "https://example.test/affiliate",
}));

assert.equal(defaultOpportunity.workspaceId, DEFAULT_WORKSPACE_ID);
assert.equal(defaultOpportunity.useCount, 0);
assert.equal(defaultOpportunity.lastUsedAt, null);
assert.deepEqual(defaultOpportunity.signalSources, ["community", "search"]);
assert.equal(defaultOpportunity.sourceUrl, "https://example.test/source");
assert.deepEqual(
  (await listProductOpportunities(env, null)).map((record) => record.id),
  [defaultOpportunity.id]
);

const workspaceOpportunity = await saveProductOpportunity(env, input({
  productName: "Weekend hiking bottle",
  category: "outdoors",
  status: "RECOMMENDED",
}), "workspace-next");
assert.equal(workspaceOpportunity.workspaceId, "workspace-next");
assert.deepEqual(
  (await listProductOpportunities(env, "workspace-next")).map((record) => record.id),
  [workspaceOpportunity.id]
);
assert.equal(await getProductOpportunityById(env, defaultOpportunity.id, "workspace-next"), null);
assert.equal(await getProductOpportunityById(env, workspaceOpportunity.id), null);

const updated = await saveProductOpportunity(env, {
  id: defaultOpportunity.id,
  status: "APPROVED",
  useCount: 2,
  lastUsedAt: "2026-09-08T08:00:00.000Z",
});
assert.equal(updated.status, "APPROVED");
assert.equal(updated.productName, defaultOpportunity.productName);
assert.equal(updated.trendScore, 72);
assert.equal(updated.useCount, 2);
assert.equal(updated.lastUsedAt, "2026-09-08T08:00:00.000Z");

await expectCode(
  () => saveProductOpportunity(env, { id: workspaceOpportunity.id, status: "USED" }),
  "product_opportunity_not_found"
);
assert.equal(await removeProductOpportunity(env, workspaceOpportunity.id), false);
assert.equal((await getProductOpportunityById(env, workspaceOpportunity.id, "workspace-next")).status, "RECOMMENDED");

await expectCode(
  () => saveProductOpportunity(env, input({ status: "PENDING" })),
  "product_opportunity_status_invalid"
);
await expectCode(
  () => saveProductOpportunity(env, input({ sourceUrl: "ftp://example.test/file" })),
  "product_opportunity_sourceUrl_invalid"
);
await expectCode(
  () => saveProductOpportunity(env, input({ affiliateLink: "not a url" })),
  "product_opportunity_affiliateLink_invalid"
);
await expectCode(
  () => saveProductOpportunity(env, input({ trendScore: 101 })),
  "product_opportunity_trendScore_invalid"
);
await expectCode(
  () => saveProductOpportunity(env, input({ personaFitScore: "70" })),
  "product_opportunity_personaFitScore_invalid"
);
await expectCode(
  () => saveProductOpportunity(env, input({ signalSources: "community" })),
  "product_opportunity_signal_sources_invalid"
);
await expectCode(
  () => saveProductOpportunity(env, input({ useCount: -1 })),
  "product_opportunity_use_count_invalid"
);

assert.equal(await removeProductOpportunity(env, defaultOpportunity.id), true);
assert.equal(await getProductOpportunityById(env, defaultOpportunity.id), null);
assert.equal(await removeProductOpportunity(env, defaultOpportunity.id), false);

const invalidEnv = createEnv({
  [PRODUCT_OPPORTUNITIES_KEY]: {
    version: 1,
    records: [
      { id: "bad-record", workspaceId: DEFAULT_WORKSPACE_ID, productName: "Bad", category: "x", status: "INVALID" },
      { id: "good-record", workspaceId: DEFAULT_WORKSPACE_ID, productName: "Good", category: "x", status: "READY", signalSources: [], useCount: 0 },
    ],
  },
});
assert.deepEqual(
  (await listProductOpportunities(invalidEnv)).map((record) => record.id),
  ["good-record"]
);
assert.equal(await getProductOpportunityById(invalidEnv, "bad-record"), null);

console.log("product opportunity service tests passed");
