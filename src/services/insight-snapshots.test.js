import assert from "node:assert/strict";
import { saveInsightSnapshot, getInsightSnapshot, insightObservationWindow, observationAgeSeconds } from "./insight-snapshots.js";
import { syncThreadsData, refreshScopedPostInsights } from "./threads-sync.js";
import { getPostLogEntries } from "./logger.js";
import { POST_INSIGHT_METRICS, deriveInsightTotals } from "./insights.js";
import { DEFAULT_WORKSPACE_ID } from "./workspace-foundation.js";

const hour = 3600000;
const publishedAt = "2026-09-01T00:00:00.000Z";
const at = (hours) => new Date(Date.parse(publishedAt) + hours * hour).toISOString();
const owner = { workspaceId: "workspace-a", connectedAccountId: "account-a", threadsUserId: "provider-a" };
const observation = (hours = 25, overrides = {}) => {
  const metrics = Object.fromEntries(POST_INSIGHT_METRICS.map((name) => [name, 0]));
  return { ...owner, postId: "post-a", ownershipSource: "published_log", publishedAt, fetchedAt: at(hours),
    integrityVersion: 1, collectionStatus: "success",
    metricAvailability: Object.fromEntries(POST_INSIGHT_METRICS.map((name) => [name, true])),
    ...metrics, ...deriveInsightTotals(metrics), ...overrides };
};
class MemoryKv {
  values = new Map();
  writes = [];
  lists = [];
  pages = null;
  failSnapshots = false;
  operations = 0;
  reads = [];
  async get(key, type) {
    this.operations += 1;
    this.reads.push(key);
    if (Array.isArray(key)) {
      return new Map(key.map((item) => {
        const value = this.values.get(item);
        return [item, value === undefined ? null : type === "json" ? JSON.parse(value) : value];
      }));
    }
    const value = this.values.get(key);
    return value === undefined ? null : type === "json" ? JSON.parse(value) : value;
  }
  async put(key, value) {
    this.operations += 1;
    if (this.failSnapshots && key.startsWith("post_insight_snapshot:")) throw new Error("fixture storage failure");
    this.writes.push(key); this.values.set(key, value);
  }
  async list(options = {}) {
    this.operations += 1;
    this.lists.push(options);
    if (this.pages) return this.pages[options.cursor || "first"];
    return { keys: [...this.values.keys()].filter((key) => key.startsWith(options.prefix || "")).map((name) => ({ name })), list_complete: true };
  }
}
const environment = () => ({ THREADS_KV: new MemoryKv() });
const key = (windowId, identity = { ...owner, postId: "post-a" }) =>
  `post_insight_snapshot:v1:${[identity.workspaceId, identity.connectedAccountId, identity.threadsUserId, identity.postId].map(encodeURIComponent).join(":")}:${windowId}`;

