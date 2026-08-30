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
const catalogProduct = { id: "catalog-product-1", name: "Catalog Product", productKey: "catalog-product" };
const linkedProductMedia = { ...product, id: "product-linked", productId: catalogProduct.id };
const staleProductMedia = { ...product, id: "product-stale", productId: "missing-product" };

const unauthorized = await handleOperatorMediaCollection(request("https://example.test/api/media", "GET", undefined, false), env(false));
assert.equal(unauthorized.status, 401);
let listOptions = null;
const listed = await handleOperatorMediaCollection(request("https://example.test/api/media", "GET", undefined, true), env(), {
  list: async (_env, options) => { listOptions = options; return [image, video, product, linkedProductMedia, staleProductMedia]; },
  products: async () => [catalogProduct],
});
const listedBody = await listed.json();
const listedMedia = listedBody.media;
assert.deepEqual(listOptions, {});
assert.equal(listedMedia.length, 5);
assert.equal(listedMedia[0].previewUrl, "/media/image-1");
assert.equal(listedMedia[1].previewUrl, "/media/video-1");
assert.equal(listedMedia[2].sourceType, "product");
assert.equal(listedMedia[2].linkedProduct, null);
assert.deepEqual(listedMedia[3].linkedProduct, catalogProduct);
assert.deepEqual(listedMedia[4].linkedProduct, { id: "missing-product", missing: true });
assert.deepEqual(listedBody.products, [catalogProduct]);
assert.deepEqual(listedMedia[0].experienceTags, []);
assert.equal(listedMedia[0].experienceNote, "");
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
const malformedExperienceTags = await handleOperatorMediaById(request("https://example.test/api/media/image-1", "PATCH", { experienceTags: "no" }), env(), "image-1", { get: async () => image });
assert.equal(malformedExperienceTags.status, 400);
const malformedExperienceNote = await handleOperatorMediaById(request("https://example.test/api/media/image-1", "PATCH", { experienceNote: ["no"] }), env(), "image-1", { get: async () => image });
assert.equal(malformedExperienceNote.status, 400);
const unknown = await handleOperatorMediaById(request("https://example.test/api/media/no", "PATCH", { active: false }), env(), "no", { get: async () => null });
assert.equal(unknown.status, 404);
let productUpdate = null;
const productPatch = await handleOperatorMediaById(request("https://example.test/api/media/product-1", "PATCH", {
  experienceTags: ["with-family"],
  experienceNote: "Product media note",
}), env(), "product-1", {
  get: async () => product,
  update: async (_env, id, value) => {
    productUpdate = value;
    return { ...product, id, ...value };
  },
});
assert.equal(productPatch.status, 200);
assert.deepEqual(productUpdate, {
  experienceTags: ["with-family"],
  experienceNote: "Product media note",
});
assert.equal((await productPatch.json()).media.sourceType, "product");

let linkedProductUpdate = null;
let linkedProductWorkspaceId = null;
const linked = await handleOperatorMediaById(request("https://example.test/api/media/product-1", "PATCH", {
  productId: catalogProduct.id,
}), env(), "product-1", {
  get: async () => product,
  getProduct: async (_env, id, workspaceId) => {
    linkedProductWorkspaceId = workspaceId;
    return id === catalogProduct.id ? catalogProduct : null;
  },
  update: async (_env, id, value, workspaceId) => {
    linkedProductUpdate = value;
    assert.equal(workspaceId, "default-workspace");
    return { ...product, id, ...value };
  },
});
assert.equal(linked.status, 200);
assert.deepEqual(linkedProductUpdate, { productId: catalogProduct.id });
assert.equal(linkedProductWorkspaceId, "default-workspace");

const workspaceAMedia = { ...product, id: "product-media-a", workspaceId: "workspace-a" };
let workspaceAProductLookup = null;
const sameWorkspaceLink = await handleOperatorMediaById(request("https://example.test/api/media/product-media-a", "PATCH", {
  productId: "product-a",
}), env(), "product-media-a", {
  get: async () => workspaceAMedia,
  getProduct: async (_env, id, workspaceId) => {
    workspaceAProductLookup = { id, workspaceId };
    return id === "product-a" && workspaceId === "workspace-a"
      ? { id, name: "Workspace A Product", productKey: "workspace-a" }
      : null;
  },
  update: async (_env, id, value, workspaceId) => {
    assert.equal(workspaceId, "workspace-a");
    return { ...workspaceAMedia, id, ...value };
  },
});
assert.equal(sameWorkspaceLink.status, 200);
assert.deepEqual(workspaceAProductLookup, { id: "product-a", workspaceId: "workspace-a" });

