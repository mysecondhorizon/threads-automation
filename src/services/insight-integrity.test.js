import assert from "node:assert/strict";
import { getPostInsights, POST_INSIGHT_METRICS, deriveInsightTotals, normalizeInsightMetric } from "./insights.js";
import { syncThreadsData, refreshScopedPostInsights } from "./threads-sync.js";
import { buildRecentPerformance, buildAnalyticsSummary, buildProductOpportunityPerformanceSummary } from "./analytics.js";
import { DEFAULT_WORKSPACE_ID } from "./workspace-foundation.js";
import { CONNECTED_ACCOUNTS_KEY } from "./connected-accounts.js";
import { USERS_KEY, WORKSPACES_KEY } from "./login-foundation.js";
import { handlePostInsights } from "../routes/insights.js";
import { handleRefreshInsights } from "../routes/insights-refresh.js";
import { getDashboardData } from "./dashboard.js";
import { handleDashboard } from "../routes/dashboard.js";

class MemoryKv {
  values = new Map();
  writes = [];
  async get(key, type) {
    const value = this.values.get(key);
    return value === undefined ? null : type === "json" ? JSON.parse(value) : value;
  }
  async put(key, value) { this.writes.push(key); this.values.set(key, value); }
  async list({ prefix = "" } = {}) {
    return { keys:[...this.values.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })) };
  }
}
const env = { THREADS_KV:new MemoryKv() };
const realFetch = globalThis.fetch;
let payload;
let providerCalls = 0;
globalThis.fetch = async (url) => {
  assert.match(new URL(url).pathname, /\/insights$/); // Never AI or publishing.
  providerCalls += 1;
  return Response.json(payload);
};
const responseFor = (metrics) => ({ data:Object.entries(metrics).map(([name, value]) => ({ name, values:[{ value }] })) });
let observed;
try {
  for (const invalid of [undefined, null, "", "  ", false, {}, [], -1, Infinity, NaN, "bad"]) {
    assert.equal(normalizeInsightMetric(invalid), null);
  }
  payload = responseFor({ views:0, likes:0, replies:0, reposts:0, quotes:0, shares:0 });
  observed = await getPostInsights("fixture-token", "owned");
  assert.equal(observed.views, 0);
  assert.equal(observed.replies, 0);
  assert.equal(observed.metricAvailability.views, true);
  assert.equal(observed.collectionStatus, "success");
  assert.equal(observed.interactions, 0);
  assert.equal(observed.engagementRate, null);
  assert.ok(Number.isFinite(Date.parse(observed.fetchedAt)));
  payload = responseFor({ views:100, likes:"0", replies:0, reposts:0, quotes:0, shares:0 });
  assert.equal((await getPostInsights("fixture-token", "owned")).engagementRate, 0);
  payload = responseFor({ likes:3, replies:null, shares:"bad", views:-1 });
  const partial = await getPostInsights("fixture-token", "partial");
  assert.equal(partial.collectionStatus, "partial");
  assert.equal(partial.views, null);
  assert.equal(partial.replies, null);
  assert.equal(partial.likes, 3);
  assert.equal(partial.metricAvailability.replies, false);
  assert.equal(partial.interactions, null);
  assert.equal(partial.engagementRate, null);
  payload = { data:[] };
  assert.equal((await getPostInsights("fixture-token", "empty")).collectionStatus, "unavailable");
  assert.equal(providerCalls, 4);
} finally {
  globalThis.fetch = realFetch;
}
for (const views of [null, undefined, -1, 0]) {
  assert.equal(deriveInsightTotals({ views, likes:0, replies:0, reposts:0, quotes:0, shares:0 }).engagementRate, null);
}

const metadata = { workspaceId:"workspace-a", connectedAccountId:"account-a", threadsUserId:"provider-a" };
const entry = (id, fields = metadata) => ({ key:`post_log:${id}`, log:{ post_id:id, status:"published", text:"Saved", metadata:fields } });
let entries = [entry("owned"), entry("outside-list"), entry("foreign", { ...metadata, workspaceId:"workspace-b" }),
  entry("other-account", { ...metadata, connectedAccountId:"account-b" }), entry("old-unknown", { workspaceId:"workspace-a" }),
  entry("old-confirmed", { workspaceId:"workspace-a" })];
