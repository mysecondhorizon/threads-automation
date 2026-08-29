import assert from "node:assert/strict";

import {
  handleProductReviews,
} from "./product-review.js";

class MemoryKv {
  constructor(entries) {
    this.values = new Map(
      Object.entries(entries).map(([key, value]) => [
        key,
        typeof value === "string" ? value : JSON.stringify(value),
      ])
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
}

const kv = new MemoryKv({
  "admin_session:session-1": "valid",
  content_products: { version: 1, products: [] },
  product_review_candidates: {
    version: 1,
    candidates: [
      { id: "legacy-default", status: "pending_review" },
      { id: "workspace-a", workspaceId: "workspace-a", status: "pending_review" },
    ],
  },
});
const env = { THREADS_KV: kv };

const getResponse = await handleProductReviews(
  new Request("https://example.test/admin/product-reviews", {
    headers: { cookie: "admin_session=session-1" },
  }),
  env
);
const getPayload = await getResponse.json();
assert.deepEqual(getPayload.candidates.map((candidate) => candidate.id), ["legacy-default"]);

const cleanupResponse = await handleProductReviews(
  new Request("https://example.test/admin/product-reviews", {
    method: "POST",
    headers: {
      cookie: "admin_session=session-1",
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "remove_pending", workspaceId: "workspace-a" }),
  }),
  env
);
assert.equal(cleanupResponse.status, 200);
const stored = await kv.get("product_review_candidates", "json");
assert.deepEqual(stored.candidates, [
  { id: "workspace-a", workspaceId: "workspace-a", status: "pending_review" },
]);

console.log("Default Workspace product review route fixtures passed");
