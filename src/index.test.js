import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./index.js", import.meta.url), "utf8");

for (const pathname of [
  "/api/products/analyze",
  "/admin/products-page",
  "/admin/products",
  "/admin/product-review-page",
  "/admin/product-reviews",
  "/admin/auto-post/publish-reviewed",
]) {
  assert.equal(source.includes(`"${pathname}"`), false, `${pathname} must not be registered`);
}
assert.equal(source.includes('pathname === "/app/products"'), true);
assert.equal(source.includes('pathname === "/api/product-opportunities"'), true);
assert.equal(source.includes('handleProductOpportunityAssets,'), true);
assert.equal(source.includes('pathname === "/api/product-opportunities/discover"'), true);
assert.equal(source.includes('pathname.endsWith("/generate-content")'), true);
assert.equal(source.includes('pathname.endsWith("/publish-content")'), true);
assert.equal(source.includes('pathname.startsWith("/api/product-opportunities/")'), true);
assert.equal(source.indexOf('pathname === "/api/product-opportunities/discover"') < source.indexOf('pathname.startsWith("/api/product-opportunities/")'), true);
assert.equal(source.indexOf('pathname.endsWith("/assets/candidates")') < source.lastIndexOf('pathname.startsWith("/api/product-opportunities/")'), true);
assert.equal(source.indexOf('pathname.endsWith("/product-candidates")') < source.lastIndexOf('pathname.startsWith("/api/product-opportunities/")'), true);
assert.equal(source.indexOf('pathname.endsWith("/generate-content")') < source.lastIndexOf('pathname.startsWith("/api/product-opportunities/")'), true);
assert.equal(source.indexOf('pathname.endsWith("/publish-content")') < source.lastIndexOf('pathname.startsWith("/api/product-opportunities/")'), true);
assert.equal(source.includes('pathname === "/api/products/media"'), true);
assert.equal(source.includes('pathname === "/api/products/media"'), true);
console.log("index legacy product route fixture passed");
