import { requireAdminApiSession } from "../middleware/auth.js";
import { getProductById, getProducts, isValidOperatorProductLink, saveProduct } from "../services/products.js";
import { fail, ok } from "../utils/response.js";

function normalizeLink(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  if (typeof value !== "string" || !isValidOperatorProductLink(value)) throw new Error("link must be a valid http or https URL");
  return value.trim();
}
function text(value, field, required = false) {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`${field} is required`);
  return normalized;
}
function toOperatorProduct(product) {
  const link = isValidOperatorProductLink(product?.affiliateLink) ? product.affiliateLink.trim() : null;
  return { id: product.id, name: String(product.name || ""), category: String(product.category || ""), description: String(product.description || ""), link, active: product.active === true, autoPostEligible: product.active === true && Boolean(link), createdAt: product.createdAt, updatedAt: product.updatedAt };
}
function parseInput(value, { partial = false } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Product input must be an object");
  const allowed = new Set(["name", "category", "description", "link", "active"]);
  if (!Object.keys(value).length || Object.keys(value).some((key) => !allowed.has(key))) throw new Error("Only name, category, description, link, and active are allowed");
  const input = {};
  for (const field of ["name", "category", "description"]) {
    if (Object.hasOwn(value, field)) input[field] = text(value[field], field, field !== "description");
    else if (!partial && field !== "description") throw new Error(`${field} is required`);
  }
  if (!partial && !Object.hasOwn(value, "description")) input.description = "";
  if (Object.hasOwn(value, "link")) input.link = normalizeLink(value.link);
  else if (!partial) input.link = null;
  if (Object.hasOwn(value, "active")) { if (typeof value.active !== "boolean") throw new Error("active must be a boolean"); input.active = value.active; }
  else if (!partial) input.active = true;
  return input;
}
function toLegacy(input, existing = {}) {
  const link = Object.hasOwn(input, "link") ? input.link : (isValidOperatorProductLink(existing.affiliateLink) ? existing.affiliateLink : null);
  return { ...existing, id: existing.id, name: input.name ?? existing.name, category: input.category ?? existing.category, description: input.description ?? existing.description, affiliateLink: link || "", linkEnabled: Boolean(link), active: input.active ?? existing.active ?? true };
}
async function auth(request, env) { return requireAdminApiSession(request, env, { allowSelectedWorkspace: true }); }
function queryBoolean(value) { if (value === null) return null; if (value === "true") return true; if (value === "false") return false; throw new Error("Filter must be true or false"); }

export async function handleOperatorProducts(request, env, url, { list = getProducts, save = saveProduct } = {}) {
  const authorization = await auth(request, env); if (!authorization.ok) return authorization.response;
  try {
    if (request.method === "GET") {
      const active = queryBoolean(url.searchParams.get("active")); const eligible = queryBoolean(url.searchParams.get("eligible"));
      const products = (await list(env, authorization.workspaceId)).map(toOperatorProduct).filter((item) => (active === null || item.active === active) && (eligible === null || item.autoPostEligible === eligible));
      return ok({ products });
    }
    if (request.method !== "POST") return fail("Method Not Allowed", 405);
    const input = parseInput(await request.json());
    return ok({ product: toOperatorProduct(await save(env, toLegacy(input), authorization.workspaceId)) });
  } catch (error) { return fail(error?.message || "Product request failed", 400, { code: "invalid_product_input" }); }
}

export async function handleOperatorProductById(request, env, productId, { get = getProductById, save = saveProduct } = {}) {
  const authorization = await auth(request, env); if (!authorization.ok) return authorization.response;
  if (request.method !== "PATCH") return fail("Method Not Allowed", 405);
  try {
    const existing = await get(env, productId, authorization.workspaceId); if (!existing) return fail("Product not found", 404, { code: "product_not_found" });
    const input = parseInput(await request.json(), { partial: true });
    return ok({ product: toOperatorProduct(await save(env, toLegacy(input, existing), authorization.workspaceId)) });
  } catch (error) { return fail(error?.message || "Product update failed", 400, { code: "invalid_product_input" }); }
}
