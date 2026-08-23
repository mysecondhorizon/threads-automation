import assert from "node:assert/strict";
import { isProductReviewEligible } from "./product-review.js";

const product = { id: "p1", name: "Product", active: true, linkEnabled: true, affiliateLink: "https://example.test/p", affiliateDisclosure: "Disclosure", description: "Description" };
assert.equal(isProductReviewEligible(product), true);
assert.equal(isProductReviewEligible({ ...product, affiliateLink: "" }), false);
assert.equal(isProductReviewEligible({ ...product, affiliateLink: "javascript:alert(1)" }), false);
assert.equal(isProductReviewEligible({ ...product, active: false }), false);
console.log("product review eligibility fixture passed");
