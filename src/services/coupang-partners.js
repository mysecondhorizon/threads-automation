const COUPANG_BASE_URL = "https://api-gateway.coupang.com";
export const COUPANG_PRODUCT_SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/search";
export const COUPANG_DEFAULT_SEARCH_LIMIT = 5;
export const COUPANG_MAX_SEARCH_LIMIT = 10;
const MAX_QUERY_LENGTH = 120;

export class CoupangPartnersError extends Error {
  constructor(message, code = "coupang_upstream_failed") {
    super(message);
    this.name = "CoupangPartnersError";
    this.code = code;
  }
}

function fail(message, code) {
  return new CoupangPartnersError(message, code);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function requiredCredential(value) {
  return text(value);
}

function normalizeLimit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return COUPANG_DEFAULT_SEARCH_LIMIT;
  return Math.max(1, Math.min(COUPANG_MAX_SEARCH_LIMIT, Math.floor(numeric)));
}

function normalizeQuery(value) {
  const query = text(value);
  if (!query || query.length > MAX_QUERY_LENGTH) {
    throw fail("Coupang product search query is invalid", "coupang_search_invalid");
  }
  return query;
}

function timestamp(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) throw fail("Coupang request time is invalid", "coupang_upstream_failed");
  const two = (number) => String(number).padStart(2, "0");
  return `${String(value.getUTCFullYear()).slice(-2)}${two(value.getUTCMonth() + 1)}${two(value.getUTCDate())}T${two(value.getUTCHours())}${two(value.getUTCMinutes())}${two(value.getUTCSeconds())}Z`;
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createCoupangAuthorization({ accessKey, secretKey, method, path, query, now = new Date() }) {
  const resolvedAccessKey = requiredCredential(accessKey);
  const resolvedSecretKey = requiredCredential(secretKey);
  if (!resolvedAccessKey || !resolvedSecretKey) {
    throw fail("Coupang credentials are unavailable", "coupang_credentials_unavailable");
  }
  const signedDate = timestamp(now);
  const message = `${signedDate}${method}${path}${query}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(resolvedSecretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return `CEA algorithm=HmacSHA256, access-key=${resolvedAccessKey}, signed-date=${signedDate}, signature=${signature}`;
}

function httpUrl(value) {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function httpsUrl(value) {
  const normalized = httpUrl(value);
  return normalized?.startsWith("https://") ? normalized : null;
}

function normalizedPrice(value) {
  const price = typeof value === "number" ? value : Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

export function normalizeCoupangProductCandidate(raw) {
  const productName = text(raw?.productName);
  if (!productName) return null;
  const productUrl = httpUrl(raw?.productUrl);
  const affiliateUrl = httpUrl(raw?.affiliateUrl) || productUrl;
  const candidate = { productName };
  if (productUrl) candidate.productUrl = productUrl;
  if (affiliateUrl) candidate.affiliateUrl = affiliateUrl;
  const imageUrl = httpsUrl(raw?.productImage);
  const price = normalizedPrice(raw?.productPrice);
  const productId = (typeof raw?.productId === "string" || typeof raw?.productId === "number")
    ? text(String(raw.productId))
    : "";
  const brand = text(raw?.brandName || raw?.brand);
  if (imageUrl) candidate.imageUrl = imageUrl;
  if (price !== null) candidate.price = price;
  if (productId) candidate.productId = productId;
  if (brand) candidate.brand = brand;
  return candidate;
}

function productEntries(payload) {
  const entries = payload?.data?.productData || payload?.data?.products || payload?.productData;
  return Array.isArray(entries) ? entries : null;
}

export async function searchCoupangProducts(env, { query, limit = COUPANG_DEFAULT_SEARCH_LIMIT } = {}, {
  fetchImpl = fetch,
  now = () => new Date(),
} = {}) {
  const keyword = normalizeQuery(query);
  const resolvedLimit = normalizeLimit(limit);
  const search = new URLSearchParams({ keyword, limit: String(resolvedLimit) });
  const queryString = search.toString();
  const authorization = await createCoupangAuthorization({
    accessKey: env?.COUPANG_PARTNERS_ACCESS_KEY,
    secretKey: env?.COUPANG_PARTNERS_SECRET_KEY,
    method: "GET",
    path: COUPANG_PRODUCT_SEARCH_PATH,
    query: queryString,
    now: now(),
  });
  let response;
  try {
    response = await fetchImpl(`${COUPANG_BASE_URL}${COUPANG_PRODUCT_SEARCH_PATH}?${queryString}`, {
      method: "GET",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
    });
  } catch {
    throw fail("Coupang product search is unavailable", "coupang_upstream_failed");
  }
  if (!response || typeof response.ok !== "boolean" || typeof response.status !== "number") {
    throw fail("Coupang product search response is invalid", "coupang_upstream_failed");
  }
  if (response.status === 401 || response.status === 403) throw fail("Coupang product search authentication failed", "coupang_auth_failed");
  if (response.status === 429) throw fail("Coupang product search is rate limited", "coupang_rate_limited");
  if (!response.ok) throw fail("Coupang product search failed", "coupang_upstream_failed");
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw fail("Coupang product search response is invalid", "coupang_upstream_failed");
  }
  const entries = productEntries(payload);
  if (!entries) throw fail("Coupang product search response is invalid", "coupang_upstream_failed");
  return entries.map(normalizeCoupangProductCandidate).filter(Boolean).slice(0, resolvedLimit);
}
