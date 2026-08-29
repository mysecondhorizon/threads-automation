import assert from "node:assert/strict";
import {
  mergeMediaMetadata,
  mergeVideoMediaMetadata,
} from "./media-batch.js";

const input = {
  tags: ["사용자 기존 태그"],
  description: "사용자 기존 설명",
  experienceTags: ["출근길", "비 오는 날"],
  experienceNote: "비 오는 날 출퇴근할 때 사용.",
};
const vision = {
  tags: ["관찰 태그"],
  topics: ["관찰 주제"],
  altText: "관찰 alt",
  description: "관찰 설명",
  sceneType: "거리",
  usableAngles: ["전면"],
  peoplePresent: false,
  textPresent: false,
  brandVisible: false,
};

const image = mergeMediaMetadata(input, vision);
assert.deepEqual(image.experienceTags, input.experienceTags);
assert.equal(image.experienceNote, input.experienceNote);

const video = mergeVideoMediaMetadata(input, vision, {
  sourceDurationSeconds: 12,
  clipStartSeconds: 1,
  clipDurationSeconds: 6,
});
assert.deepEqual(video.experienceTags, input.experienceTags);
assert.equal(video.experienceNote, input.experienceNote);
assert.deepEqual(video.tags, vision.tags);
assert.equal(video.description, vision.description);
console.log("media batch experience metadata fixture passed");
