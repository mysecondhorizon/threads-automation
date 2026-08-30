import { getWorkspaceById } from "./login-foundation.js";
import {
  getEffectivePromptProfile,
  hasPersistedPromptProfile,
  updatePromptProfile,
} from "./prompt-profile.js";
import { getProducts, saveProduct, validateProductInput } from "./products.js";
import { createMedia, listMedia } from "./media.js";
import { getMediaObject, putMediaObject } from "./media-storage.js";
import { createContentPoolItem, listContentPool } from "./content-pool.js";
import { DEFAULT_WORKSPACE_ID } from "./workspace-foundation.js";

const LIMITS = Object.freeze({ products: 50, media: 500, contentPool: 1000 });

export class WorkspaceCloneError extends Error {
  constructor(message, {
    code = "workspace_clone_failed",
    stage = "preflight",
    created = null,
  } = {}) {
    super(message);
    this.name = "WorkspaceCloneError";
    this.code = code;
    this.stage = stage;
    this.created = created;
  }
}

function fail(message, code, stage = "preflight") {
  throw new WorkspaceCloneError(message, { code, stage });
}

function defaultId(kind) {
  return `${kind}_${globalThis.crypto.randomUUID()}`;
}

function requireFreshId(value, kind, usedIds, sourceId) {
  const id = String(value || "").trim();
  if (!id || id === sourceId || usedIds.has(id)) {
    fail("Workspace clone could not allocate a fresh identifier", "workspace_clone_id_invalid");
  }
  usedIds.add(id);
  return id;
}

function cloneInput(record, overrides) {
  const input = { ...record, ...overrides };
  delete input.workspaceId;
  delete input.createdAt;
  delete input.updatedAt;
  return input;
}

function copyCreated(created) {
  return {
    promptProfilePersisted: created.promptProfilePersisted,
    productIds: [...created.productIds],
    mediaIds: [...created.mediaIds],
    contentPoolIds: [...created.contentPoolIds],
    objectKeys: [...created.objectKeys],
  };
}

function validateWorkspacePair(source, destination) {
  if (!source || !source.active) {
    fail("Source Workspace is unavailable", "workspace_clone_source_unavailable");
  }
  if (!destination || !destination.active) {
    fail("Destination Workspace is unavailable", "workspace_clone_destination_unavailable");
  }
  if (
    destination.id === DEFAULT_WORKSPACE_ID ||
    destination.id === source.id
  ) {
    fail("Destination Workspace is invalid", "workspace_clone_destination_invalid");
  }
}

function validateDestinationEmpty(destinationState) {
  if (
    destinationState.promptProfilePersisted ||
    destinationState.products.length ||
    destinationState.media.length ||
    destinationState.contentPool.length
  ) {
    fail("Destination Workspace must be empty before cloning", "workspace_clone_destination_not_empty");
  }
}

function validateSourceLimits(sourceState) {
  if (
    sourceState.products.length > LIMITS.products ||
    sourceState.media.length > LIMITS.media ||
    sourceState.contentPool.length > LIMITS.contentPool
  ) {
    fail("Source Workspace exceeds a cloneable store limit", "workspace_clone_source_limit_exceeded");
  }
}

function prepareProductPlan(products, allocateId) {
  const usedIds = new Set();
  const productIdMap = new Map();
  const plan = products.map((product) => {
    const id = requireFreshId(allocateId("product", product.id), "product", usedIds, product.id);
    const input = cloneInput(product, { id });
    validateProductInput(input);
    productIdMap.set(product.id, id);
    return { id, input };
  });
  return { plan, productIdMap };
}

function prepareMediaPlan(mediaRecords, productIdMap, operationId, allocateId, createObjectKey) {
  const usedIds = new Set();
  const usedObjectKeys = new Set();
  const mediaIdMap = new Map();
  const plan = mediaRecords.map((media) => {
    const id = requireFreshId(allocateId("media", media.id), "media", usedIds, media.id);
    const productId = media.productId === null || media.productId === undefined
      ? null
      : productIdMap.get(media.productId);
    if (media.productId && !productId) {
      fail("Media references a Product outside the source Workspace", "workspace_clone_media_product_missing");
    }
    const objectKey = String(createObjectKey({ operationId, mediaId: id, source: media }) || "").trim();
    if (!objectKey || objectKey === media.objectKey || usedObjectKeys.has(objectKey)) {
      fail("Workspace clone could not allocate a fresh media object key", "workspace_clone_object_key_invalid");
    }
    usedObjectKeys.add(objectKey);
    mediaIdMap.set(media.id, id);
    return {
      id,
      objectKey,
      input: cloneInput(media, {
        productId,
        objectKey,
        usedCount: 0,
        lastUsedAt: null,
      }),
      sourceObjectKey: media.objectKey,
      sourceMediaId: media.id,
    };
  });
  return { plan, mediaIdMap };
}

function prepareContentPoolPlan(items, productIdMap, mediaIdMap, allocateId) {
  const usedIds = new Set();
  const contentPoolIdMap = new Map();
  const plan = items.map((item) => {
    const id = requireFreshId(allocateId("content_pool", item.id), "content_pool", usedIds, item.id);
    const mediaIds = item.mediaIds.map((mediaId) => mediaIdMap.get(mediaId));
    if (mediaIds.some((mediaId) => !mediaId)) {
      fail("Content Pool references Media outside the source Workspace", "workspace_clone_pool_media_missing");
    }
    const productId = item.productId === null || item.productId === undefined
      ? null
      : productIdMap.get(item.productId);
    if (item.productId && !productId) {
      fail("Content Pool references a Product outside the source Workspace", "workspace_clone_pool_product_missing");
    }
    contentPoolIdMap.set(item.id, id);
    return {
      id,
      input: cloneInput(item, {
        productId,
        mediaIds,
        usedCount: 0,
        lastUsedAt: null,
      }),
    };
  });
  return { plan, contentPoolIdMap };
}

