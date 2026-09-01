import assert from "node:assert/strict";

import {
  selectGeneralAutoMedia,
  selectGeneralAutoMediaFromRecords,
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

function selectFromRecords(poolItems, mediaRecords) {
  return selectGeneralAutoMediaFromRecords({
    poolItems,
    mediaRecords,
    generatedPost: { topic: "commute coffee", contentType: "TEXT" },
    currentTopic: { subject: "commute coffee" },
    at: new Date("2026-09-01T00:00:00.000Z"),
  });
}

function poolItem(id, mediaId) {
  return {
    id,
    type: "general",
    mediaIds: [mediaId],
    topics: ["commute coffee"],
    priority: 1,
    maxUses: null,
    usedCount: 0,
    cooldownDays: 0,
    active: true,
  };
}

function dailyMedia(id, overrides = {}) {
  return {
    id,
    sourceType: "general",
    tags: [],
    active: true,
    maxUses: null,
    usedCount: 1,
    cooldownDays: 0,
    ...overrides,
  };
}

const experienceTagSelection = selectFromRecords(
  [poolItem("pool-tag-match", "media-tag-match"), poolItem("pool-tag-other", "media-tag-other")],
  [dailyMedia("media-tag-match", { experienceTags:["commute", "coffee"] }), dailyMedia("media-tag-other")]
);
assert.equal(experienceTagSelection.mediaId, "media-tag-match");

const experienceNoteSelection = selectFromRecords(
  [poolItem("pool-note-match", "media-note-match"), poolItem("pool-note-other", "media-note-other")],
  [dailyMedia("media-note-match", { experienceNote:"commute coffee office routine" }), dailyMedia("media-note-other")]
);
assert.equal(experienceNoteSelection.mediaId, "media-note-match");

const existingSignalSelection = selectFromRecords(
  [poolItem("pool-existing", "media-existing"), poolItem("pool-unrelated-experience", "media-unrelated-experience")],
  [dailyMedia("media-existing", { tags:["commute"] }), dailyMedia("media-unrelated-experience", { experienceTags:["beach", "vacation"] })]
);
assert.equal(existingSignalSelection.mediaId, "media-existing");

const noExperienceSelection = selectFromRecords(
  [poolItem("pool-no-experience", "media-no-experience")],
  [dailyMedia("media-no-experience", { tags:["commute"] })]
);
assert.equal(noExperienceSelection.mediaId, "media-no-experience");

const eligibilitySelection = selectFromRecords(
  [poolItem("pool-inactive", "media-inactive"), poolItem("pool-cooldown", "media-cooldown"), poolItem("pool-max", "media-max"), poolItem("pool-available", "media-available")],
  [
    dailyMedia("media-inactive", { tags:["commute"], active:false }),
    dailyMedia("media-cooldown", { tags:["commute"], cooldownDays:1, lastUsedAt:"2026-08-31T12:00:00.000Z" }),
    dailyMedia("media-max", { tags:["commute"], maxUses:1, usedCount:1 }),
    dailyMedia("media-available", { tags:["commute"], maxUses:null, usedCount:2 }),
  ]
);
assert.equal(eligibilitySelection.mediaId, "media-available");

const productAssetSelection = selectFromRecords(
  [poolItem("pool-daily", "media-daily"), poolItem("pool-product", "media-product")],
  [dailyMedia("media-daily", { tags:["commute"] }), dailyMedia("media-product", { sourceType:"product", tags:["commute", "coffee"], experienceTags:["commute", "coffee"] })]
);
assert.equal(productAssetSelection.mediaId, "media-daily");

console.log("workspace-aware General AUTO media selection fixtures passed");
