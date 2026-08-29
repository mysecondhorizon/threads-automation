import assert from "node:assert/strict";
import {
  getPostDeleteRequest,
  getPostSaveRequest,
  getPostStatusRequest,
  getPostPublishRequest,
  getTargetAppLabel,
  getTargetAppOptions,
  isFunctionalTargetApp,
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
assert.match(page, /id="post-target-app"/u);
assert.match(page, /WordPress — 준비 중/u);
assert.match(page, /Custom API — 준비 중/u);
assert.match(page, /id="saved-post-list"/u);
assert.match(page, /id="topic-refresh"/u);
assert.match(page, /id="topic-list"/u);
assert.match(page, /id="topic-generate"/u);
assert.match(page, /getPostPublishRequest/u);
assert.match(page, /Threads에 게시했습니다\./u);
assert.match(page, /getTargetAppLabel\(post\.targetApp, targetApps\)/u);
assert.match(page, /requestApi\("\/api\/apps"\)/u);
assert.match(page, /!isFunctionalTargetApp\(post\.targetApp, targetApps\)/u);
assert.match(page, /post\.status === "READY"/u);
assert.match(page, /post\.status === "PUBLISHED"/u);
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
  payload: { title: "제목", body: "본문", format: "TEXT", status: "DRAFT", sourceType: "MANUAL", topicId: null, targetApp: null },
});
assert.deepEqual(getPostSaveRequest({
  editingId: null,
  title: "",
  body: "AI 본문",
  format: "HTML",
  status: "DRAFT",
  sourceType: "AI",
  topicId: "topic-1",
  targetApp: "threads-primary",
}).payload, {
  title: null,
  body: "AI 본문",
  format: "HTML",
  status: "DRAFT",
  sourceType: "AI",
  topicId: "topic-1",
  targetApp: "threads-primary",
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
assert.deepEqual(getPostPublishRequest("post-1"), {
  url: "/api/posts/post-1/publish",
  method: "POST",
});

const targetApps = [
  { id: "threads-primary", name: "Second Horizon Threads", type: "THREADS" },
  { id: "future-wordpress", name: "WordPress", type: "WORDPRESS" },
  { id: "future-custom", name: "Custom API", type: "CUSTOM_API" },
  { id: "other-threads", name: "Other Threads", type: "THREADS" },
  { id: "future-unknown", name: "Unknown", type: "UNKNOWN" },
];
const targetOptions = getTargetAppOptions(targetApps);
assert.deepEqual(targetOptions[0], { id: "threads-primary", label: "Second Horizon Threads", disabled: false });
assert.equal(targetOptions.find((option) => option.id === "future-wordpress")?.disabled, true);
assert.equal(targetOptions.find((option) => option.id === "future-wordpress")?.label, "WordPress — 준비 중");
assert.equal(targetOptions.find((option) => option.id === "future-custom")?.disabled, true);
assert.equal(targetOptions.find((option) => option.id === "future-custom")?.label, "Custom API — 준비 중");
assert.equal(targetOptions.find((option) => option.id === "other-threads")?.disabled, false);
assert.equal(targetOptions.find((option) => option.id === "future-unknown")?.disabled, true);
assert.equal(targetOptions.find((option) => option.id === "future-unknown")?.label, "Unknown — 사용 불가");
assert.equal(isFunctionalTargetApp("threads-primary", targetApps), true);
assert.equal(isFunctionalTargetApp("other-threads", targetApps), true);
assert.equal(isFunctionalTargetApp("future-wordpress", targetApps), false);
assert.equal(isFunctionalTargetApp("future-custom", targetApps), false);
assert.equal(isFunctionalTargetApp("missing", targetApps), false);
assert.equal(isFunctionalTargetApp(null, []), true);
assert.equal(getTargetAppLabel(null, []), "Second Horizon Threads");
assert.equal(getTargetAppLabel("future-wordpress", targetApps), "WordPress — 준비 중");
assert.equal(getTargetAppLabel("missing", []), "missing — 사용 불가");

const unauthenticated = await handleAppWritePage(new Request("https://example.test/app/write"), createEnv());
assert.equal(unauthenticated.status, 302);
console.log("app write page fixture passed");
