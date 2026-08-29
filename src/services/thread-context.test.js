import assert from "node:assert/strict";

import {
  buildThreadContext,
} from "./thread-context.js";

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

  async list() {
    return { keys: [] };
  }
}

const env = {
  THREADS_KV: new MemoryKv({
    content_products: {
      version: 1,
      products: [
        { id: "default-product", active: true, name: "Default Product" },
        { id: "workspace-a-product", workspaceId: "workspace-a", active: true, name: "Workspace A Product" },
      ],
    },
  }),
};

const defaultContext = await buildThreadContext(env);
const workspaceContext = await buildThreadContext(env, "workspace-a");

assert.deepEqual(
  defaultContext.products.productDetails.map((product) => product.productId),
  ["default-product"]
);
assert.deepEqual(
  workspaceContext.products.productDetails.map((product) => product.productId),
  ["workspace-a-product"]
);

console.log("workspace-aware thread context fixtures passed");
