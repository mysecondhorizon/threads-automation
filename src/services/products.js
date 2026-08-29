import {
  getJson,
  putJson,
} from "./kv.js";

import {
  DEFAULT_WORKSPACE_ID,
} from "./workspace-foundation.js";

const PRODUCTS_KEY =
  "content_products";

const MAX_PRODUCTS =
  50;

function normalizeWorkspaceId(
  workspaceId
) {
  if (
    workspaceId === undefined ||
    workspaceId === null
  ) {
    return DEFAULT_WORKSPACE_ID;
  }

  if (
    typeof workspaceId !== "string" ||
    !workspaceId.trim()
  ) {
    throw new Error("Invalid workspace id");
  }

  return workspaceId.trim();
}

function productWorkspaceId(
  product
) {
  const workspaceId =
    typeof product?.workspaceId === "string"
      ? product.workspaceId.trim()
      : "";

  return workspaceId ||
    DEFAULT_WORKSPACE_ID;
}

function isInWorkspace(
  product,
  workspaceId
) {
  return productWorkspaceId(product) ===
    workspaceId;
}

function mergeWorkspaceProducts(
  products,
  workspaceId,
  workspaceProducts
) {
  return [
    ...workspaceProducts.slice(
      0,
      MAX_PRODUCTS
    ),

    ...products.filter(
      (product) =>
        !isInWorkspace(
          product,
          workspaceId
        )
    ),
  ];
}

function normalizeText(
  value
) {
  return String(
    value || ""
  ).trim();
}

const PRODUCT_CSV_FIELDS = [
  "productKey", "name", "category", "description",
  "experienceStatus", "experience", "selectionReason", "price",
  "affiliateLink", "affiliateDisclosure", "linkEnabled", "active",
];

function normalizeProductKey(value) {
  return normalizeText(value);
}

function parseBoolean(value, fieldName) {
  if (value === true || value === false) return value;
  const normalized = normalizeText(value).toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  throw new Error(`${fieldName} must be true or false`);
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

function validatePrice(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = normalizeText(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("price must be a non-negative number");
  }
  const price = Number(normalized);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error("price must be a non-negative number");
  }
  return price;
}

