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
    if (key === "content_products") {
      throw new Error("ThreadContext must not read the legacy Product store");
    }
    const value = this.values.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }

  async list() {
    return { keys: [] };
  }
}

const env = {
  THREADS_KV: new MemoryKv(),
};

const defaultContext = await buildThreadContext(env);
const workspaceContext = await buildThreadContext(env, "workspace-a");

assert.equal("products" in defaultContext, false);
assert.equal("recentProducts" in defaultContext.history, false);
assert.equal(defaultContext.publishing.linkAvailable, false);
assert.equal(defaultContext.publishing.questionAvailable, true);
assert.equal(workspaceContext.analytics.performancePostCount, 0);

console.log("workspace-aware thread context fixtures passed");
