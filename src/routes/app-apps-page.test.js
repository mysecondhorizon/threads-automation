import assert from "node:assert/strict";
import { handleAppAppsPage } from "./app-apps-page.js";

const env = { THREADS_KV: { async get(key) { return key === "admin_session:session-1" ? "valid" : null; } } };
const response = await handleAppAppsPage(new Request("https://example.test/app/apps", { headers: { cookie: "admin_session=session-1" } }), env);
const page = await response.text();
assert.equal(response.status, 200);
assert.match(page, /operator-app-list/u);
assert.match(page, /operator-app-create-form/u);
assert.match(page, /\/api\/apps/u);
assert.match(page, /app\.name/u);
assert.match(page, /connectionStatus/u);
assert.match(page, /Threads/u);
assert.match(page, /WordPress/u);
assert.match(page, /Custom API/u);
assert.doesNotMatch(page, /access_token|threads_auth|OAuth|private-access-token/u);
assert.doesNotMatch(page, /innerHTML/u);
assert.equal((await handleAppAppsPage(new Request("https://example.test/app/apps"), env)).status, 302);
console.log("app apps page fixture passed");
