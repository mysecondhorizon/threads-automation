import assert from "node:assert/strict";

import {
  COUPANG_PRODUCT_SEARCH_PATH,
  CoupangPartnersError,
  createCoupangAuthorization,
  searchCoupangProducts,
} from "./coupang-partners.js";

const env = { COUPANG_PARTNERS_ACCESS_KEY: "access-key", COUPANG_PARTNERS_SECRET_KEY: "secret-key" };
const fixedNow = () => new Date("2026-09-10T12:34:56.000Z");

async function expectCode(operation, code) {
  await assert.rejects(operation, (error) => error instanceof CoupangPartnersError && error.code === code && !error.message.includes("secret-key") && !error.message.includes("access-key"));
}

await expectCode(() => searchCoupangProducts({}, { query: "coffee" }), "coupang_credentials_unavailable");
await expectCode(() => searchCoupangProducts(env, { query: "   " }), "coupang_search_invalid");

const authorization = await createCoupangAuthorization({ accessKey: "access-key", secretKey: "secret-key", method: "GET", path: COUPANG_PRODUCT_SEARCH_PATH, query: "keyword=coffee&limit=5", now: fixedNow() });
assert.match(authorization, /^CEA algorithm=HmacSHA256, access-key=access-key, signed-date=260910T123456Z, signature=[0-9a-f]{64}$/u);

let requestedUrl = null;
let requestedHeaders = null;
const candidates = await searchCoupangProducts(env, { query: "\uCEE4\uD53C \uADF8\uB77C\uC778\uB354", limit: 99 }, {
  now: fixedNow,
  fetchImpl: async (url, options) => {
    requestedUrl = url;
    requestedHeaders = options.headers;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: { productData: [
          { productName: "Coffee Grinder", productUrl: "https://link.coupang.com/a/one", productImage: "https://image.example/grinder.jpg", productPrice: 24900, productId: 42, brandName: "Example" },
          { productName: "Unsafe URL", productUrl: "javascript:alert(1)", productImage: "http://image.example/no.jpg", productPrice: "bad" },
          { productName: "" },
        ] },
      }),
    };
  },
});
assert.match(requestedUrl, /keyword=%EC%BB%A4%ED%94%BC\+%EA%B7%B8%EB%9D%BC%EC%9D%B8%EB%8D%94/u);
assert.match(requestedUrl, /limit=10/u);
assert.match(requestedHeaders.Authorization, /^CEA algorithm=/u);
assert.equal(JSON.stringify(requestedHeaders).includes("secret-key"), false);
assert.deepEqual(candidates[0], { productName: "Coffee Grinder", productUrl: "https://link.coupang.com/a/one", affiliateUrl: "https://link.coupang.com/a/one", imageUrl: "https://image.example/grinder.jpg", price: 24900, productId: "42", brand: "Example" });
assert.deepEqual(candidates[1], { productName: "Unsafe URL" });

await expectCode(() => searchCoupangProducts(env, { query: "coffee" }, { fetchImpl: async () => ({ ok: false, status: 401 }), now: fixedNow }), "coupang_auth_failed");
await expectCode(() => searchCoupangProducts(env, { query: "coffee" }, { fetchImpl: async () => ({ ok: false, status: 429 }), now: fixedNow }), "coupang_rate_limited");
await expectCode(() => searchCoupangProducts(env, { query: "coffee" }, { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: {} }) }), now: fixedNow }), "coupang_upstream_failed");
await expectCode(() => searchCoupangProducts(env, { query: "coffee" }, { fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } }), now: fixedNow }), "coupang_upstream_failed");
await expectCode(() => searchCoupangProducts(env, { query: "coffee" }, { fetchImpl: async () => { throw new Error("network"); }, now: fixedNow }), "coupang_upstream_failed");

console.log("coupang partners fixture passed");
