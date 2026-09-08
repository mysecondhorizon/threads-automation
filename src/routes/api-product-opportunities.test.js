import assert from "node:assert/strict";

import {
  handleProductOpportunityById,
  handleProductOpportunitiesCollection,
} from "./api-product-opportunities.js";
import {
  ADMIN_SESSION_KEY_PREFIX,
  USERS_KEY,
  WORKSPACES_KEY,
} from "../services/login-foundation.js";

class MemoryKv {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); }
  async get(key, type) {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }
  async put(key, value) { this.values.set(key, value); }
}

function workspaceEnv() {
  return { THREADS_KV: new MemoryKv({
    [USERS_KEY]: JSON.stringify({ version: 1, users: [{ id: "user-next", loginId: "next", displayName: "Next", active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" }] }),
    [WORKSPACES_KEY]: JSON.stringify({ version: 1, workspaces: [
      { id: "workspace-next", ownerUserId: "user-next", name: "Next", active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
      { id: "workspace-other", ownerUserId: "user-other", name: "Other", active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    ] }),
    [`${ADMIN_SESSION_KEY_PREFIX}registered`]: JSON.stringify({ version: 1, userId: "user-next", selectedWorkspaceId: "workspace-next", createdAt: "2026-01-01", expiresAt: "2099-01-01" }),
  }) };
}

function request(path, method = "GET", body, session = "registered") {
  return new Request(`https://example.test${path}`, {
    method,
    headers: { cookie: `admin_session=${session}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const create = {
  productName: "Weekend coffee grinder",
  category: "coffee",
  status: "DISCOVERED",
  signalSources: ["community", "community"],
  opportunityScore: 80,
};
const env = workspaceEnv();

const unauthorized = await handleProductOpportunitiesCollection(request("/api/product-opportunities", "GET", undefined, "missing"), env);
assert.equal(unauthorized.status, 401);

const created = await handleProductOpportunitiesCollection(request("/api/product-opportunities", "POST", create), env);
assert.equal(created.status, 201);
const opportunity = (await created.json()).opportunity;
assert.equal(opportunity.workspaceId, "workspace-next");
assert.deepEqual(opportunity.signalSources, ["community"]);

const listed = await handleProductOpportunitiesCollection(request("/api/product-opportunities"), env);
assert.deepEqual((await listed.json()).opportunities.map((item) => item.id), [opportunity.id]);

const fetched = await handleProductOpportunityById(request(`/api/product-opportunities/${opportunity.id}`), env, opportunity.id);
assert.equal((await fetched.json()).opportunity.productName, create.productName);

const patched = await handleProductOpportunityById(request(`/api/product-opportunities/${opportunity.id}`, "PATCH", { status: "READY", brand: "Example" }), env, opportunity.id);
assert.equal((await patched.json()).opportunity.status, "READY");

const invalid = await handleProductOpportunitiesCollection(request("/api/product-opportunities", "POST", { ...create, status: "PENDING" }), env);
assert.equal(invalid.status, 400);
const scopeOverride = await handleProductOpportunitiesCollection(request("/api/product-opportunities", "POST", { ...create, workspaceId: "workspace-other" }), env);
assert.equal(scopeOverride.status, 400);
const unsupported = await handleProductOpportunitiesCollection(request("/api/product-opportunities", "PUT", create), env);
assert.equal(unsupported.status, 405);

let scopedWorkspace = null;
const foreign = await handleProductOpportunityById(request("/api/product-opportunities/foreign"), env, "foreign", {
  get: async (_env, _id, workspaceId) => { scopedWorkspace = workspaceId; return null; },
});
assert.equal(foreign.status, 404);
assert.equal(scopedWorkspace, "workspace-next");

const removed = await handleProductOpportunityById(request(`/api/product-opportunities/${opportunity.id}`, "DELETE"), env, opportunity.id);
assert.deepEqual(await removed.json(), { ok: true, removed: true });
const missing = await handleProductOpportunityById(request(`/api/product-opportunities/${opportunity.id}`), env, opportunity.id);
assert.equal(missing.status, 404);

console.log("product opportunities API fixture passed");
