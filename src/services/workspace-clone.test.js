import assert from "node:assert/strict";
import test from "node:test";

import { WORKSPACES_KEY } from "./login-foundation.js";
import { listContentPool } from "./content-pool.js";
import { listMedia } from "./media.js";
import { WorkspaceCloneError, cloneWorkspace, preflightWorkspaceClone } from "./workspace-clone.js";

const DESTINATION = "workspace-destination";
const SOURCE_OBJECT_KEY = "media/source-object.jpg";

function json(value) {
  return JSON.parse(JSON.stringify(value));
}

function createFixture({ destinationMedia = false } = {}) {
  const values = new Map();
  const sourceMedia = {
    id: "media-source", mediaKind: "image", sourceType: "general", objectKey: SOURCE_OBJECT_KEY,
    altText: "Source alt", description: "Source description", tags: ["source"], experienceTags: ["morning"], experienceNote: "Source note",
    maxUses: null, usedCount: 2, lastUsedAt: "2026-01-01T00:00:00.000Z", cooldownDays: 1, active: true,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const sourcePool = {
    id: "pool-source", type: "general", mediaIds: [sourceMedia.id], topics: ["daily"], allowedContentTypes: ["everyday"],
    priority: 1, maxUses: null, usedCount: 1, lastUsedAt: "2026-01-01T00:00:00.000Z", cooldownDays: 1, active: true,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
  values.set(WORKSPACES_KEY, JSON.stringify({ version: 1, workspaces: [{ id: DESTINATION, ownerUserId: "user", name: "Destination", active: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }] }));
  values.set("content_media_library", JSON.stringify({ version: 1, records: destinationMedia ? [sourceMedia, { ...sourceMedia, id: "media-destination", workspaceId: DESTINATION, objectKey: "media/destination.jpg" }] : [sourceMedia] }));
  values.set("content_pool", JSON.stringify({ version: 1, items: [sourcePool] }));
  const objects = new Map([[SOURCE_OBJECT_KEY, { body: new TextEncoder().encode("source body"), httpMetadata: { contentType: "image/jpeg" }, customMetadata: { original: "source" } }]]);
  return {
    values, objects,
    env: {
      THREADS_KV: {
        async get(key, type) { const value = values.get(key) ?? null; return type === "json" && value !== null ? JSON.parse(value) : value; },
        async put(key, value) { values.set(key, value); },
      },
      THREADS_MEDIA: {
        async get(key) { const object = objects.get(key); return object ? { body: new Response(object.body.slice()).body, httpMetadata: json(object.httpMetadata), customMetadata: json(object.customMetadata) } : null; },
        async put(key, body, options) { objects.set(key, { body: new Uint8Array(await new Response(body).arrayBuffer()), httpMetadata: json(options.httpMetadata), customMetadata: json(options.customMetadata) }); },
        async head(key) { const object = objects.get(key); return object ? { size: object.body.byteLength } : null; },
        async delete(key) { objects.delete(key); },
      },
    },
  };
}

function options() {
  let index = 0;
  return {
    createId(kind) { index += 1; return `${kind}-clone-${index}`; },
    createObjectKey({ operationId, mediaId }) { return `media/clone/${operationId}/${mediaId}.jpg`; },
  };
}

test("clone copies independent media and general content pool with fresh identities", async () => {
  const fixture = createFixture();
  const result = await cloneWorkspace(fixture.env, { sourceWorkspaceId: "default-workspace", destinationWorkspaceId: DESTINATION }, options());
  assert.equal(result.created.mediaIds.length, 1);
  assert.equal(result.created.contentPoolIds.length, 1);
  assert.equal("productIds" in result.created, false);
  const media = await listMedia(fixture.env, {}, DESTINATION);
  const pool = await listContentPool(fixture.env, {}, DESTINATION);
  assert.equal(media.length, 1);
  assert.equal(media[0].id, result.created.mediaIds[0]);
  assert.equal(media[0].productId, null);
  assert.equal(media[0].objectKey === SOURCE_OBJECT_KEY, false);
  assert.deepEqual(pool[0].mediaIds, [media[0].id]);
  assert.equal(fixture.objects.has(media[0].objectKey), true);
});

test("clone still fails closed when destination media is occupied", async () => {
  const fixture = createFixture({ destinationMedia: true });
  await assert.rejects(
    () => preflightWorkspaceClone(fixture.env, { sourceWorkspaceId: "default-workspace", destinationWorkspaceId: DESTINATION }, options()),
    (error) => error instanceof WorkspaceCloneError && error.code === "workspace_clone_destination_not_empty",
  );
});

console.log("workspace clone fixture passed");