const workspaceBMedia = { ...product, id: "product-media-b", workspaceId: "workspace-b" };
const workspaceBSameLink = await handleOperatorMediaById(request("https://example.test/api/media/product-media-b", "PATCH", {
  productId: "product-b",
}), env(), "product-media-b", {
  get: async () => workspaceBMedia,
  getProduct: async (_env, id, workspaceId) => {
    assert.equal(workspaceId, "workspace-b");
    return id === "product-b" ? { id, name: "Workspace B Product", productKey: "workspace-b" } : null;
  },
  update: async (_env, id, value, workspaceId) => {
    assert.equal(workspaceId, "workspace-b");
    return { ...workspaceBMedia, id, ...value };
  },
});
assert.equal(workspaceBSameLink.status, 200);

const workspaceBDefaultLink = await handleOperatorMediaById(request("https://example.test/api/media/product-media-b", "PATCH", {
  productId: "catalog-product-1",
}), env(), "product-media-b", {
  get: async () => workspaceBMedia,
  getProduct: async (_env, _id, workspaceId) => {
    assert.equal(workspaceId, "workspace-b");
    return null;
  },
  update: async () => { throw new Error("must not update"); },
});
assert.equal(workspaceBDefaultLink.status, 404);

const workspaceACrossLink = await handleOperatorMediaById(request("https://example.test/api/media/product-media-a", "PATCH", {
  productId: "product-b",
}), env(), "product-media-a", {
  get: async () => workspaceAMedia,
  getProduct: async (_env, _id, workspaceId) => {
    assert.equal(workspaceId, "workspace-a");
    return null;
  },
  update: async () => { throw new Error("must not update"); },
});
assert.equal(workspaceACrossLink.status, 404);

const changed = await handleOperatorMediaById(request("https://example.test/api/media/product-1", "PATCH", {
  productId: "catalog-product-2",
}), env(), "product-1", {
  get: async () => ({ ...product, productId: catalogProduct.id }),
  getProduct: async (_env, id) => id === "catalog-product-2" ? { id, name: "Second Product", productKey: "second" } : null,
  update: async (_env, id, value) => ({ ...product, id, ...value }),
});
assert.equal(changed.status, 200);

const unlinked = await handleOperatorMediaById(request("https://example.test/api/media/product-1", "PATCH", {
  productId: null,
}), env(), "product-1", {
  get: async () => ({ ...product, productId: catalogProduct.id }),
  update: async (_env, id, value) => ({ ...product, id, ...value }),
});
assert.equal(unlinked.status, 200);
assert.equal((await unlinked.json()).media.linkedProduct, null);

const generalProductLink = await handleOperatorMediaById(request("https://example.test/api/media/image-1", "PATCH", {
  productId: catalogProduct.id,
}), env(), "image-1", {
  get: async () => image,
  update: async () => { throw new Error("must not update"); },
});
assert.equal(generalProductLink.status, 400);

const unknownProduct = await handleOperatorMediaById(request("https://example.test/api/media/product-1", "PATCH", {
  productId: "unknown-product",
}), env(), "product-1", {
  get: async () => product,
  getProduct: async () => null,
  update: async () => { throw new Error("must not update"); },
});
assert.equal(unknownProduct.status, 404);

const crossWorkspaceProduct = await handleOperatorMediaById(request("https://example.test/api/media/product-1", "PATCH", {
  productId: "workspace-b-product",
}), env(), "product-1", {
  get: async () => product,
  getProduct: async () => null,
  update: async () => { throw new Error("must not update"); },
});
assert.equal(crossWorkspaceProduct.status, 404);

const malformedProductId = await handleOperatorMediaById(request("https://example.test/api/media/product-1", "PATCH", {
  productId: ["not-valid"],
}), env(), "product-1", { get: async () => product });
assert.equal(malformedProductId.status, 400);