// No live provider, generation, or publish calls are permitted in these tests.
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => assert.fail("unexpected live API call");
try {
  for (const [hours, expected] of [[-1, null], [0, null], [24 - 1 / 3600, null], [24, "D1"],
    [48 - 1 / 3600, "D1"], [48, null], [72 - 1 / 3600, null], [72, "D3"], [96 - 1 / 3600, "D3"], [96, null], [120, null]]) {
    assert.equal(insightObservationWindow(publishedAt, at(hours)), expected);
    const env = environment();
    assert.equal(await saveInsightSnapshot(env, observation(hours)), expected !== null);
    assert.equal(env.THREADS_KV.writes.length, expected ? 1 : 0);
  }
  assert.equal(observationAgeSeconds(publishedAt, at(25)), 90000);
  assert.equal(observationAgeSeconds(null, at(25)), null);
  assert.equal(observationAgeSeconds("invalid", at(25)), null);
  const env = environment();
  const first = observation(25 + 0.125 / 3600, { text: "private body", accessToken: "private fixture", username: "private name" });
  assert.equal(await saveInsightSnapshot(env, first), true);
  const snapshot = await getInsightSnapshot(env, first, "D1");
  assert.equal(snapshot.observationAgeSeconds, 90000.125);
  assert.equal(snapshot.observedAt, first.fetchedAt);
  assert.equal(snapshot.views, 0);
  assert.equal(snapshot.interactions, 0);
  assert.equal(snapshot.engagementRate, null);
  assert.equal(JSON.stringify(snapshot).includes("private"), false);
  assert.deepEqual(Object.keys(snapshot).sort(), ["schemaVersion", "windowId", "postId", "workspaceId", "connectedAccountId",
    "threadsUserId", "ownershipSource", "publishedAt", "observedAt", "observationAgeSeconds", "integrityVersion",
    "collectionStatus", "metricAvailability", ...POST_INSIGHT_METRICS, "interactions", "engagementRate"].sort());
  const original = env.THREADS_KV.values.get(key("D1"));
  for (const next of [first, observation(26, { views: 500 }), observation(47)]) assert.equal(await saveInsightSnapshot(env, next), false);
  assert.equal(env.THREADS_KV.values.get(key("D1")), original);
  assert.equal(await saveInsightSnapshot(env, observation(75)), true);
  assert.equal(env.THREADS_KV.values.size, 2);
  for (const raw of ["null", "invalid-json"]) {
    const occupied = environment();
    await occupied.THREADS_KV.put(key("D1"), raw);
    assert.equal(await saveInsightSnapshot(occupied, first), false);
    assert.equal(occupied.THREADS_KV.values.get(key("D1")), raw);
  }

  const partial = observation(25, { postId: "partial", collectionStatus: "partial", views: null, replies: undefined, shares: "invalid",
    metricAvailability: { ...first.metricAvailability, views: false, replies: false } });
  assert.equal(await saveInsightSnapshot(env, partial), true);
  const partialSnapshot = await getInsightSnapshot(env, partial, "D1");
  assert.equal(partialSnapshot.collectionStatus, "partial");
  assert.equal(partialSnapshot.views, null);
  assert.equal(partialSnapshot.replies, null);
  assert.equal(partialSnapshot.shares, null);
  assert.equal(partialSnapshot.metricAvailability.shares, false);
  assert.equal(partialSnapshot.likes, 0);
  assert.equal(partialSnapshot.interactions, null);
  for (const overrides of [{ collectionStatus: "failed" }, { collectionStatus: "unavailable" }, { integrityVersion: 0 },
    { metricAvailability: {} }, { publishedAt: null }, { publishedAt: "bad" }, { fetchedAt: null },
    { ownershipSource: "guessed" }, { workspaceId: "" }, { threadsUserId: null },
    Object.fromEntries(POST_INSIGHT_METRICS.map((name) => [name, null]))]) {
    assert.equal(await saveInsightSnapshot(env, observation(25, { postId: "invalid", ...overrides })), false);
  }
  for (const field of ["workspaceId", "connectedAccountId", "threadsUserId", "postId"]) {
    const other = observation(25, { [field]: `other-${field}` });
    assert.equal(await getInsightSnapshot(env, other, "D1"), null);
    assert.equal(await saveInsightSnapshot(env, other), true);
    assert.equal((await getInsightSnapshot(env, other, "D1"))[field], other[field]);
    assert.equal(env.THREADS_KV.values.get(key("D1")), original);
  }
  // Key segments cannot alias an identity containing separators.
  assert.equal(await saveInsightSnapshot(env, observation(25, { workspaceId: "a:b", connectedAccountId: "c" })), true);
  assert.equal(await getInsightSnapshot(env, { ...owner, postId: "post-a", workspaceId: "a", connectedAccountId: "b:c" }, "D1"), null);

  const log = (postId, fields = {}) => ({ key: `post_log:${postId}`, log: { post_id: postId, status: "published",
    metadata: owner, text: "saved body", created_at: at(25), threads_timestamp: publishedAt, ...fields } });
  let logs = [log("post-a")];
  let remote = [];
  let clock = at(25);
  let fail = false;
  let unavailable = false;
  let requests = [];
  let profiles = 0;
  let lists = 0;
  const deps = {
    now: () => clock,
    resolveWorkspaceThreadsConnectedAccount: async () => ({ id: owner.connectedAccountId }),
    getThreadsCredentialForAccount: async () => ({ account: { id: owner.connectedAccountId, workspaceId: owner.workspaceId }, credential: { access_token: "fixture" } }),
    getThreadsProfile: async () => { profiles++; return { id: owner.threadsUserId }; },
    getUserThreads: async () => { lists++; return { data: remote }; },
    getPostLogEntries: async (_env, options) => { assert.deepEqual(options, { paginate: true }); return logs; },
    syncPostLogFromThreads: async () => {},
    getPostInsights: async (_token, postId) => {
      requests.push(postId);
      if (fail) throw new Error("private provider failure");
      return observation(25, { postId, fetchedAt: clock, collectionStatus: unavailable ? "unavailable" : "success",
        workspaceId: "spoofed workspace", connectedAccountId: "spoofed account", threadsUserId: "spoofed provider" });
    },
  };
  const collected = environment();
  const automatic = { workspaceId: owner.workspaceId, automatic: true };
  await syncThreadsData(collected, automatic, deps);
  assert.deepEqual(requests, ["post-a"]);
  assert.equal(profiles + lists + requests.length, 3); // No snapshot-related HTTP calls.
  assert.equal((await getInsightSnapshot(collected, first, "D1")).workspaceId, owner.workspaceId);
  const latestBefore = collected.THREADS_KV.values.get("post_insight:post-a");
  const snapshotBefore = collected.THREADS_KV.values.get(key("D1"));
  fail = true;
  assert.equal((await syncThreadsData(collected, automatic, deps)).insights.failed, 1);
  await assert.rejects(refreshScopedPostInsights(collected, "post-a", { workspaceId: owner.workspaceId }, deps));
  fail = false; unavailable = true;
  assert.equal((await syncThreadsData(collected, automatic, deps)).insights.failed, 1);
  unavailable = false;

  const partialCollected = environment();
  await syncThreadsData(partialCollected, automatic, { ...deps,
    getPostInsights: async (_token, postId) => ({ ...partial, postId, fetchedAt: clock }),
  });
  const partialStored = await getInsightSnapshot(partialCollected, first, "D1");
  assert.equal(partialStored.collectionStatus, "partial");
  assert.equal(partialStored.views, null);
  assert.equal(partialStored.likes, 0);
  assert.equal(partialStored.interactions, null);
  assert.equal(collected.THREADS_KV.values.get("post_insight:post-a"), latestBefore);
  assert.equal(collected.THREADS_KV.values.get(key("D1")), snapshotBefore);
  const freshFailure = environment();
  fail = true;
  await syncThreadsData(freshFailure, automatic, deps);
  assert.equal(freshFailure.THREADS_KV.writes.length, 0);
  fail = false; unavailable = true;
  await syncThreadsData(freshFailure, automatic, deps);
  assert.equal(freshFailure.THREADS_KV.writes.length, 0);
  unavailable = false;

  clock = at(75);
  await syncThreadsData(collected, automatic, deps);
  requests = [];
  await syncThreadsData(collected, automatic, deps);
  assert.deepEqual(requests, []); // D3 completed: stop automatic collection.
  await refreshScopedPostInsights(collected, "post-a", { workspaceId: owner.workspaceId }, deps);
  assert.deepEqual(requests, ["post-a"]); // Manual still refreshes latest.
  assert.equal(collected.THREADS_KV.values.get(key("D1")), snapshotBefore);
  for (const hours of [96, 120]) {
    clock = at(hours); requests = [];
    const old = environment();
    await syncThreadsData(old, automatic, deps);
    assert.deepEqual(requests, []);
    await refreshScopedPostInsights(old, "post-a", { workspaceId: owner.workspaceId }, deps);
    assert.deepEqual(requests, ["post-a"]);
    assert.deepEqual([...old.THREADS_KV.values.keys()], ["post_insight:post-a"]);
  }
  requests = [];
  let checks = 0;
  const crossed = await syncThreadsData(environment(), automatic, { ...deps,
    now: () => at(checks++ === 0 ? 95 : 96),
  });
  assert.deepEqual(requests, []); // Re-check immediately before the API call.
  assert.equal(crossed.insights.requested, 0);
  clock = at(50);
  const gap = environment();
  await refreshScopedPostInsights(gap, "post-a", { workspaceId: owner.workspaceId }, deps);
  assert.equal(await getInsightSnapshot(gap, first, "D1"), null); // Never backfill missed D1.

  // No trusted timestamp: no automatic query/snapshot, including a legacy or
  // differently-owned cache whose timestamps must not be borrowed.
  logs = [log("post-a", { threads_timestamp: null })];
  clock = at(25);
  for (const previous of [null, { publishedAt }, observation(24, { workspaceId: "other" }), observation(24, { postId: "other" })]) {
    const missingTime = environment(); requests = [];
    if (previous) await missingTime.THREADS_KV.put("post_insight:post-a", JSON.stringify(previous));
    await syncThreadsData(missingTime, automatic, deps);
    assert.deepEqual(requests, []);
  }
  const missingTime = environment();
  const withoutTime = await refreshScopedPostInsights(missingTime, "post-a", { workspaceId: owner.workspaceId }, deps);
  assert.equal(withoutTime.publishedAt, null);
  assert.equal(await getInsightSnapshot(missingTime, first, "D1"), null);
  const trusted = environment();
  await trusted.THREADS_KV.put("post_insight:post-a", JSON.stringify(observation(24)));
  requests = [];
  await syncThreadsData(trusted, automatic, deps);
  assert.deepEqual(requests, ["post-a"]);
  assert.ok(await getInsightSnapshot(trusted, first, "D1"));
  // Provider > stored Threads timestamp > verified cache, never created_at.
  logs = [log("post-a", { threads_timestamp: at(2) })];
  remote = [{ id: "post-a", timestamp: at(1) }];
  assert.equal((await refreshScopedPostInsights(environment(), "post-a", { workspaceId: owner.workspaceId }, deps)).publishedAt, at(1));
  remote = [];
  assert.equal((await refreshScopedPostInsights(environment(), "post-a", { workspaceId: owner.workspaceId }, deps)).publishedAt, at(2));

  // Discover locally owned posts outside the remote list and beyond the first
  // 20 log entries. A due D3 deadline wins over 25 more recent posts.
  clock = at(95);
  logs = Array.from({ length: 25 }, (_, i) => log(`new-${i}`, { threads_timestamp: at(90) }));
  logs.push(log("due-outside-remote"), log("foreign", { metadata: { ...owner, workspaceId: "other" } }),
    log("foreign-account", { metadata: { ...owner, connectedAccountId: "other" } }),
    log("unknown-owner", { metadata: { workspaceId: owner.workspaceId } }));
  requests = [];
  const ranked = environment();
  await syncThreadsData(ranked, automatic, deps);
  assert.equal(requests.length, 20);
  assert.equal(requests[0], "due-outside-remote");
  assert.equal(requests.some((id) => id.startsWith("foreign") || id === "unknown-owner"), false);
  assert.ok(await getInsightSnapshot(ranked, { ...owner, postId: "due-outside-remote" }, "D3"));

  // Pagination includes an empty intermediate page, preserves the prefix and
  // opts in only for collection (other logger consumers remain compatible).
  const paged = environment();
  logs = [log("post-a")]; clock = at(25); requests = [];
  await paged.THREADS_KV.put(logs[0].key, JSON.stringify(logs[0].log));
  paged.THREADS_KV.pages = {
    first: { keys: [], list_complete: false, cursor: "middle" },
    middle: { keys: [], list_complete: false, cursor: "last" },
    last: { keys: [{ name: logs[0].key }], list_complete: true },
  };
  assert.deepEqual(await getPostLogEntries(paged), []);
  paged.THREADS_KV.lists = [];
  const { getPostLogEntries: ignored, ...realEnumeration } = deps;
  await syncThreadsData(paged, automatic, realEnumeration);
  assert.deepEqual(requests, ["post-a"]);
  assert.deepEqual(paged.THREADS_KV.lists, [{ prefix: "post_log:" }, { prefix: "post_log:", cursor: "middle" }, { prefix: "post_log:", cursor: "last" }]);
  assert.ok(await getInsightSnapshot(paged, first, "D1"));
  paged.THREADS_KV.pages.middle = { keys: [], list_complete: false, cursor: "middle" };
  await assert.rejects(getPostLogEntries(paged, { paginate: true }), /pagination unavailable/);

  // More than 500 expired owned logs across multiple pages must be discarded
  // from trusted provider/log timestamps before any cache/snapshot lookup. The
  // one live D1 candidate still reaches the provider within a small KV budget.
  const budgeted = environment();
  const expiredKeys = [];
  for (let index = 0; index < 500; index += 1) {
    const item = log(`expired-${index}`, { threads_timestamp: at(-200) });
    expiredKeys.push(item.key);
    budgeted.THREADS_KV.values.set(item.key, JSON.stringify(item.log));
  }
  const due = log("due-budget");
  budgeted.THREADS_KV.values.set(due.key, JSON.stringify(due.log));
  budgeted.THREADS_KV.pages = {
    first: { keys: expiredKeys.slice(0, 250).map((name) => ({ name })), list_complete: false, cursor: "second" },
    second: { keys: [...expiredKeys.slice(250), due.key].map((name) => ({ name })), list_complete: true },
  };
  budgeted.THREADS_KV.operations = 0;
  budgeted.THREADS_KV.reads = [];
  logs = [due]; remote = []; clock = at(25); requests = [];
  await syncThreadsData(budgeted, automatic, realEnumeration);
  const collectionOperations = budgeted.THREADS_KV.operations;
  assert.deepEqual(requests, ["due-budget"]);
  assert.ok(await getInsightSnapshot(budgeted, { ...owner, postId: "due-budget" }, "D1"));
  assert.equal(collectionOperations, 15);
  assert.equal(budgeted.THREADS_KV.operations, 16); // Includes one verification read.
  assert.equal(budgeted.THREADS_KV.reads.some((read) => typeof read === "string" &&
    (read.startsWith("post_insight:expired-") || read.includes(":expired-"))), false);
  assert.equal(budgeted.THREADS_KV.reads.filter(Array.isArray).length, 6);

  // Default legacy ownership remains based on a positive provider-list match.
  const legacy = environment();
  logs = [log("post-a", { metadata: {} })]; remote = [{ id: "post-a", timestamp: publishedAt }];
  await syncThreadsData(legacy, { automatic: true }, { ...deps,
    getThreadsCredentialForAccount: async () => ({ account: { id: "legacy", workspaceId: DEFAULT_WORKSPACE_ID }, credential: { access_token: "fixture" } }),
  });
  assert.ok(await getInsightSnapshot(legacy, { ...owner, workspaceId: DEFAULT_WORKSPACE_ID, connectedAccountId: "legacy", postId: "post-a" }, "D1"));

  const storageFailure = environment(); storageFailure.THREADS_KV.failSnapshots = true;
  logs = [log("post-a")]; remote = [];
  assert.equal((await syncThreadsData(storageFailure, automatic, deps)).insights.refreshed, 1);
  assert.ok(await storageFailure.THREADS_KV.get("post_insight:post-a", "json"));
  assert.equal(await getInsightSnapshot(storageFailure, first, "D1"), null);
} finally {
  globalThis.fetch = originalFetch;
}
console.log("insight snapshot fixtures passed (windows, validity, isolation, lifetime, candidates, pagination, manual compatibility)");
