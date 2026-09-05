import assert from "node:assert/strict";
import { handleOperatorActivity } from "./api-activity.js";

function request(path, authenticated = true, method = "GET") {
  return new Request(`https://example.test${path}`, { method, headers: authenticated ? { cookie:"admin_session=session-1" } : {} });
}
const env = { THREADS_KV: { async get(key) { return key === "admin_session:session-1" ? "valid" : null; } } };
assert.equal((await handleOperatorActivity(request("/api/activity", false), env)).status, 401);
assert.equal((await handleOperatorActivity(request("/api/activity", true, "POST"), env)).status, 405);
let receivedOptions = null;
const generalAutoSummary = { totalExecutions:0, successfulPublishes:0, failedExecutions:0, textCount:0, imageCount:0, videoCount:0, personaCount:0, currentTopicCount:0, imageUsagePercent:null, videoUsagePercent:null };
const response = await handleOperatorActivity(request("/api/activity?limit=12"), env, undefined, { getActivity: async (_env, options) => { receivedOptions = options; return { items:[], generalAutoSummary, limit:12, hasMore:false, generatedAt:"2026-08-29T00:00:00.000Z", partial:true }; } });
assert.equal(response.status, 200);
assert.deepEqual(receivedOptions, { limit:"12", workspaceId:"default-workspace" });
assert.deepEqual(await response.json(), { ok:true, items:[], generalAutoSummary, limit:12, hasMore:false, generatedAt:"2026-08-29T00:00:00.000Z", partial:true });
console.log("api activity fixture passed");
