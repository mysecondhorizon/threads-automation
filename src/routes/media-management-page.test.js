import assert from "node:assert/strict";
import { handleMediaManagementPage } from "./media-management-page.js";

const response = await handleMediaManagementPage(
  new Request("https://example.test/admin/media-page", {
    headers: { cookie: "admin_session=session-1" },
  }),
  {
    THREADS_KV: {
      async get(key) {
        return key === "admin_session:session-1" ? "valid" : null;
      },
    },
  }
);
const page = await response.text();

assert.equal(response.status, 200);
assert.match(page, /\['구분','Media ID','파일','설명','태그','사용','상태','관리'\]/u);
assert.match(page, /<td><code>'\+esc\(m\.id\)\+'<\/code><\/td><td><code>'\+esc\(m\.objectKey\)/u);
assert.match(page, /data-media="'\+esc\(m\.id\)\+'/u);

console.log("media management page Media ID fixture passed");
