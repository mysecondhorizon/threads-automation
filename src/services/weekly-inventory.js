import { listAvailableMedia } from "./media.js";
import { getActiveProducts } from "./products.js";
import {
  listContentPool,
  getAvailableContentPoolCandidates,
} from "./content-pool.js";

function normalizeExpectedPostCount(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("expectedPostCount must be a non-negative integer");
  }
  return count;
}

export function calculateWeeklyInventory({
  generalMedia = [],
  productMedia = [],
  products = [],
  activePoolItems = [],
  availablePoolItems = [],
  expectedPostCount,
}) {
  const expected = normalizeExpectedPostCount(expectedPostCount);
  const affiliateProducts = products.filter((product) =>
    product?.active === true &&
    product?.linkEnabled === true &&
    Boolean(product?.affiliateLink)
  );
  const availableMediaIds = new Set(
    [...generalMedia, ...productMedia]
      .map((media) => media?.id)
      .filter(Boolean)
  );
  const usablePoolItems = availablePoolItems.filter((item) =>
    Array.isArray(item?.mediaIds) &&
    item.mediaIds.some((mediaId) => availableMediaIds.has(mediaId))
  );
  const availablePostCapacity = usablePoolItems.length;

  return {
    availableGeneralMediaCount: generalMedia.length,
    availableProductMediaCount: productMedia.length,
    activeProductCount: products.length,
    affiliateLinkProductCount: affiliateProducts.length,
    activeContentPoolItemCount: activePoolItems.length,
    availableContentPoolItemCount: usablePoolItems.length,
    poolPolicyCandidateCount: availablePoolItems.length,
    expectedPostCount: expected,
    availablePostCapacity,
    coverageRatio: expected > 0
      ? Number(((availablePostCapacity / expected) * 100).toFixed(2))
      : 100,
    coverageComplete: expected === 0 || availablePostCapacity >= expected,
    calculatedAt: new Date().toISOString(),
  };
}

export async function getWeeklyInventory(
  env,
  {
    expectedPostCount,
    at = new Date(),
  }
) {
  const [
    generalMedia,
    productMedia,
    products,
    activePoolItems,
    availablePoolItems,
  ] = await Promise.all([
    listAvailableMedia(env, { sourceType: "general", at }),
    listAvailableMedia(env, { sourceType: "product", at }),
    getActiveProducts(env),
    listContentPool(env, { active: true }),
    getAvailableContentPoolCandidates(env, { at, limit: 1000 }),
  ]);

  return calculateWeeklyInventory({
    generalMedia,
    productMedia,
    products,
    activePoolItems,
    availablePoolItems,
    expectedPostCount,
  });
}
