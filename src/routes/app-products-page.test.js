import assert from "node:assert/strict";
import { handleAppProductsPage } from "./app-products-page.js";
const env = { THREADS_KV: { async get(key) { return key === "admin_session:session-1" ? "valid" : null; } } };
const response = await handleAppProductsPage(new Request("https://x/app/products", { headers: { cookie: "admin_session=session-1" } }), env);
const page = await response.text();
assert.equal(response.status, 200); assert.match(page, /operator-product-form/u); assert.match(page, /operator-product-media-upload-form/u); assert.match(page, /product-media-files/u); assert.match(page, /operator-product-media-list/u); assert.match(page, /이 이미지로 제품 인식/u); assert.match(page, /\/api\/products\/media/u); assert.match(page, /\/api\/products\/analyze/u); assert.match(page, /name="link"/u); assert.doesNotMatch(page, /name="mediaId"|Product media ID/u); assert.doesNotMatch(page, /name="price"|price/iu); assert.match(page, /textContent=product\.name/u); assert.match(page, /textContent=item\.description/u); assert.doesNotMatch(page, /innerHTML/u);
console.log("app products page fixture passed");
