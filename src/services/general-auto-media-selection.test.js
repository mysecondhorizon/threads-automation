import assert from "node:assert/strict";

import {
  selectGeneralAutoMedia,
} from "./general-auto-media-selection.js";

const scopes = [];

function pool(workspaceId) {
  return [{
    id: `pool-${workspaceId}`,
    type: "general",
    mediaIds: [`media-${workspaceId}`],
    topics: ["commute"],
    allowedContentTypes: [],
    priority: 1,
    maxUses: 1,
    usedCount: 0,
    cooldownDays: 0,
    active: true,
  }];
}

function media(workspaceId) {
  return [{
    id: `media-${workspaceId}`,
    sourceType: "general",
    productId: null,
    tags: ["commute"],
    active: true,
    maxUses: 1,
    usedCount: 0,
    cooldownDays: 0,
  }];
}

const selection = await selectGeneralAutoMedia(
  {},
  {
    workspaceId: "workspace-a",
    generatedPost: { topic: "commute", contentType: "TEXT" },
  },
  {
    readContentPool: async (_env, _filters, workspaceId) => {
      scopes.push({ service: "pool", workspaceId });
      return pool(workspaceId);
    },
    readMedia: async (_env, _filters, workspaceId) => {
      scopes.push({ service: "media", workspaceId });
      return media(workspaceId);
    },
  }
);

assert.equal(selection.mode, "IMAGE");
assert.equal(selection.contentPoolId, "pool-workspace-a");
assert.equal(selection.mediaId, "media-workspace-a");
assert.deepEqual(scopes, [
  { service: "pool", workspaceId: "workspace-a" },
  { service: "media", workspaceId: "workspace-a" },
]);

console.log("workspace-aware General AUTO media selection fixtures passed");