let remote = [{ id:"owned", text:"Saved", timestamp:"2026-09-01T00:00:00Z" }, { id:"old-confirmed", text:"Saved" }];
let requested = [];
let synced = [];
let resolution = [];
let fail = false;
const dependencies = {
  resolveWorkspaceThreadsConnectedAccount: async (_env, options) => { resolution.push(options); return { id:"account-a" }; },
  getThreadsCredentialForAccount: async (_env, options) => {
    assert.equal(options.workspaceId, "workspace-a");
    assert.equal(options.connectedAccountId, "account-a");
    return { account:{ id:"account-a", workspaceId:"workspace-a" }, credential:{ access_token:"fixture-token" } };
  },
  getThreadsProfile: async (token) => { assert.equal(token, "fixture-token"); return { id:"provider-a" }; },
  getUserThreads: async (token) => { assert.equal(token, "fixture-token"); return { data:remote }; },
  getPostLogEntries: async () => entries,
  syncPostLogFromThreads: async (_env, key) => { synced.push(key); },
  getPostInsights: async (token, id) => {
    assert.equal(token, "fixture-token"); requested.push(id);
    if (fail) throw new Error("private-provider-detail");
    return { ...observed, postId:id, workspaceId:"spoof", connectedAccountId:"spoof", threadsUserId:"spoof" };
  },
};
const result = await syncThreadsData(env, { workspaceId:"workspace-a" }, dependencies);
assert.deepEqual(resolution, [{ workspaceId:"workspace-a" }]);
assert.deepEqual(requested.sort(), ["old-confirmed", "outside-list", "owned"]);
assert.equal(result.sync.deleted, 0);
assert.equal(result.insights.refreshed, 3);
assert.equal(entries.every(({ log }) => log.status === "published"), true);
assert.equal(synced.includes("post_log:foreign"), false);
assert.equal(synced.includes("post_log:outside-list"), false);
const stored = await env.THREADS_KV.get("post_insight:owned", "json");
assert.equal(stored.workspaceId, "workspace-a");
assert.equal(stored.connectedAccountId, "account-a");
assert.equal(stored.threadsUserId, "provider-a");
assert.equal(stored.ownershipSource, "published_log");
assert.equal(stored.publishedAt, "2026-09-01T00:00:00Z");
assert.equal((await env.THREADS_KV.get("post_insight:old-confirmed", "json")).ownershipSource, "account_post_list");
assert.equal((await env.THREADS_KV.get("post_insight:outside-list", "json")).publishedAt, null);
const previous = env.THREADS_KV.values.get("post_insight:owned");
fail = true;
const failed = await syncThreadsData(env, { workspaceId:"workspace-a" }, dependencies);
assert.equal(failed.insights.failed, 3);
assert.equal(JSON.stringify(failed).includes("private-provider-detail"), false);
assert.equal(env.THREADS_KV.values.get("post_insight:owned"), previous);
fail = false;
requested = [];
await assert.rejects(refreshScopedPostInsights(env, "foreign", { workspaceId:"workspace-a" }, dependencies), { code:"insight_post_not_found" });
await assert.rejects(refreshScopedPostInsights(env, "other-account", { workspaceId:"workspace-a" }, dependencies), { code:"insight_post_not_owned" });
await assert.rejects(refreshScopedPostInsights(env, "old-unknown", { workspaceId:"workspace-a" }, dependencies), { code:"insight_post_not_owned" });
assert.deepEqual(requested, []);
await assert.rejects(syncThreadsData(env, { workspaceId:"workspace-a", executionContext:{ workspaceId:"workspace-b", connectedAccountId:"account-a" } }, dependencies), { code:"insight_scope_invalid" });
await env.THREADS_KV.put("post_insight:owned", JSON.stringify({ ...stored, threadsUserId:"reconnected-other-provider" }));
await assert.rejects(refreshScopedPostInsights(env, "owned", { workspaceId:"workspace-a" }, dependencies), { code:"insight_cache_owner_mismatch" });
await env.THREADS_KV.put("post_insight:owned", previous);
await assert.rejects(refreshScopedPostInsights(env, "owned", { workspaceId:"workspace-a" }, {
  ...dependencies, getPostInsights:async () => ({ ...observed, collectionStatus:"unavailable" }),
}), { code:"insight_observation_unavailable" });
assert.equal(env.THREADS_KV.values.get("post_insight:owned"), previous);
await refreshScopedPostInsights(env, "owned", { workspaceId:"workspace-a", executionContext:{ ...metadata } }, dependencies);
assert.equal([...env.THREADS_KV.values.keys()].every((key) => key.startsWith("post_insight:")), true);
assert.equal(env.THREADS_KV.values.size, 3); // Latest observation only, no snapshots.