for (const productId of ["", "   ", "https://example.test/product", "product id", "x".repeat(129)]) {
  let productLookupCalled = false;
  const response = await handleOperatorMediaById(request("https://example.test/api/media/product-1", "PATCH", {
    productId,
  }), env(), "product-1", {
    get: async () => product,
    getProduct: async () => { productLookupCalled = true; return catalogProduct; },
    update: async (_env, id, value) => ({ ...product, id, ...value }),
  });
  assert.equal(response.status, productId.trim() ? 400 : 200);
  assert.equal(productLookupCalled, false);
}

const objectProductId = await handleOperatorMediaById(request("https://example.test/api/media/product-1", "PATCH", {
  productId: { id: "product-1" },
}), env(), "product-1", { get: async () => product });
assert.equal(objectProductId.status, 400);

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
assert.deepEqual(uploadInput.defaults, {
  sourceType: "general",
  experienceTags: "",
  experienceNote: "",
});
assert.equal(uploadInput.createPoolItems, true);
assert.equal((await upload.json()).results[0].media.previewUrl, "/media/image-1");

const hintedUploadForm = new FormData();
hintedUploadForm.append("files", new Blob(["image-a"], { type: "image/jpeg" }), "photo-a.jpg");
hintedUploadForm.append("files", new Blob(["image-b"], { type: "image/jpeg" }), "photo-b.jpg");
hintedUploadForm.append("experienceTags", "출근길, 비 오는 날");
hintedUploadForm.append("experienceNote", "비 오는 날 출퇴근할 때 사용.");
let hintedUploadInput = null;
await handleOperatorMediaUpload(
  new Request("https://example.test/api/media/upload", { method: "POST", headers: { cookie: "admin_session=session-1" }, body: hintedUploadForm }),
  env(),
  {
    batchUpload: async (_env, input) => {
      hintedUploadInput = input;
      return { results: [
        { fileName: "photo-a.jpg", status: "success", media: image },
        { fileName: "photo-b.jpg", status: "success", media: image },
      ] };
    },
  }
);
assert.equal(hintedUploadInput.files.length, 2);
assert.deepEqual(hintedUploadInput.defaults, {
  sourceType: "general",
  experienceTags: "출근길, 비 오는 날",
  experienceNote: "비 오는 날 출퇴근할 때 사용.",
});

for (const [field, value, expected] of [
  ["experienceTags", "주말", { experienceTags: "주말", experienceNote: "" }],
  ["experienceNote", "오래 걸어도 편했음.", { experienceTags: "", experienceNote: "오래 걸어도 편했음." }],
]) {
  const form = new FormData();
  form.append("files", new Blob(["image"], { type: "image/jpeg" }), "optional.jpg");
  form.append(field, value);
  let optionalInput = null;
  await handleOperatorMediaUpload(
    new Request("https://example.test/api/media/upload", { method: "POST", headers: { cookie: "admin_session=session-1" }, body: form }),
    env(),
    { batchUpload: async (_env, input) => { optionalInput = input; return { results: [] }; } }
  );
  assert.deepEqual(optionalInput.defaults, { sourceType: "general", ...expected });
}

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
assert.deepEqual(videoUploadInput.defaults, {
  sourceType: "general",
  experienceTags: "",
  experienceNote: "",
});
assert.equal((await videoUpload.json()).results[0].media.kind, "video");

const unauthenticatedUpload = await handleOperatorMediaUpload(
  new Request("https://example.test/api/media/upload", { method: "POST", body: new FormData() }),
  env(false)
);
assert.equal(unauthenticatedUpload.status, 401);

const experienceUpdated = await handleOperatorMediaById(request("https://example.test/api/media/image-1", "PATCH", {
  experienceTags: ["weekend", "weekend"],
  experienceNote: "Long walk",
}), env(), "image-1", {
  get: async () => image,
  update: async (_env, id, value) => ({ ...image, id, ...value }),
});
const experienceMedia = (await experienceUpdated.json()).media;
assert.deepEqual(experienceMedia.experienceTags, ["weekend"]);
assert.equal(experienceMedia.experienceNote, "Long walk");
console.log("operator media API fixture passed");
