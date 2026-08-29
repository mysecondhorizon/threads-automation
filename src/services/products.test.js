import assert from "node:assert/strict";

import {
  DEFAULT_WORKSPACE_ID,
} from "./workspace-foundation.js";

import {
  batchUpsertProducts,
  getProductById,
  getProducts,
  removeProduct,
  resolveProductIdByKey,
  saveProduct,
} from "./products.js";

const PRODUCTS_KEY = "content_products";

class MemoryKv {
  constructor(entries = {}) {
    this.values = new Map(
      Object.entries(entries).map(
        ([key, value]) => [
          key,
          JSON.stringify(value),
        ]
      )
    );
  }

  async get(key, type) {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return type === "json"
      ? JSON.parse(value)
      : value;
  }

  async put(key, value) {
    this.values.set(key, value);
  }
}

function product(overrides = {}) {
  return {
    id: "product-default",
    productKey: "default-key",
    name: "Default Product",
    category: "office",
    description: "Default description",
    experienceStatus: "used",
    experience: "Daily use",
    selectionReason: "Useful",
    price: 1000,
    affiliateLink: "",
    affiliateDisclosure: "",
    linkEnabled: false,
    active: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function createEnv(products) {
  const kv = new MemoryKv({
    [PRODUCTS_KEY]: {
      version: 1,
      updatedAt: "2026-08-01T00:00:00.000Z",
      products,
    },
  });
  return {
    kv,
    env: { THREADS_KV: kv },
  };
}

async function rawProducts(kv) {
  return (await kv.get(PRODUCTS_KEY, "json")).products;
}

const legacy = product({
  id: "legacy-default",
  productKey: "legacy-key",
});
const workspaceA = product({
  id: "workspace-a-product",
  productKey: "workspace-a-key",
  workspaceId: "workspace-a",
});
const workspaceB = product({
  id: "workspace-b-product",
  productKey: "workspace-b-key",
  workspaceId: "workspace-b",
});
const { env, kv } = createEnv([
  legacy,
  workspaceA,
  workspaceB,
]);

assert.deepEqual(
  await getProducts(env),
  await getProducts(env, null)
);
assert.deepEqual(
  await getProducts(env),
  await getProducts(env, DEFAULT_WORKSPACE_ID)
);
assert.deepEqual(
  (await getProducts(env)).map((item) => item.id),
  ["legacy-default"]
);
assert.deepEqual(
  (await getProducts(env, "workspace-a")).map((item) => item.id),
  ["workspace-a-product"]
);
assert.deepEqual(
  await getProducts(env, "workspace-empty"),
  []
);

const updatedLegacy = await saveProduct(env, {
  ...legacy,
  description: "Updated legacy default description",
});
assert.equal(updatedLegacy.id, legacy.id);
assert.equal(updatedLegacy.workspaceId, DEFAULT_WORKSPACE_ID);
assert.equal(
  (await rawProducts(kv)).find(
    (item) => item.id === legacy.id
  ).workspaceId,
  DEFAULT_WORKSPACE_ID
);
assert.deepEqual(
  (await rawProducts(kv)).find(
    (item) => item.id === workspaceB.id
  ),
  workspaceB
);

const createdInA = await saveProduct(
  env,
  {
    name: "Created in A",
    productKey: "created-a",
    workspaceId: "workspace-b",
  },
  "workspace-a"
);
assert.equal(createdInA.workspaceId, "workspace-a");
assert.equal(createdInA.workspaceId === "workspace-b", false);

const createdInDefault = await saveProduct(env, {
  name: "Created in Default",
  productKey: "created-default",
});
assert.equal(createdInDefault.workspaceId, DEFAULT_WORKSPACE_ID);

const sameKeyInA = await saveProduct(
  env,
  { name: "Shared A", productKey: "shared-key" },
  "workspace-a"
);
const sameKeyInB = await saveProduct(
  env,
  { name: "Shared B", productKey: "shared-key" },
  "workspace-b"
);
assert.notEqual(sameKeyInA.id, sameKeyInB.id);
assert.equal(
  await resolveProductIdByKey(env, "shared-key", "workspace-a"),
  sameKeyInA.id
);
assert.equal(
  await resolveProductIdByKey(env, "shared-key", "workspace-b"),
  sameKeyInB.id
);
assert.equal(
  await resolveProductIdByKey(env, "shared-key"),
  null
);

assert.equal(
  await getProductById(env, workspaceB.id, "workspace-a"),
  null
);
await assert.rejects(
  saveProduct(
    env,
    { ...workspaceB, name: "Foreign overwrite" },
    "workspace-a"
  ),
  /another workspace/u
);
assert.equal(
  await removeProduct(env, workspaceB.id, "workspace-a"),
  false
);
assert.equal(
  (await getProductById(env, workspaceB.id, "workspace-b")).name,
  "Default Product"
);

const updatedA = await saveProduct(
  env,
  { ...workspaceA, description: "Updated only in A" },
  "workspace-a"
);
assert.equal(updatedA.workspaceId, "workspace-a");
assert.equal(
  (await getProductById(env, workspaceA.id, "workspace-a")).description,
  "Updated only in A"
);
assert.equal(
  (await getProductById(env, workspaceB.id, "workspace-b")).description,
  "Default description"
);

assert.equal(
  await removeProduct(env, workspaceA.id, "workspace-a"),
  true
);
assert.equal(
  await getProductById(env, workspaceA.id, "workspace-a"),
  null
);
assert.ok(
  (await rawProducts(kv)).some(
    (item) => item.id === workspaceB.id
  )
);

await batchUpsertProducts(
  env,
  [
    {
      productKey: "batch-key",
      name: "Batch A",
      category: "office",
      description: "A value",
      experienceStatus: "used",
      experience: "A experience",
      selectionReason: "A reason",
      price: "10",
      affiliateLink: "",
      affiliateDisclosure: "",
      linkEnabled: "false",
      active: "true",
    },
  ],
  "workspace-a"
);
await batchUpsertProducts(
  env,
  [
    {
      productKey: "batch-key",
      name: "Batch B",
      category: "office",
      description: "B value",
      experienceStatus: "used",
      experience: "B experience",
      selectionReason: "B reason",
      price: "20",
      affiliateLink: "",
      affiliateDisclosure: "",
      linkEnabled: "false",
      active: "true",
    },
  ],
  "workspace-b"
);
const batchUpdate = await batchUpsertProducts(
  env,
  [
    {
      productKey: "batch-key",
      name: "Batch A updated",
      category: "",
      description: "",
      experienceStatus: "",
      experience: "",
      selectionReason: "",
      price: "",
      affiliateLink: "",
      affiliateDisclosure: "",
      linkEnabled: "",
      active: "",
    },
  ],
  "workspace-a"
);
assert.equal(batchUpdate.updated.length, 1);
assert.equal(
  (await getProducts(env, "workspace-a")).find((item) => item.productKey === "batch-key").description,
  "A value"
);
assert.equal(
  (await getProducts(env, "workspace-b")).find((item) => item.productKey === "batch-key").description,
  "B value"
);

const capacityProducts = Array.from(
  { length: 50 },
  (_, index) => product({
    id: `capacity-a-${index}`,
    productKey: `capacity-a-key-${index}`,
    workspaceId: "workspace-capacity-a",
  })
);
const capacityB = product({
  id: "capacity-b",
  productKey: "capacity-b-key",
  workspaceId: "workspace-capacity-b",
});
const { env: capacityEnv, kv: capacityKv } = createEnv([
  ...capacityProducts,
  capacityB,
]);
await saveProduct(
  capacityEnv,
  { name: "Capacity A new", productKey: "capacity-a-new" },
  "workspace-capacity-a"
);
assert.equal(
  (await getProducts(capacityEnv, "workspace-capacity-a")).length,
  50
);
assert.ok(
  (await rawProducts(capacityKv)).some(
    (item) => item.id === "capacity-b"
  )
);

await assert.rejects(
  getProducts(env, ""),
  /Invalid workspace id/u
);
await assert.rejects(
  saveProduct(env, { name: "" })
);

console.log("workspace-aware products fixtures passed");
