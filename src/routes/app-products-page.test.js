import assert from "node:assert/strict";
import { handleAppProductsPage } from "./app-products-page.js";
import { sortProductsForDisplay } from "./app-products-client.js";
const env = { THREADS_KV: { async get(key) { return key === "admin_session:session-1" ? "valid" : null; } } };
const response = await handleAppProductsPage(new Request("https://x/app/products", { headers: { cookie: "admin_session=session-1" } }), env);
const page = await response.text();
assert.match(page, /id="product-media-experience-tags"/u);
assert.match(page, /id="product-media-experience-note"/u);
assert.match(page, /name="experienceTags" form="operator-product-media-upload-form"/u);
assert.match(page, /name="experienceNote" form="operator-product-media-upload-form"/u);
assert.equal(response.status, 200); assert.match(page, /operator-product-form/u); assert.match(page, /operator-product-media-upload-form/u); assert.match(page, /product-media-files/u); assert.match(page, /operator-product-media-list/u); assert.match(page, /이 이미지로 제품 인식/u); assert.match(page, /\/api\/products\/media/u); assert.match(page, /\/api\/products\/analyze/u); assert.match(page, /name="link"/u); assert.doesNotMatch(page, /name="mediaId"|Product media ID/u); assert.doesNotMatch(page, /name="price"|price/iu); assert.match(page, /textContent=product\.name/u); assert.match(page, /textContent=item\.description/u); assert.doesNotMatch(page, /innerHTML/u);
assert.match(page, /기본 정보/u); assert.match(page, /링크 및 사용 상태/u); assert.match(page, /개별 제품과 이미지를 직접 연결하지 않습니다/u); assert.match(page, /operator-product-new/u); assert.match(page, /operator-products-refresh/u); assert.match(page, /sortProductsForDisplay/u); assert.match(page, /app-products-badge/u);
assert.deepEqual(sortProductsForDisplay([
  { id: "inactive", name: "가", active: false, autoPostEligible: false },
  { id: "active-linkless", name: "나", active: true, autoPostEligible: false },
  { id: "active-eligible", name: "다", active: true, autoPostEligible: true },
]).map((product) => product.id), ["active-eligible", "active-linkless", "inactive"]);
console.log("app products page fixture passed");
