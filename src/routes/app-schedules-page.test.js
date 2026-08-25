import assert from "node:assert/strict";
import { handleAppSchedulesPage } from "./app-schedules-page.js";

const env = { THREADS_KV: { async get(key) { return key === "admin_session:session-1" ? "valid" : null; } } };
const response = await handleAppSchedulesPage(new Request("https://x/app/schedules", { headers: { cookie: "admin_session=session-1" } }), env);
const page = await response.text();
assert.equal(response.status, 200);
assert.match(page, /id="schedule-form"/u);
assert.equal(page.includes("/api/schedules"), true);
assert.match(page, /Asia\/Seoul/u);
assert.doesNotMatch(page, /Durable Object|Wrangler|cron/iu);
assert.equal((await handleAppSchedulesPage(new Request("https://x/app/schedules"), env)).status, 302);
console.log("app schedules page fixture passed");
