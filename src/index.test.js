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
assert.equal(source.includes('pathname.startsWith("/api/product-opportunities/")'), true);
assert.equal(source.includes('pathname === "/api/products/media"'), true);
console.log("index legacy product route fixture passed");
