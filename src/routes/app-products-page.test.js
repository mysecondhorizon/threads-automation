import assert from "node:assert/strict";
import { handleAppProductsPage } from "./app-products-page.js";
const env = { THREADS_KV: { async get(key) { return key === "admin_session:session-1" ? "valid" : null; } } };
const response = await handleAppProductsPage(new Request("https://x/app/products", { headers: { cookie: "admin_session=session-1" } }), env);
const page = await response.text();
assert.equal(response.status, 200); assert.match(page, /operator-product-form/u); assert.match(page, /operator-product-analyze-form/u); assert.match(page, /name="link"/u); assert.doesNotMatch(page, /name="price"|price/iu); assert.match(page, /textContent=product\.name/u); assert.doesNotMatch(page, /innerHTML/u);
console.log("app products page fixture passed");