entries = [entry("legacy", {}), entry("legacy-outside", {}), entry("foreign")];
requested = []; synced = []; remote = [{ id:"legacy", text:"Saved" }, { id:"foreign", text:"Saved" }];
await syncThreadsData(env, {}, {
  ...dependencies,
  resolveWorkspaceThreadsConnectedAccount:async () => { assert.fail("legacy must not resolve another Workspace"); },
  getThreadsCredentialForAccount:async (_env, options) => {
    assert.deepEqual(options, { workspaceId:DEFAULT_WORKSPACE_ID, connectedAccountId:undefined });
    return { account:{ id:"legacy-account", workspaceId:DEFAULT_WORKSPACE_ID }, credential:{ access_token:"fixture-token" } };
  },
});
assert.deepEqual(requested, ["legacy"]);
assert.deepEqual(synced, ["post_log:legacy"]);
assert.equal(entries.every(({ log }) => log.status === "published"), true);

const posts = ["owned", "missing", "partial", "legacy-cache", "mismatch"].map((postId) => ({ postId, ...metadata, contentBasis:"PERSONA" }));
await env.THREADS_KV.put("post_insight:partial", JSON.stringify({ ...stored, postId:"partial", views:null, replies:null, likes:2,
  metricAvailability:{ ...stored.metricAvailability, views:false, replies:false } }));
await env.THREADS_KV.put("post_insight:legacy-cache", JSON.stringify({ views:50, replies:0, likes:0 }));
await env.THREADS_KV.put("post_insight:mismatch", JSON.stringify({ ...stored, postId:"mismatch", workspaceId:"workspace-b" }));
const performance = await buildRecentPerformance(env, posts);
assert.equal(performance[0].views, 0);
assert.equal(performance[0].available, true);
assert.equal(performance[1].views, null);
assert.equal(performance[2].views, null);
assert.equal(performance[2].interactions, null);
assert.equal(performance[2].engagementRate, null);
assert.equal(performance[3].legacyInsight, true);
assert.equal(performance[3].available, false);
assert.equal(performance[3].views, 50);
assert.equal(performance[3].replies, null);
assert.equal(performance[4].collectionStatus, "ownership_mismatch");
const summary = buildAnalyticsSummary(performance);
assert.equal(summary.totalPosts, 1);
assert.equal(summary.averageViews, 0);
assert.equal(summary.insightCoverage, 20);
assert.equal(buildAnalyticsSummary([]).averageViews, null);
const partialSummary = await buildProductOpportunityPerformanceSummary(env, [posts[2]]);
assert.equal(partialSummary.totals.views, null);
assert.equal(partialSummary.totals.likes, 2);
assert.equal(partialSummary.totals.interactions, null);

// Real session resolver, stub only the outbound collection to avoid any API call.
const date = "2026-09-01T00:00:00Z";
await env.THREADS_KV.put(USERS_KEY, JSON.stringify({ version:1, users:[{ id:"user-a", loginId:"user-a", displayName:"A", active:true, createdAt:date, updatedAt:date }] }));
await env.THREADS_KV.put(WORKSPACES_KEY, JSON.stringify({ version:1, workspaces:[{ id:"workspace-a", ownerUserId:"user-a", name:"A", active:true, createdAt:date, updatedAt:date }] }));
await env.THREADS_KV.put("admin_session:registered", JSON.stringify({ version:1, userId:"user-a", selectedWorkspaceId:"workspace-a", createdAt:date, expiresAt:"2099-09-01T00:00:00Z" }));
await env.THREADS_KV.put("admin_session:legacy", "valid");
for (const [session, workspaceId] of [["registered", "workspace-a"], ["legacy", DEFAULT_WORKSPACE_ID]]) {
  const request = new Request("https://example.test/admin/insights?post_id=owned&workspaceId=workspace-b&connectedAccountId=account-b", { headers:{ cookie:`admin_session=${session}` } });
  const response = await handlePostInsights(request, env, new URL(request.url), { collect:async (_env, id, options) => {
    assert.equal(id, "owned"); assert.deepEqual(options, { workspaceId }); return { views:0 };
  } });
  assert.equal(response.status, 200);
  const refreshed = await handleRefreshInsights(request, env, { sync:async (_env, options) => {
    assert.deepEqual(options, { workspaceId }); return { ok:true };
  } });
  assert.equal(refreshed.status, 200);
}
const anonymous = new Request("https://example.test/admin/insights?post_id=owned");
assert.equal((await handlePostInsights(anonymous, env, new URL(anonymous.url), { collect:async () => assert.fail("unauthenticated collection") })).status, 401);
assert.equal((await handleRefreshInsights(anonymous, env, { sync:async () => assert.fail("unauthenticated refresh") })).status, 401);
const authorized = new Request(anonymous.url, { headers:{ cookie:"admin_session=registered" } });
const errorResponse = await handlePostInsights(authorized, env, new URL(authorized.url), { collect:async () => { throw new Error("private-provider-detail"); } });
assert.equal(errorResponse.status, 502);
assert.equal((await errorResponse.text()).includes("private-provider-detail"), false);
assert.equal(POST_INSIGHT_METRICS.length, 6);

