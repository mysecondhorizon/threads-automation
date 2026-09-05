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
assert.deepEqual(experienceTagSelection.generationMediaContext, {
  semanticCues:["commute", "coffee"],
  experienceTags:["commute", "coffee"],
  experienceNote:null,
});

const experienceNoteSelection = selectFromRecords(
  [poolItem("pool-note-match", "media-note-match"), poolItem("pool-note-other", "media-note-other")],
  [dailyMedia("media-note-match", { experienceNote:"commute coffee office routine" }), dailyMedia("media-note-other")]
);
assert.equal(experienceNoteSelection.mediaId, "media-note-match");
assert.deepEqual(experienceNoteSelection.generationMediaContext, {
  semanticCues:["commute coffee office routine"],
  experienceTags:[],
  experienceNote:"commute coffee office routine",
});

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

const videoSelection = selectFromRecords(
  [poolItem("pool-video", "media-video")],
  [dailyMedia("media-video", { mediaKind:"video", tags:["commute", "coffee"], experienceNote:"quiet cafe commute stop" })]
);
assert.equal(videoSelection.mode, "VIDEO");
assert.equal(videoSelection.mediaId, "media-video");
assert.equal(videoSelection.generationMediaContext.experienceNote, "quiet cafe commute stop");

const higherRelevanceImage = selectFromRecords(
  [poolItem("pool-image-best", "media-image-best"), poolItem("pool-video", "media-video")],
  [dailyMedia("media-image-best", { tags:["commute", "coffee"] }), dailyMedia("media-video", { mediaKind:"video", tags:["commute"] })]
);
assert.equal(higherRelevanceImage.mode, "IMAGE");
assert.equal(higherRelevanceImage.mediaId, "media-image-best");

const unavailableVideo = selectFromRecords(
  [poolItem("pool-video-inactive", "media-video-inactive")],
  [dailyMedia("media-video-inactive", { mediaKind:"video", tags:["commute"], active:false })]
);
assert.equal(unavailableVideo.mode, "TEXT");

const irrelevantVideo = selectGeneralAutoMediaFromRecords({
  poolItems:[{ ...poolItem("pool-irrelevant-video", "media-irrelevant-video"), topics:["beach vacation"] }],
  mediaRecords:[dailyMedia("media-irrelevant-video", { mediaKind:"video", tags:["beach", "vacation"] })],
  generatedPost:{ topic:"office commute", contentType:"TEXT" },
  currentTopic:{ subject:"office commute" },
  at:new Date("2026-09-01T00:00:00.000Z"),
});
assert.equal(irrelevantVideo.mode, "TEXT");

const kiafRestaurantMismatch = selectGeneralAutoMediaFromRecords({
  poolItems:[{ ...poolItem("pool-kiaf", "media-suntory"), topics:["KIAF art exhibition"] }],
  mediaRecords:[dailyMedia("media-suntory", {
    tags:["restaurant", "bar"],
    description:"bright open kitchen with draft beer taps and SUNTORY signage",
    experienceTags:["Dongtan", "restaurant", "suntory"],
  })],
  generatedPost:{ topic:"KIAF September art exhibition", contentType:"TEXT" },
  currentTopic:{ subject:"KIAF September art exhibition" },
  at:new Date("2026-09-01T00:00:00.000Z"),
});
assert.equal(kiafRestaurantMismatch.mode, "TEXT");
assert.equal(kiafRestaurantMismatch.reason, "no_compatible_media");

const exhibitionGalleryMatch = selectGeneralAutoMediaFromRecords({
  poolItems:[{ ...poolItem("pool-exhibition", "media-gallery"), topics:["art exhibition"] }],
  mediaRecords:[dailyMedia("media-gallery", {
    tags:["art", "exhibition", "gallery"],
    description:"gallery exhibition interior",
  })],
  generatedPost:{ topic:"KIAF art exhibition", contentType:"TEXT" },
  currentTopic:{ subject:"KIAF art exhibition" },
  at:new Date("2026-09-01T00:00:00.000Z"),
});
assert.equal(exhibitionGalleryMatch.mode, "IMAGE");

const beerBarMatch = selectGeneralAutoMediaFromRecords({
  poolItems:[{ ...poolItem("pool-beer", "media-suntory-bar"), topics:["after work beer"] }],
  mediaRecords:[dailyMedia("media-suntory-bar", {
    description:"draft beer taps at a SUNTORY bar",
    experienceTags:["beer", "bar"],
  })],
  generatedPost:{ topic:"after work beer", contentType:"TEXT" },
  currentTopic:{ subject:"after work beer" },
  at:new Date("2026-09-01T00:00:00.000Z"),
});
assert.equal(beerBarMatch.mode, "IMAGE");

const dongtanDiningMatch = selectGeneralAutoMediaFromRecords({
  poolItems:[{ ...poolItem("pool-dongtan", "media-dongtan"), topics:["Dongtan dining"] }],
  mediaRecords:[dailyMedia("media-dongtan", {
    description:"Dongtan restaurant kitchen",
    experienceTags:["Dongtan", "dining"],
  })],
  generatedPost:{ topic:"Dongtan dining", contentType:"TEXT" },
  currentTopic:{ subject:"Dongtan dining" },
  at:new Date("2026-09-01T00:00:00.000Z"),
});
assert.equal(dongtanDiningMatch.mode, "IMAGE");

const incompatibleImage = selectGeneralAutoMediaFromRecords({
  poolItems:[{ ...poolItem("pool-image-mismatch", "media-image-mismatch"), topics:["art exhibition"] }],
  mediaRecords:[dailyMedia("media-image-mismatch", { tags:["beach", "vacation"] })],
  generatedPost:{ topic:"art exhibition", contentType:"TEXT" },
  currentTopic:{ subject:"art exhibition" },
  at:new Date("2026-09-01T00:00:00.000Z"),
});
assert.equal(incompatibleImage.mode, "TEXT");

const relevantVideo = selectGeneralAutoMediaFromRecords({
  poolItems:[{ ...poolItem("pool-gallery-video", "media-gallery-video"), topics:["art exhibition"] }],
  mediaRecords:[dailyMedia("media-gallery-video", {
    mediaKind:"video",
    tags:["art", "exhibition", "gallery"],
    experienceNote:"gallery exhibition space",
  })],
  generatedPost:{ topic:"art exhibition", contentType:"TEXT" },
  currentTopic:{ subject:"art exhibition" },
  at:new Date("2026-09-01T00:00:00.000Z"),
});
assert.equal(relevantVideo.mode, "VIDEO");

console.log("workspace-aware General AUTO media selection fixtures passed");
