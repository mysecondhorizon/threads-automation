import {
  getJson,
  putJson,
} from "./kv.js";

const PRODUCTS_KEY =
  "content_products";

const MAX_PRODUCTS =
  50;

function normalizeText(
  value
) {
  return String(
    value || ""
  ).trim();
}

function normalizeBoolean(
  value
) {
  return value === true;
}

function normalizePrice(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const price =
    Number(value);

  if (
    !Number.isFinite(price) ||
    price < 0
  ) {
    return null;
  }

  return price;
}

function createProductId() {
  if (
    globalThis.crypto &&
    typeof globalThis.crypto
      .randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return [
    Date.now().toString(36),
    Math.random()
      .toString(36)
      .slice(2, 12),
  ].join("-");
}

function normalizeProduct(
  input,
  existingProduct = null
) {
  const now =
    new Date().toISOString();

  return {
    id:
      normalizeText(
        input?.id
      ) ||
      existingProduct?.id ||
      createProductId(),

    name:
      normalizeText(
        input?.name
      ),

    category:
      normalizeText(
        input?.category
      ),

    description:
      normalizeText(
        input?.description
      ),

    selectionReason:
      normalizeText(
        input?.selectionReason
      ),

    experience:
      normalizeText(
        input?.experience
      ),

    experienceStatus:
      normalizeText(
        input?.experienceStatus
      ) ||
      "미확인",

    price:
      normalizePrice(
        input?.price
      ),

    photoDescription:
      normalizeText(
        input?.photoDescription
      ),

    affiliateLink:
      normalizeText(
        input?.affiliateLink
      ),

    affiliateDisclosure:
      normalizeText(
        input?.affiliateDisclosure
      ) ||
      "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.",

    linkEnabled:
      normalizeBoolean(
        input?.linkEnabled
      ),

    active:
      input?.active === undefined
        ? (
            existingProduct?.active ??
            true
          )
        : normalizeBoolean(
            input.active
          ),

    createdAt:
      existingProduct?.createdAt ||
      now,

    updatedAt:
      now,
  };
}

function validateProduct(
  product
) {
  if (!product.name) {
    throw new Error(
      "제품명은 필수입니다."
    );
  }

  if (
    product.linkEnabled &&
    !product.affiliateLink
  ) {
    throw new Error(
      "링크 사용 제품에는 쿠팡파트너스 링크가 필요합니다."
    );
  }

  return product;
}

async function readProductStore(
  env
) {
  const stored =
    await getJson(
      env,
      PRODUCTS_KEY
    );

  if (
    !stored ||
    !Array.isArray(
      stored.products
    )
  ) {
    return {
      version:
        1,

      updatedAt:
        null,

      products:
        [],
    };
  }

  return {
    version:
      Number(
        stored.version || 1
      ),

    updatedAt:
      stored.updatedAt ||
      null,

    products:
      stored.products,
  };
}

async function writeProductStore(
  env,
  products
) {
  const value = {
    version:
      1,

    updatedAt:
      new Date().toISOString(),

    products:
      products.slice(
        0,
        MAX_PRODUCTS
      ),
  };

  await putJson(
    env,
    PRODUCTS_KEY,
    value
  );

  return value;
}

export async function getProducts(
  env
) {
  const store =
    await readProductStore(
      env
    );

  return store.products;
}

export async function getActiveProducts(
  env
) {
  const products =
    await getProducts(
      env
    );

  return products.filter(
    (product) =>
      product?.active === true
  );
}

export async function getProductById(
  env,
  productId
) {
  const normalizedId =
    normalizeText(
      productId
    );

  if (!normalizedId) {
    return null;
  }

  const products =
    await getProducts(
      env
    );

  return (
    products.find(
      (product) =>
        product.id ===
        normalizedId
    ) ||
    null
  );
}

export async function saveProduct(
  env,
  input
) {
  const products =
    await getProducts(
      env
    );

  const requestedId =
    normalizeText(
      input?.id
    );

  const existingIndex =
    requestedId
      ? products.findIndex(
          (product) =>
            product.id ===
            requestedId
        )
      : -1;

  const existingProduct =
    existingIndex >= 0
      ? products[
          existingIndex
        ]
      : null;

  const product =
    validateProduct(
      normalizeProduct(
        input,
        existingProduct
      )
    );

  let nextProducts;

  if (
    existingIndex >= 0
  ) {
    nextProducts = [
      ...products,
    ];

    nextProducts[
      existingIndex
    ] = product;
  } else {
    nextProducts = [
      product,
      ...products,
    ];
  }

  await writeProductStore(
    env,
    nextProducts
  );

  return product;
}

export async function removeProduct(
  env,
  productId
) {
  const normalizedId =
    normalizeText(
      productId
    );

  if (!normalizedId) {
    return false;
  }

  const products =
    await getProducts(
      env
    );

  const nextProducts =
    products.filter(
      (product) =>
        product.id !==
        normalizedId
    );

  if (
    nextProducts.length ===
    products.length
  ) {
    return false;
  }

  await writeProductStore(
    env,
    nextProducts
  );

  return true;
}

export function buildProductContext(
  products
) {
  const activeProducts =
    Array.isArray(products)
      ? products.filter(
          (product) =>
            product?.active === true
        )
      : [];

  return {
    availableProducts:
      activeProducts.map(
        (product) => ({
          id:
            product.id,

          name:
            product.name,

          category:
            product.category,

          linkEnabled:
            Boolean(
              product.linkEnabled &&
              product.affiliateLink
            ),
        })
      ),

    productExperience:
      activeProducts
        .filter(
          (product) =>
            product.experience
        )
        .map(
          (product) => ({
            productId:
              product.id,

            productName:
              product.name,

            experienceStatus:
              product.experienceStatus,

            experience:
              product.experience,

            selectionReason:
              product.selectionReason,
          })
        ),

    productDetails:
      activeProducts.map(
        (product) => ({
          productId:
            product.id,

          productName:
            product.name,

          category:
            product.category,

          description:
            product.description,

          affiliateLink:
            product.linkEnabled
              ? product.affiliateLink
              : "",

          affiliateDisclosure:
            product.linkEnabled
              ? product.affiliateDisclosure
              : "",

          linkEnabled:
            Boolean(
              product.linkEnabled &&
              product.affiliateLink
            ),
        })
      ),

    productPrices:
      activeProducts
        .filter(
          (product) =>
            product.price !== null
        )
        .map(
          (product) => ({
            productId:
              product.id,

            productName:
              product.name,

            price:
              product.price,
          })
        ),

    productPhotos:
      activeProducts
        .filter(
          (product) =>
            product.photoDescription
        )
        .map(
          (product) => ({
            productId:
              product.id,

            productName:
              product.name,

            description:
              product.photoDescription,
          })
        ),
  };
}