// Exercise the real account resolver, canonical logs, provider parser and KV
// write together. Only outbound HTTP is substituted; no credential resolver stub.
const integrated = { THREADS_KV:new MemoryKv() };
const account = (suffix) => ({ id:`account-${suffix}`, workspaceId:`workspace-${suffix}`, platform:"THREADS",
  displayName:"Fixture", active:true, authRef:`connected_account_auth:account-${suffix}`, createdAt:date, updatedAt:date });
await integrated.THREADS_KV.put(CONNECTED_ACCOUNTS_KEY, JSON.stringify({ version:1, records:[account("a"), account("b")] }));
await integrated.THREADS_KV.put("connected_account_auth:account-a", JSON.stringify({ access_token:"fixture-a" }));
await integrated.THREADS_KV.put("connected_account_auth:account-b", JSON.stringify({ access_token:"fixture-b" }));
await integrated.THREADS_KV.put("threads_auth", JSON.stringify({ access_token:"fixture-legacy" }));
for (const logEntry of [entry("owned"), entry("foreign", { ...metadata, workspaceId:"workspace-b", connectedAccountId:"account-b" })]) {
  await integrated.THREADS_KV.put(logEntry.key, JSON.stringify(logEntry.log));
}
let liveEquivalentRequests = 0;
globalThis.fetch = async (requestUrl) => {
  const url = new URL(requestUrl);
  assert.equal(url.searchParams.get("access_token"), "fixture-a");
  liveEquivalentRequests += 1;
  if (url.pathname.endsWith("/me/threads")) return Response.json({ data:[] });
  if (url.pathname.endsWith("/me")) return Response.json({ id:"provider-a", username:"fixture" });
  assert.ok(url.pathname.endsWith("/owned/insights"));
  return Response.json(responseFor({ views:12, likes:0, replies:0, reposts:0, quotes:0, shares:0 }));
};
try {
  const collected = await syncThreadsData(integrated, { workspaceId:"workspace-a" });
  assert.equal(collected.insights.refreshed, 1);
  assert.equal(liveEquivalentRequests, 3);
  const observation = await integrated.THREADS_KV.get("post_insight:owned", "json");
  assert.equal(observation.connectedAccountId, "account-a");
  assert.equal(observation.engagementRate, 0);
  assert.equal((await integrated.THREADS_KV.get("post_log:foreign", "json")).status, "published");
  assert.equal(await integrated.THREADS_KV.get("post_insight:foreign"), null);
} finally {
  globalThis.fetch = realFetch;
}
await integrated.THREADS_KV.put("post_log:legacy-dashboard", JSON.stringify(entry("legacy-dashboard").log));
await integrated.THREADS_KV.put("post_insight:legacy-dashboard", JSON.stringify({ views:10000, replies:0 }));
const dashboard = await getDashboardData(integrated);
assert.equal(dashboard.summary.totalPosts, 3);
assert.equal(dashboard.summary.postsWithInsights, 1);
assert.equal(dashboard.summary.totalViews, 12);
assert.equal(dashboard.summary.averageViews, 12);
assert.equal(dashboard.summary.averageEngagementRate, 0);
assert.deepEqual(dashboard.topPosts.map((post) => post.postId), ["owned"]);
await integrated.THREADS_KV.put("post_insight:owned", JSON.stringify({ ...stored, views:null,
  metricAvailability:{ ...stored.metricAvailability, views:false } }));
const unavailableDashboard = await getDashboardData(integrated);
assert.equal(unavailableDashboard.summary.averageViews, null);
assert.equal(unavailableDashboard.summary.averageEngagementRate, null);
assert.equal(unavailableDashboard.summary.totalViews, null);
await integrated.THREADS_KV.put("admin_session:legacy", "valid");
const page = await handleDashboard(new Request("https://example.test/admin/dashboard", { headers:{ cookie:"admin_session=legacy" } }), integrated);
assert.equal(page.status, 200);
const pageHtml = await page.text();
assert.ok(pageHtml.includes("평균 참여율"));
assert.equal(pageHtml.includes("0.00%"), false);
console.log("scoped insight integrity fixtures passed (ownership, metrics, caches, analytics and authenticated routes)");
