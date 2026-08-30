import assert from "node:assert/strict";
import test from "node:test";

import {
  WORKSPACES_KEY,
} from "./login-foundation.js";
import { getProducts } from "./products.js";
import { listMedia } from "./media.js";
import { listContentPool } from "./content-pool.js";
import {
  WorkspaceCloneError,
  cloneWorkspace,
  preflightWorkspaceClone,
} from "./workspace-clone.js";

const DESTINATION = "workspace-destination";
const SOURCE_OBJECT_KEY = "media/source-object.jpg";
const DESTINATION_PROMPT_KEY = `operator_prompt_profile:v1:${DESTINATION}`;
const NOW = "2026-08-30T00:00:00.000Z";

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function sourceProduct(index = 0) {
  return {
    id: `product-source-${index}`,
    productKey: `source-product-${index}`,
    name: `Source Product ${index}`,
    category: "daily",
    description: "Source description",
    experienceStatus: "confirmed",
    experience: "Source experience",
    selectionReason: "Source reason",
    price: null,
    affiliateLink: "",
    affiliateDisclosure: "",
    linkEnabled: false,
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function sourceMedia() {
  return {
    id: "media-source",
    mediaKind: "image",
    sourceType: "product",
    productId: "product-source-0",
    objectKey: SOURCE_OBJECT_KEY,
    imageUrl: null,
    altText: "Source alt text",
    description: "Source description",
    tags: ["source-tag"],
    experienceTags: ["rainy-day"],
    experienceNote: "Source experience hint",
    maxUses: 4,
    usedCount: 2,
    lastUsedAt: NOW,
    cooldownDays: 3,
    storedContentType: "image/jpeg",
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function sourcePool() {
  return {
    id: "pool-source",
    type: "product",
    mediaIds: ["media-source"],
    productId: "product-source-0",
    topics: ["daily"],
    allowedContentTypes: ["product-connected"],
    priority: 4,
    availableFrom: null,
    availableUntil: null,
    maxUses: 3,
    usedCount: 2,
    lastUsedAt: NOW,
    cooldownDays: 2,
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function destinationWorkspace() {
  return {
    id: DESTINATION,
    ownerUserId: "user-destination",
    name: "Destination",
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createEnv({
  destinationData = null,
  sourceProducts = [sourceProduct()],
  sourceObjectPresent = true,
  sourceBodyReadable = true,
  sourceDisappearsDuringCopy = false,
  failKvKey = null,
} = {}) {
  const events = [];
  const values = new Map();
  const sourceRecords = {
    products: cloneJson(sourceProducts),
    media: [sourceMedia()],
    pool: [sourcePool()],
  };
  values.set(WORKSPACES_KEY, JSON.stringify({ version: 1, workspaces: [destinationWorkspace()] }));
  values.set("operator_prompt_profile:v1", JSON.stringify({
    version: 1,
    updatedAt: NOW,
    profile: { identityWriting: "SOURCE_PERSONA" },
  }));
  values.set("content_products", JSON.stringify({ version: 1, products: sourceRecords.products }));
  values.set("content_media_library", JSON.stringify({ version: 1, records: sourceRecords.media }));
  values.set("content_pool", JSON.stringify({ version: 1, items: sourceRecords.pool }));
  if (destinationData === "prompt") values.set(DESTINATION_PROMPT_KEY, JSON.stringify({ version: 1, profile: {} }));
  if (destinationData === "products") {
    values.set("content_products", JSON.stringify({ version: 1, products: [...sourceRecords.products, { ...sourceProduct(99), id: "product-destination", workspaceId: DESTINATION }] }));
  }
  if (destinationData === "media") {
    values.set("content_media_library", JSON.stringify({ version: 1, records: [...sourceRecords.media, { ...sourceMedia(), id: "media-destination", workspaceId: DESTINATION, objectKey: "media/destination.jpg" }] }));
  }
  if (destinationData === "pool") {
    values.set("content_pool", JSON.stringify({ version: 1, items: [...sourceRecords.pool, { ...sourcePool(), id: "pool-destination", workspaceId: DESTINATION, mediaIds: ["media-destination"], productId: "product-destination" }] }));
  }

  const objects = new Map();
  const stats = { sourceGetCount: 0 };
  if (sourceObjectPresent) {
    objects.set(SOURCE_OBJECT_KEY, {
      bytes: new TextEncoder().encode("source media body"),
      httpMetadata: { contentType: "image/jpeg", cacheControl: "public, max-age=60" },
      customMetadata: { source: "default", capture: "morning" },
    });
  }

  async function bodyBytes(body) {
    return new Uint8Array(await new Response(body).arrayBuffer());
  }

  return {
    values,
    objects,
    events,
    stats,
    sourceRecords,
    env: {
      THREADS_KV: {
        async get(key, type) {
          events.push(`kv:get:${key}`);
          if (key === "product_review_candidates") throw new Error("Product Review store must not be read");
          const value = values.get(key);
          if (value === undefined) return null;
          return type === "json" ? JSON.parse(value) : value;
        },
        async put(key, value) {
          events.push(`kv:put:${key}`);
          if (key === failKvKey) throw new Error("simulated KV write failure");
          values.set(key, value);
        },
        async delete(key) {
          events.push(`kv:delete:${key}`);
          values.delete(key);
        },
      },
      THREADS_MEDIA: {
        async get(key) {
          events.push(`r2:get:${key}`);
          const object = objects.get(key);
          if (!object) return null;
          if (key === SOURCE_OBJECT_KEY) {
            stats.sourceGetCount += 1;
            if (sourceDisappearsDuringCopy && stats.sourceGetCount > 1) return null;
          }
          return {
            body: sourceBodyReadable
              ? new Response(object.bytes.slice()).body
              : new ReadableStream({ start(controller) { controller.error(new Error("unreadable source body")); } }),
            httpMetadata: cloneJson(object.httpMetadata),
            customMetadata: cloneJson(object.customMetadata),
            size: object.bytes.byteLength,
          };
        },
        async put(key, body, options) {
          events.push(`r2:put:${key}`);
          objects.set(key, {
            bytes: await bodyBytes(body),
            httpMetadata: cloneJson(options.httpMetadata || {}),
            customMetadata: cloneJson(options.customMetadata || {}),
          });
          return { size: objects.get(key).bytes.byteLength };
        },
        async head(key) {
          const object = objects.get(key);
          return object ? { size: object.bytes.byteLength } : null;
        },
        async delete(key) {
          events.push(`r2:delete:${key}`);
          objects.delete(key);
        },
      },
    },
  };
}

function deterministicCloneOptions() {
  let sequence = 0;
  return {
    createId(kind) {
      sequence += 1;
      return `${kind}-clone-${sequence}`;
    },
    createObjectKey({ operationId, mediaId }) {
      return `media/clone/${operationId}/${mediaId}.jpg`;
    },
  };
}

function cloneInput() {
  return {
    sourceWorkspaceId: "default-workspace",
    destinationWorkspaceId: DESTINATION,
  };
}

function writeEvents(events) {
  return events.filter((event) => event.includes(":put:") || event.startsWith("r2:put:"));
}

test("clones Default Workspace content with fresh ids, remapped references, and independent R2 objects", async () => {
  const fixture = createEnv();
  const sourceSnapshot = cloneJson(fixture.sourceRecords);
  const result = await cloneWorkspace(fixture.env, cloneInput(), deterministicCloneOptions());

  const products = await getProducts(fixture.env, DESTINATION);
  const media = await listMedia(fixture.env, {}, DESTINATION);
  const pool = await listContentPool(fixture.env, {}, DESTINATION);
  const destinationObject = fixture.objects.get(media[0].objectKey);
  const sourceObject = fixture.objects.get(SOURCE_OBJECT_KEY);

  assert.equal(result.created.promptProfilePersisted, true);
  assert.notEqual(products[0].id, "product-source-0");
  assert.equal(products[0].productKey, "source-product-0");
  assert.notEqual(media[0].id, "media-source");
  assert.notEqual(media[0].objectKey, SOURCE_OBJECT_KEY);
  assert.equal(media[0].productId, products[0].id);
  assert.deepEqual(media[0].experienceTags, ["rainy-day"]);
  assert.equal(media[0].experienceNote, "Source experience hint");
  assert.equal(media[0].usedCount, 0);
  assert.equal(media[0].lastUsedAt, null);
  assert.notEqual(pool[0].id, "pool-source");
  assert.equal(pool[0].productId, products[0].id);
  assert.deepEqual(pool[0].mediaIds, [media[0].id]);
  assert.equal(pool[0].usedCount, 0);
  assert.equal(pool[0].lastUsedAt, null);
  assert.deepEqual([...destinationObject.bytes], [...new TextEncoder().encode("source media body")]);
  assert.deepEqual(destinationObject.httpMetadata, { contentType: "image/jpeg", cacheControl: "public, max-age=60" });
  assert.deepEqual(destinationObject.customMetadata, { source: "default", capture: "morning" });
  assert.deepEqual([...sourceObject.bytes], [...new TextEncoder().encode("source media body")]);
  assert.deepEqual(sourceObject.httpMetadata, { contentType: "image/jpeg", cacheControl: "public, max-age=60" });
  assert.deepEqual(sourceObject.customMetadata, { source: "default", capture: "morning" });
  assert.equal(JSON.parse(fixture.values.get(DESTINATION_PROMPT_KEY)).profile.identityWriting, "SOURCE_PERSONA");
  assert.deepEqual(fixture.sourceRecords, sourceSnapshot);
  assert.equal(fixture.events.some((event) => event.includes("product_review_candidates")), false);

  const firstWrite = fixture.events.findIndex((event) => event.includes(":put:") || event.startsWith("r2:put:"));
  assert.ok(firstWrite > fixture.events.indexOf(`r2:get:${SOURCE_OBJECT_KEY}`));
  assert.equal(fixture.stats.sourceGetCount, 2);
});

test("preflight validates each R2 body without retaining it in the clone plan", async () => {
  const fixture = createEnv();
  const plan = await preflightWorkspaceClone(fixture.env, cloneInput(), deterministicCloneOptions());

  assert.equal(Object.hasOwn(plan.media[0], "sourceObject"), false);
  assert.equal(Object.hasOwn(plan.media[0], "body"), false);
  assert.deepEqual(plan.media[0].httpMetadata, { contentType: "image/jpeg", cacheControl: "public, max-age=60" });
  assert.deepEqual(plan.media[0].customMetadata, { source: "default", capture: "morning" });
  assert.equal(fixture.stats.sourceGetCount, 1);
  assert.deepEqual(writeEvents(fixture.events), []);
});

test("destination data in any cloneable store fails closed before writes", async () => {
  for (const destinationData of ["prompt", "products", "media", "pool"]) {
    const fixture = createEnv({ destinationData });
    await assert.rejects(
      () => cloneWorkspace(fixture.env, cloneInput(), deterministicCloneOptions()),
      (error) => error instanceof WorkspaceCloneError && error.code === "workspace_clone_destination_not_empty",
    );
    assert.deepEqual(writeEvents(fixture.events), []);
  }
});

test("source limits and missing source objects fail before destination writes", async () => {
  const overLimit = createEnv({ sourceProducts: Array.from({ length: 51 }, (_, index) => sourceProduct(index)) });
  await assert.rejects(() => cloneWorkspace(overLimit.env, cloneInput(), deterministicCloneOptions()));
  assert.deepEqual(writeEvents(overLimit.events), []);

  const missingObject = createEnv({ sourceObjectPresent: false });
  await assert.rejects(() => cloneWorkspace(missingObject.env, cloneInput(), deterministicCloneOptions()));
  assert.deepEqual(writeEvents(missingObject.events), []);

  const unreadableObject = createEnv({ sourceBodyReadable: false });
  await assert.rejects(() => cloneWorkspace(unreadableObject.env, cloneInput(), deterministicCloneOptions()));
  assert.deepEqual(writeEvents(unreadableObject.events), []);
});

test("a source object disappearing after preflight is a sanitized partial failure", async () => {
  const fixture = createEnv({ sourceDisappearsDuringCopy: true });
  let partial;
  await assert.rejects(
    () => cloneWorkspace(fixture.env, cloneInput(), deterministicCloneOptions()),
    (error) => {
      partial = error;
      return error instanceof WorkspaceCloneError && error.code === "workspace_clone_partial";
    },
  );

  assert.equal(partial.stage, "r2_copy");
  assert.equal(partial.created.promptProfilePersisted, true);
  assert.deepEqual(partial.created.objectKeys, []);
  assert.equal(fixture.stats.sourceGetCount, 2);
  assert.equal(fixture.events.some((event) => event.startsWith("r2:put:")), false);
});

test("partial post-write failure reports created resources and makes a rerun fail closed", async () => {
  const fixture = createEnv({ failKvKey: "content_products" });
  let partial;
  await assert.rejects(
    () => cloneWorkspace(fixture.env, cloneInput(), deterministicCloneOptions()),
    (error) => {
      partial = error;
      return error instanceof WorkspaceCloneError && error.code === "workspace_clone_partial";
    },
  );

  assert.equal(partial.stage, "products");
  assert.equal(partial.created.promptProfilePersisted, true);
  assert.equal(partial.created.objectKeys.length, 1);
  assert.deepEqual(partial.created.productIds, []);
  await assert.rejects(
    () => cloneWorkspace(fixture.env, cloneInput(), deterministicCloneOptions()),
    (error) => error instanceof WorkspaceCloneError && error.code === "workspace_clone_destination_not_empty",
  );
});
