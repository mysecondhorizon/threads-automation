import assert from "node:assert/strict";
import { handleOperatorProductMedia } from "./api-product-media.js";

function env(authenticated = true) {
  return { THREADS_KV: { async get(key) { return authenticated && key === "admin_session:session-1" ? "valid" : null; } } };
}

function request(method, body, authenticated = true) {
  return new Request("https://example.test/api/products/media", {
    method,
    headers: authenticated ? { cookie: "admin_session=session-1" } : {},
    ...(body === undefined ? {} : { body }),
  });
}

const productImage = {
  id: "product-image-1", sourceType: "product", mediaKind: "image", objectKey: "private/product.jpg",
  description: "제품 이미지", tags: ["제품"], active: true, createdAt: "2026-08-01", updatedAt: "2026-08-02",
};
const generalImage = { ...productImage, id: "general-image-1", sourceType: "general" };
const productVideo = { ...productImage, id: "product-video-1", mediaKind: "video" };

assert.equal((await handleOperatorProductMedia(request("GET", undefined, false), env(false))).status, 401);
let listOptions = null;
const listed = await handleOperatorProductMedia(request("GET"), env(), {
  list: async (_env, options) => { listOptions = options; return [productImage, generalImage, productVideo]; },
});
assert.deepEqual(listOptions, { sourceType: "product" });
const listedBody = await listed.json();
assert.deepEqual(listedBody.media.map((item) => item.id), ["product-image-1"]);
assert.equal(listedBody.media[0].previewUrl, "/media/product-image-1");
assert.equal(Object.hasOwn(listedBody.media[0], "objectKey"), false);

const form = new FormData();
form.append("files", new Blob(["image"], { type: "image/jpeg" }), "product.jpg");
let uploadInput = null;
const uploaded = await handleOperatorProductMedia(request("POST", form), env(), {
  batchUpload: async (_env, input) => {
    uploadInput = input;
    return { results: [{ status: "success", media: productImage }] };
  },
});
assert.equal(uploaded.status, 200);
assert.deepEqual(uploadInput.defaults, {
  sourceType: "product",
  experienceTags: "",
  experienceNote: "",
});
assert.equal(uploadInput.createPoolItems, true);
assert.deepEqual((await uploaded.json()).media[0], {
  id: "product-image-1", kind: "image", description: "제품 이미지", tags: ["제품"], active: true,
  createdAt: "2026-08-01", updatedAt: "2026-08-02", previewUrl: "/media/product-image-1",
});

const hintedForm = new FormData();
hintedForm.append("files", new Blob(["image-a"], { type: "image/jpeg" }), "product-a.jpg");
hintedForm.append("files", new Blob(["image-b"], { type: "image/jpeg" }), "product-b.jpg");
hintedForm.append("experienceTags", "주말, 아이와");
hintedForm.append("experienceNote", "가볍게 들고 오래 걸음.");
let hintedInput = null;
await handleOperatorProductMedia(request("POST", hintedForm), env(), {
  batchUpload: async (_env, input) => {
    hintedInput = input;
    return { results: [
      { status: "success", media: productImage },
      { status: "success", media: productImage },
    ] };
  },
});
assert.equal(hintedInput.files.length, 2);
assert.deepEqual(hintedInput.defaults, {
  sourceType: "product",
  experienceTags: "주말, 아이와",
  experienceNote: "가볍게 들고 오래 걸음.",
});

const videoForm = new FormData();
videoForm.append("files", new Blob(["video"], { type: "video/mp4" }), "product.mp4");
const rejectedVideo = await handleOperatorProductMedia(request("POST", videoForm), env());
assert.equal(rejectedVideo.status, 400);
console.log("operator product media API fixture passed");