function validateAffiliateLink(value) {
  const link = normalizeText(value);
  if (!link) return "";
  let url;
  try { url = new URL(link); }
  catch { throw new Error("affiliateLink must be a valid URL"); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("affiliateLink must use http or https");
  return link;
}

export function isValidOperatorProductLink(value) {
  try {
    const url = new URL(normalizeText(value));
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
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
  existingProduct = null,
  workspaceId = DEFAULT_WORKSPACE_ID
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

    workspaceId,

    productKey:
      normalizeProductKey(input?.productKey) ||
      existingProduct?.productKey ||
      "",

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

  if (product.affiliateLink) validateAffiliateLink(product.affiliateLink);

  return product;
}

export function validateProductInput(input, existingProduct = null) {
  const raw = input || {};
  return validateProduct(normalizeProduct({
    ...raw,
    price: validatePrice(raw.price),
    affiliateLink: validateAffiliateLink(raw.affiliateLink),
    linkEnabled: raw.linkEnabled === undefined
      ? existingProduct?.linkEnabled ?? false
      : parseBoolean(raw.linkEnabled, "linkEnabled"),
    active: raw.active === undefined
      ? existingProduct?.active ?? true
      : parseBoolean(raw.active, "active"),
  }, existingProduct));
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

    products,
  };

  await putJson(
    env,
    PRODUCTS_KEY,
    value
  );

  return value;
}

export async function getProducts(
  env,
  workspaceId
) {
  const resolvedWorkspaceId =
    normalizeWorkspaceId(
      workspaceId
    );

  const store =
    await readProductStore(
      env
    );

  return store.products.filter(
    (product) =>
      isInWorkspace(
        product,
        resolvedWorkspaceId
      )
  );
}

export async function getActiveProducts(
  env,
  workspaceId
) {
  const products =
    await getProducts(
      env,
      workspaceId
    );

  return products.filter(
    (product) =>
      product?.active === true
  );
}

export async function getProductById(
  env,
  productId,
  workspaceId
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
      env,
      workspaceId
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
  input,
  workspaceId
) {
  const resolvedWorkspaceId =
    normalizeWorkspaceId(
      workspaceId
    );

  const store =
    await readProductStore(
      env
    );

  const products =
    store.products;

  const workspaceProducts =
    products.filter(
      (product) =>
        isInWorkspace(
          product,
          resolvedWorkspaceId
        )
    );

  const requestedId =
    normalizeText(
      input?.id
    );

  const foreignProduct =
    requestedId
      ? products.find(
          (product) =>
            product?.id === requestedId &&
            !isInWorkspace(
              product,
              resolvedWorkspaceId
            )
        )
      : null;

  if (
    foreignProduct
  ) {
    throw new Error(
      "Product belongs to another workspace"
    );
  }

  const existingIndex =
    requestedId
      ? workspaceProducts.findIndex(
          (product) =>
            product.id ===
            requestedId
        )
      : -1;

  const existingProduct =
    existingIndex >= 0
      ? workspaceProducts[
          existingIndex
        ]
      : null;

  const product =
    validateProduct(
      normalizeProduct(
        input,
        existingProduct,
        resolvedWorkspaceId
      )
    );

  const nextWorkspaceProducts =
    existingIndex >= 0
      ? workspaceProducts.map(
          (item, index) =>
            index === existingIndex
              ? product
              : item
        )
      : [
          product,
          ...workspaceProducts,
        ];

  await writeProductStore(
    env,
    mergeWorkspaceProducts(
      products,
      resolvedWorkspaceId,
      nextWorkspaceProducts
    )
  );

  return product;
}

export async function resolveProductIdByKey(
  env,
  productKey,
  workspaceId
) {
  const key = normalizeProductKey(productKey);
  if (!key) return null;
  const product = (await getProducts(env, workspaceId)).find((item) => item?.productKey === key);
  return product?.id || null;
}

const OPTIONAL_PRODUCT_FIELDS = [
  "category",
  "description",
  "experienceStatus",
  "experience",
  "selectionReason",
  "price",
  "affiliateLink",
  "affiliateDisclosure",
  "linkEnabled",
  "active",
];

function preserveEmptyCsvFields(row, existingProduct) {
  const merged = { ...row };
  for (const field of OPTIONAL_PRODUCT_FIELDS) {
    if (typeof merged[field] === "string" && !merged[field].trim()) {
      merged[field] = existingProduct[field];
    }
  }
  return merged;
}

export async function batchUpsertProducts(
  env,
  rows,
  workspaceId
) {
  if (!Array.isArray(rows)) throw new Error("rows must be an array");

  const resolvedWorkspaceId =
    normalizeWorkspaceId(
      workspaceId
    );

  const store =
    await readProductStore(
      env
    );

  const products =
    store.products;

  const workspaceProducts =
    products.filter(
      (product) =>
        isInWorkspace(
          product,
          resolvedWorkspaceId
        )
    );

  const nextWorkspaceProducts =
    [...workspaceProducts];

  const results = [];

  rows.forEach((row, index) => {
    try {
      const productKey = normalizeProductKey(row?.productKey);
      if (!productKey) throw new Error("productKey is required");
      const existingIndex = nextWorkspaceProducts.findIndex((item) => item?.productKey === productKey);
      const existingProduct = existingIndex >= 0 ? nextWorkspaceProducts[existingIndex] : null;
      const input = existingProduct
        ? preserveEmptyCsvFields(row, existingProduct)
        : row;
      const product = validateProductInput(
        { ...input, productKey, id: existingProduct?.id },
        existingProduct
      );
      const scopedProduct = normalizeProduct(
        product,
        existingProduct,
        resolvedWorkspaceId
      );
      if (existingIndex >= 0) nextWorkspaceProducts[existingIndex] = scopedProduct;
      else nextWorkspaceProducts.unshift(scopedProduct);
      results.push({ row: index + 1, status: existingProduct ? "updated" : "created", productKey, product: scopedProduct });
    } catch (error) {
      results.push({ row: index + 1, status: "failed", productKey: normalizeProductKey(row?.productKey) || null, error: error.message });
    }
  });

  if (results.some((item) => item.status !== "failed")) {
    await writeProductStore(
      env,
      mergeWorkspaceProducts(
        products,
        resolvedWorkspaceId,
        nextWorkspaceProducts
      )
    );
  }

  return {
    created: results.filter((item) => item.status === "created"),
    updated: results.filter((item) => item.status === "updated"),
    failed: results.filter((item) => item.status === "failed"),
    results,
  };
}

export function parseProductCsv(csvText) {
  const text = String(csvText || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    if (character === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell); if (row.some((value) => value.trim())) rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows.shift().map((header) => header.trim());
  const unknown = headers.filter((header) => header && !PRODUCT_CSV_FIELDS.includes(header));
  if (unknown.length) throw new Error(`Unsupported CSV field: ${unknown[0]}`);
  if (!headers.includes("productKey")) throw new Error("CSV must include productKey");
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

export async function removeProduct(
  env,
  productId,
  workspaceId
) {
  const normalizedId =
    normalizeText(
      productId
    );

  if (!normalizedId) {
    return false;
  }

  const resolvedWorkspaceId =
    normalizeWorkspaceId(
      workspaceId
    );

  const store =
    await readProductStore(
      env
    );

  const products =
    store.products;

  const workspaceProducts =
    products.filter(
      (product) =>
        isInWorkspace(
          product,
          resolvedWorkspaceId
        )
    );

  const nextWorkspaceProducts =
    workspaceProducts.filter(
      (product) =>
        product.id !==
        normalizedId
    );

  if (
    nextWorkspaceProducts.length ===
    workspaceProducts.length
  ) {
    return false;
  }

  await writeProductStore(
    env,
    mergeWorkspaceProducts(
      products,
      resolvedWorkspaceId,
      nextWorkspaceProducts
    )
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
