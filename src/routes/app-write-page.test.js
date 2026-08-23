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
assert.match(page, /id="topic-refresh"/u);
assert.match(page, /id="topic-list"/u);
assert.match(page, /id="topic-generate"/u);
assert.match(page, /textContent = String\(post\.body/u);
assert.match(page, /editingId = post\.id/u);
assert.match(page, /bodyInput\.value = post\.body/u);
assert.match(page, /newButton\.addEventListener\("click", resetEditor\)/u);
assert.match(page, /window\.confirm\("작성 중인 내용을 AI 초안으로 바꿀까요/u);
assert.match(page, /editorSourceType = "AI"/u);
assert.match(page, /editorSourceType = "MANUAL"/u);
assert.match(page, /editorTopicId = null/u);
assert.match(page, /selectTopic\(topic\.id\)/u);
assert.match(page, /catch \(error\) \{\s*setTopicFeedback\(error\.message, "error"\)/u);
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
  payload: { title: "제목", body: "본문", format: "TEXT", status: "DRAFT", sourceType: "MANUAL", topicId: null },
});
assert.deepEqual(getPostSaveRequest({
  editingId: null,
  title: "",
  body: "AI 본문",
  format: "HTML",
  status: "DRAFT",
  sourceType: "AI",
  topicId: "topic-1",
}).payload, {
  title: null,
  body: "AI 본문",
  format: "HTML",
  status: "DRAFT",
  sourceType: "AI",
  topicId: "topic-1",
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
