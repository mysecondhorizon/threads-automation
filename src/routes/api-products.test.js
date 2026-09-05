import assert from "node:assert/strict";
import { handleOperatorProductById, handleOperatorProducts } from "./api-products.js";
import { ADMIN_SESSION_KEY_PREFIX, USERS_KEY, WORKSPACES_KEY } from "../services/login-foundation.js";

const env = (authenticated = true) => ({ THREADS_KV: { async get(key) { return authenticated && key === "admin_session:session-1" ? "valid" : null; } } });
const request = (url, method = "GET", body, authenticated = true) => new Request(url, { method, headers: { ...(authenticated ? { cookie: "admin_session=session-1" } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const linked = { id: "p1", name: "Product", category: "Office", description: "Desc", affiliateLink: "https://example.test/p", linkEnabled: true, active: true, price: 100, createdAt: "2026-01-01", updatedAt: "2026-01-02" };
const linkless = { ...linked, id: "p2", affiliateLink: "", linkEnabled: false };
const inactive = { ...linked, id: "p3", active: false };

function workspaceEnv(selectedWorkspaceId = "workspace-next") {
  const values = new Map([
    [USERS_KEY, JSON.stringify({ version: 1, users: [{ id: "user-next", loginId: "next", displayName: "Next", active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" }] })],
    [WORKSPACES_KEY, JSON.stringify({ version: 1, workspaces: [
      { id: "workspace-next", ownerUserId: "user-next", name: "Next", active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
      { id: "workspace-other", ownerUserId: "user-other", name: "Other", active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    ] })],
    [`${ADMIN_SESSION_KEY_PREFIX}registered`, JSON.stringify({ version: 1, userId: "user-next", selectedWorkspaceId, createdAt: "2026-01-01", expiresAt: "2099-01-01" })],
    ["content_products", JSON.stringify({ version: 1, products: [
      { ...linked, id: "next-product", workspaceId: "workspace-next" },
      { ...linked, id: "other-product", workspaceId: "workspace-other" },
    ] })],
  ]);
  return {
    values,
    env: { THREADS_KV: {
      async get(key, type) { const value = values.get(key); return value === undefined ? null : (type === "json" ? JSON.parse(value) : value); },
      async put(key, value) { values.set(key, value); },
    } },
  };
}
function registeredProductRequest(url, method = "GET", body) {
  return new Request(url, { method, headers: { cookie: "admin_session=registered", ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
assert.equal((await handleOperatorProducts(request("https://x/api/products", "GET", undefined, false), env(false), new URL("https://x/api/products"))).status, 401);
const list = await handleOperatorProducts(request("https://x/api/products"), env(), new URL("https://x/api/products"), { list: async () => [linked, linkless, inactive] });
const products = (await list.json()).products;
assert.equal(products[0].price, undefined); assert.equal(products[0].autoPostEligible, true); assert.equal(products[1].autoPostEligible, false); assert.equal(products[2].autoPostEligible, false);
let saved = null;
const created = await handleOperatorProducts(request("https://x/api/products", "POST", { name: "New", category: "Home", description: "", link: "", active: true }), env(), new URL("https://x/api/products"), { save: async (_env, value) => { saved = value; return { ...value, id: "new", createdAt: "now", updatedAt: "now" }; } });
assert.equal(created.status, 200); assert.equal(saved.affiliateLink, ""); assert.equal(saved.linkEnabled, false);
const badPrice = await handleOperatorProducts(request("https://x/api/products", "POST", { name: "New", category: "Home", description: "", price: 1 }), env(), new URL("https://x/api/products")); assert.equal(badPrice.status, 400);
const badLink = await handleOperatorProducts(request("https://x/api/products", "POST", { name: "New", category: "Home", description: "", link: "javascript:alert(1)" }), env(), new URL("https://x/api/products")); assert.equal(badLink.status, 400);
const patch = await handleOperatorProductById(request("https://x/api/products/p1", "PATCH", { link: null, active: false }), env(), "p1", { get: async () => linked, save: async (_env, value) => value }); assert.equal((await patch.json()).product.autoPostEligible, false);
const missing = await handleOperatorProductById(request("https://x/api/products/no", "PATCH", { active: false }), env(), "no", { get: async () => null }); assert.equal(missing.status, 404);

const scoped = workspaceEnv();
const scopedList = await handleOperatorProducts(registeredProductRequest("https://x/api/products"), scoped.env, new URL("https://x/api/products"));
assert.deepEqual((await scopedList.json()).products.map((product) => product.id), ["next-product"]);
const scopedCreate = await handleOperatorProducts(registeredProductRequest("https://x/api/products", "POST", { name: "Scoped", category: "Home", description: "", link: "", active: true }), scoped.env, new URL("https://x/api/products"));
assert.equal(scopedCreate.status, 200);
assert.equal(JSON.parse(scoped.values.get("content_products")).products.find((product) => product.name === "Scoped").workspaceId, "workspace-next");
assert.equal((await handleOperatorProductById(registeredProductRequest("https://x/api/products/other-product", "PATCH", { active: false }), scoped.env, "other-product")).status, 404);
assert.equal((await handleOperatorProducts(registeredProductRequest("https://x/api/products", "POST", { name: "No override", category: "Home", description: "", link: "", active: true, workspaceId: "workspace-other" }), scoped.env, new URL("https://x/api/products"))).status, 400);
console.log("operator products API fixture passed");