export async function preflightWorkspaceClone(
  env,
  { sourceWorkspaceId, destinationWorkspaceId },
  {
    createId = defaultId,
    createObjectKey = ({ operationId, mediaId }) => `media/clone/${operationId}/${mediaId}`,
  } = {},
) {
  try {
    const [sourceWorkspace, destinationWorkspace] = await Promise.all([
      getWorkspaceById(env, sourceWorkspaceId),
      getWorkspaceById(env, destinationWorkspaceId),
    ]);
    validateWorkspacePair(sourceWorkspace, destinationWorkspace);

    const [promptProfilePersisted, destinationProducts, destinationMedia, destinationContentPool] = await Promise.all([
      hasPersistedPromptProfile(env, destinationWorkspace.id),
      getProducts(env, destinationWorkspace.id),
      listMedia(env, {}, destinationWorkspace.id),
      listContentPool(env, {}, destinationWorkspace.id),
    ]);
    validateDestinationEmpty({
      promptProfilePersisted,
      products: destinationProducts,
      media: destinationMedia,
      contentPool: destinationContentPool,
    });

    const [promptProfile, products, media, contentPool] = await Promise.all([
      getEffectivePromptProfile(env, sourceWorkspace.id),
      getProducts(env, sourceWorkspace.id),
      listMedia(env, {}, sourceWorkspace.id),
      listContentPool(env, {}, sourceWorkspace.id),
    ]);
    validateSourceLimits({ products, media, contentPool });

    const operationId = requireFreshId(createId("workspace_clone"), "workspace_clone", new Set(), null);
    const productsPlan = prepareProductPlan(products, createId);
    const mediaPlan = prepareMediaPlan(
      media,
      productsPlan.productIdMap,
      operationId,
      createId,
      createObjectKey,
    );
    const contentPoolPlan = prepareContentPoolPlan(
      contentPool,
      productsPlan.productIdMap,
      mediaPlan.mediaIdMap,
      createId,
    );

    for (const mediaItem of mediaPlan.plan) {
      const sourceObject = await getMediaObject(env, mediaItem.sourceObjectKey);
      if (!sourceObject || sourceObject.body === null || sourceObject.body === undefined) {
        fail("Source media object is unavailable", "workspace_clone_source_object_missing");
      }
      mediaItem.sourceObject = {
        body: await new Response(sourceObject.body).arrayBuffer(),
        httpMetadata: sourceObject.httpMetadata,
        customMetadata: sourceObject.customMetadata,
      };
    }

    return Object.freeze({
      operationId,
      sourceWorkspace,
      destinationWorkspace,
      promptProfile: promptProfile.profile,
      products: productsPlan.plan,
      media: mediaPlan.plan,
      contentPool: contentPoolPlan.plan,
      productIdMap: productsPlan.productIdMap,
      mediaIdMap: mediaPlan.mediaIdMap,
      contentPoolIdMap: contentPoolPlan.contentPoolIdMap,
    });
  } catch (error) {
    if (error instanceof WorkspaceCloneError) throw error;
    throw new WorkspaceCloneError("Workspace clone preflight failed", {
      code: "workspace_clone_preflight_failed",
    });
  }
}

export async function cloneWorkspace(env, input, options = {}) {
  const plan = await preflightWorkspaceClone(env, input, options);
  const created = {
    promptProfilePersisted: false,
    productIds: [],
    mediaIds: [],
    contentPoolIds: [],
    objectKeys: [],
  };
  let stage = "prompt_profile";

  try {
    // Persisting the independent profile first makes every post-write failure fail-closed on rerun.
    await updatePromptProfile(env, plan.promptProfile, plan.destinationWorkspace.id);
    created.promptProfilePersisted = true;

    stage = "r2_copy";
    for (const mediaItem of plan.media) {
      await putMediaObject(env, mediaItem.objectKey, mediaItem.sourceObject.body, {
        httpMetadata: mediaItem.sourceObject.httpMetadata,
        customMetadata: mediaItem.sourceObject.customMetadata,
      });
      created.objectKeys.push(mediaItem.objectKey);
    }

    stage = "products";
    for (const product of plan.products) {
      await saveProduct(env, product.input, plan.destinationWorkspace.id);
      created.productIds.push(product.id);
    }

    stage = "media";
    for (const mediaItem of plan.media) {
      await createMedia(
        env,
        mediaItem.input,
        plan.destinationWorkspace.id,
        { id: mediaItem.id },
      );
      created.mediaIds.push(mediaItem.id);
    }

    stage = "content_pool";
    for (const item of plan.contentPool) {
      await createContentPoolItem(
        env,
        item.input,
        plan.destinationWorkspace.id,
        { id: item.id },
      );
      created.contentPoolIds.push(item.id);
    }
  } catch {
    throw new WorkspaceCloneError("Workspace clone stopped after destination writes began", {
      code: "workspace_clone_partial",
      stage,
      created: copyCreated(created),
    });
  }

  return Object.freeze({
    sourceWorkspaceId: plan.sourceWorkspace.id,
    destinationWorkspaceId: plan.destinationWorkspace.id,
    operationId: plan.operationId,
    created: copyCreated(created),
  });
}
