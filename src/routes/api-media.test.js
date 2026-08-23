import assert from "node:assert/strict";
import {
  handleOperatorMediaById,
  handleOperatorMediaCollection,
} from "./api-media.js";
import { handleOperatorMediaUpload } from "./api-media-upload.js";

function env(authenticated = true) {
  return {
    THREADS_KV: {
      async get(key) { return authenticated && key === "admin_session:session-1" ? "valid" : null; },
    },
  };
}

function request(url, method = "GET", body, authenticated = true) {
  return new Request(url, {
    method,
    headers: {
      ...(authenticated ? { cookie: "admin_session=session-1" } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const image = {
  id: "image-1", mediaKind: "image", sourceType: "general", objectKey: "private/key.jpg",
  description: "사진 설명", tags: ["일상"], active: true,
  createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
};
const video = { ...image, id: "video-1", mediaKind: "video" };
const product = { ...image, id: "product-1", sourceType: "product" };

const unauthorized = await handleOperatorMediaCollection(request("https://example.test/api/media", "GET", undefined, false), env(false));
assert.equal(unauthorized.status, 401);
let listOptions = null;
const listed = await handleOperatorMediaCollection(request("https://example.test/api/media", "GET", undefined, true), env(), {
  list: async (_env, options) => { listOptions = options; return [image, video, product]; },
});
const listedMedia = (await listed.json()).media;
assert.deepEqual(listOptions, { sourceType: "general" });
assert.equal(listedMedia.length, 2);
assert.equal(listedMedia[0].previewUrl, "/media/image-1");
assert.equal(listedMedia[1].previewUrl, "/media/video-1");
assert.equal(Object.hasOwn(listedMedia[0], "objectKey"), false);

const updated = await handleOperatorMediaById(request("https://example.test/api/media/image-1", "PATCH", { description: "수정", tags: ["태그", "태그"], active: false }), env(), "image-1", {
  get: async () => image,
  update: async (_env, id, value) => ({ ...image, id, ...value }),
});
assert.deepEqual((await updated.json()).media.tags, ["태그"]);
const protectedField = await handleOperatorMediaById(request("https://example.test/api/media/image-1", "PATCH", { objectKey: "no" }), env(), "image-1", { get: async () => image });
assert.equal(protectedField.status, 400);
const malformedTags = await handleOperatorMediaById(request("https://example.test/api/media/image-1", "PATCH", { tags: "no" }), env(), "image-1", { get: async () => image });
assert.equal(malformedTags.status, 400);
const unknown = await handleOperatorMediaById(request("https://example.test/api/media/no", "PATCH", { active: false }), env(), "no", { get: async () => null });
assert.equal(unknown.status, 404);
const productPatch = await handleOperatorMediaById(request("https://example.test/api/media/product-1", "PATCH", { active: false }), env(), "product-1", { get: async () => product });
assert.equal(productPatch.status, 404);

const uploadForm = new FormData();
uploadForm.append("files", new Blob(["image"], { type: "image/jpeg" }), "photo.jpg");
const uploadRequest = new Request("https://example.test/api/media/upload", { method: "POST", headers: { cookie: "admin_session=session-1" }, body: uploadForm });
let uploadInput = null;
const upload = await handleOperatorMediaUpload(uploadRequest, env(), {
  batchUpload: async (_env, input) => {
    uploadInput = input;
    return { results: [{ fileName: "photo.jpg", status: "success", media: image }] };
  },
});
assert.equal(upload.status, 200);
assert.equal(uploadInput.defaults.sourceType, "general");
assert.equal(uploadInput.createPoolItems, true);
assert.equal((await upload.json()).results[0].media.previewUrl, "/media/image-1");

const videoUploadForm = new FormData();
videoUploadForm.append("files", new Blob(["video"], { type: "video/mp4" }), "clip.mp4");
let videoUploadInput = null;
const videoUpload = await handleOperatorMediaUpload(
  new Request("https://example.test/api/media/upload", { method: "POST", headers: { cookie: "admin_session=session-1" }, body: videoUploadForm }),
  env(),
  {
    batchUpload: async (_env, input) => {
      videoUploadInput = input;
      return { results: [{ fileName: "clip.mp4", status: "success", media: video }] };
    },
  }
);
assert.equal(videoUpload.status, 200);
assert.equal(videoUploadInput.files[0].type, "video/mp4");
assert.equal(videoUploadInput.defaults.sourceType, "general");
assert.equal((await videoUpload.json()).results[0].media.kind, "video");

const unauthenticatedUpload = await handleOperatorMediaUpload(
  new Request("https://example.test/api/media/upload", { method: "POST", body: new FormData() }),
  env(false)
);
assert.equal(unauthenticatedUpload.status, 401);
console.log("operator media API fixture passed");
