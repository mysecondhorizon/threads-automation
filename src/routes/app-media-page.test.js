import assert from "node:assert/strict";
import { getMediaUpdateRequest } from "./app-media-client.js";
import { handleAppMediaPage } from "./app-media-page.js";

const env = {
  THREADS_KV: {
    async get(key) { return key === "admin_session:session-1" ? "valid" : null; },
  },
};

const response = await handleAppMediaPage(
  new Request("https://example.test/app/media", { headers: { cookie: "admin_session=session-1" } }),
  env
);
const page = await response.text();
assert.equal(response.status, 200);
assert.match(page, /id="media-upload-form"/u);
assert.match(page, /id="media-files"/u);
assert.match(page, /id="operator-media-list"/u);
assert.match(page, /document\.createElement\("img"/u);
assert.match(page, /document\.createElement\("video"/u);
assert.match(page, /video\.controls = true/u);
assert.match(page, /textContent = media\.description/u);
assert.match(page, /textContent = Array\.isArray\(media\.tags/u);
assert.doesNotMatch(page, /innerHTML/u);
assert.doesNotMatch(page, /objectKey|content_media_library|THREADS_MEDIA/u);
assert.deepEqual(getMediaUpdateRequest("media-1", { active: false }), {
  url: "/api/media/media-1",
  method: "PATCH",
  payload: { active: false },
});
const unauthenticated = await handleAppMediaPage(new Request("https://example.test/app/media"), env);
assert.equal(unauthenticated.status, 302);
console.log("app media page fixture passed");
