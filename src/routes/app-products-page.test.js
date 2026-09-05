import assert from "node:assert/strict";
import { handleAppProductsPage } from "./app-products-page.js";
import { sortProductsForDisplay } from "./app-products-client.js";
import { ADMIN_SESSION_KEY_PREFIX, USERS_KEY, WORKSPACES_KEY } from "../services/login-foundation.js";
const env = { THREADS_KV: { async get(key) { return key === "admin_session:session-1" ? "valid" : null; } } };
const response = await handleAppProductsPage(new Request("https://x/app/products", { headers: { cookie: "admin_session=session-1" } }), env);
const page = await response.text();
assert.match(page, /id="product-media-experience-tags"/u);
assert.match(page, /id="product-media-experience-note"/u);
assert.match(page, /name="experienceTags" form="operator-product-media-upload-form"/u);
assert.match(page, /name="experienceNote" form="operator-product-media-upload-form"/u);
assert.equal(response.status, 200); assert.match(page, /operator-product-form/u); assert.match(page, /operator-product-media-upload-form/u); assert.match(page, /product-media-files/u); assert.match(page, /accept="image\/jpeg,image\/png,image\/webp,video\/mp4"/u); assert.match(page, /operator-product-media-list/u); assert.match(page, /document\.createElement\('video'\)/u); assert.match(page, /preview\.controls=true/u); assert.match(page, /이 이미지로 제품 인식/u); assert.match(page, /\/api\/products\/media/u); assert.match(page, /\/api\/products\/analyze/u); assert.match(page, /name="link"/u); assert.doesNotMatch(page, /name="mediaId"|Product media ID/u); assert.doesNotMatch(page, /name="price"|price/iu); assert.match(page, /textContent=product\.name/u); assert.match(page, /textContent=item\.description/u); assert.doesNotMatch(page, /innerHTML/u);
assert.match(page, /기본 정보/u); assert.match(page, /링크 및 사용 상태/u); assert.match(page, /Daily 에셋과는 별도로 관리됩니다/u); assert.match(page, /operator-product-new/u); assert.match(page, /operator-products-refresh/u); assert.match(page, /sortProductsForDisplay/u); assert.match(page, /app-products-badge/u); assert.doesNotMatch(page, /name="productId"|product-media-product-id/u);
assert.deepEqual(sortProductsForDisplay([
  { id: "inactive", name: "가", active: false, autoPostEligible: false },
  { id: "active-linkless", name: "나", active: true, autoPostEligible: false },
  { id: "active-eligible", name: "다", active: true, autoPostEligible: true },
]).map((product) => product.id), ["active-eligible", "active-linkless", "inactive"]);

const values = new Map([
  [USERS_KEY, JSON.stringify({ version: 1, users: [{ id: "user-next", loginId: "next", displayName: "Next", active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" }] })],
  [WORKSPACES_KEY, JSON.stringify({ version: 1, workspaces: [{ id: "workspace-next", ownerUserId: "user-next", name: "Next Horizon", active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" }] })],
  [`${ADMIN_SESSION_KEY_PREFIX}registered`, JSON.stringify({ version: 1, userId: "user-next", selectedWorkspaceId: "workspace-next", createdAt: "2026-01-01", expiresAt: "2099-01-01" })],
]);
const registeredEnv = { THREADS_KV: { async get(key, type) { const value = values.get(key); return value === undefined ? null : (type === "json" ? JSON.parse(value) : value); } } };
const registeredPage = await handleAppProductsPage(new Request("https://x/app/products", { headers: { cookie: "admin_session=registered" } }), registeredEnv);
assert.equal(registeredPage.status, 200);
assert.match(await registeredPage.text(), /Next Horizon/u);
console.log("app products page fixture passed");
