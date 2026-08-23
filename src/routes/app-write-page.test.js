import assert from "node:assert/strict";
import {
  getPostDeleteRequest,
  getPostSaveRequest,
  getPostStatusRequest,
} from "./app-write-client.js";
import { handleAppWritePage } from "./app-write-page.js";

function createEnv() {
  return {
    THREADS_KV: {
      async get(key) {
        return key === "admin_session:session-1" ? "valid" : null;
      },
    },
  };
}

const pageResponse = await handleAppWritePage(
  new Request("https://example.test/app/write", { headers: { cookie: "admin_session=session-1" } }),
  createEnv()
);
const page = await pageResponse.text();
assert.equal(pageResponse.status, 200);
assert.match(page, /id="post-title"/u);
assert.match(page, /id="post-body"/u);
assert.match(page, /id="post-format"/u);
assert.match(page, /id="post-status"/u);
assert.match(page, /id="saved-post-list"/u);
assert.match(page, /textContent = String\(post\.body/u);
assert.match(page, /editingId = post\.id/u);
assert.match(page, /bodyInput\.value = post\.body/u);
assert.match(page, /newButton\.addEventListener\("click", resetEditor\)/u);
assert.doesNotMatch(page, /innerHTML/u);

assert.deepEqual(getPostSaveRequest({
  editingId: null,
  title: " 제목 ",
  body: "본문",
  format: "TEXT",
  status: "DRAFT",
}), {
  url: "/api/posts",
  method: "POST",
  payload: { title: "제목", body: "본문", format: "TEXT", status: "DRAFT", sourceType: "MANUAL" },
});
assert.deepEqual(getPostSaveRequest({
  editingId: "post-1",
  title: "",
  body: "본문",
  format: "HTML",
  status: "READY",
}).url, "/api/posts/post-1");
assert.equal(getPostSaveRequest({ editingId: "post-1", title: "", body: "본문", format: "HTML", status: "READY" }).method, "PATCH");
assert.deepEqual(getPostStatusRequest("post-1", "READY"), {
  url: "/api/posts/post-1",
  method: "PATCH",
  payload: { status: "READY" },
});
assert.deepEqual(getPostDeleteRequest("post-1"), {
  url: "/api/posts/post-1",
  method: "DELETE",
});

const unauthenticated = await handleAppWritePage(new Request("https://example.test/app/write"), createEnv());
assert.equal(unauthenticated.status, 302);
console.log("app write page fixture passed");
