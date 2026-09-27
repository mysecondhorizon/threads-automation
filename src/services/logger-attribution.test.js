import assert from "node:assert/strict";
import { test, after } from "node:test";
import { getScopedSuccessfulPostLog } from "./logger.js";

const identity = { workspaceId: "ws", connectedAccountId: "account", threadsUserId: "user", postId: "post" };
const log = (changes = {}) => ({ status: "published", post_id: identity.postId, metadata: { ...identity }, ...changes });
const forbiddenCalls = { network: 0, writes: 0 };
class ReadOnlyKv {
  constructor(logs = [log()], pageSize = 1000) {
    this.values = new Map(logs.map((item, index) => [`post_log:${String(index).padStart(5, "0")}:fixture`, item]));
    this.pageSize = pageSize;
    this.lists = [];
    this.reads = [];
  }
  async list(options) {
    assert.equal(options.prefix, "post_log:");
    assert.equal(options.limit, 1000);
    this.lists.push(options);
    const names = [...this.values.keys()].sort();
    const start = Number(options.cursor || 0);
    const end = Math.min(start + this.pageSize, names.length);
    return { keys: names.slice(start, end).map((name) => ({ name })), list_complete: end === names.length, cursor: String(end) };
  }
  async get(names, type) {
    assert.ok(Array.isArray(names) && names.length > 0 && names.length <= 100);
    assert.equal(type, "json");
    this.reads.push(names);
    return new Map(names.map((name) => [name, structuredClone(this.values.get(name))]));
  }
  async put() { forbiddenCalls.writes += 1; assert.fail("attribution must never write"); }
  async delete() { forbiddenCalls.writes += 1; assert.fail("attribution must never delete"); }
}
const read = (kv, scope = identity) => getScopedSuccessfulPostLog({ THREADS_KV: kv }, scope);
async function unavailable(kv, reason, scope = identity) {
  const result = await read(kv, scope);
  assert.equal(result.available, false);
  assert.equal(result.reason, reason);
  assert.equal(result.entry, null);
  assert.equal(JSON.stringify(result).includes("private"), false);
  return result;
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { forbiddenCalls.network += 1; assert.fail("no external calls"); };
after(() => {
  globalThis.fetch = originalFetch;
  assert.deepEqual(forbiddenCalls, { network: 0, writes: 0 });
});

test("exact identity, explicit scope, published status and complete unique discovery", async () => {
  for (const field of Object.keys(identity)) {
    const foreign = field === "postId" ? log({ post_id: "foreign" }) : log({ metadata: { ...identity, [field]: "foreign" } });
    await unavailable(new ReadOnlyKv([foreign]), "published_log_not_found");
    const legacy = field === "postId" ? log({ post_id: null }) : log({ metadata: { ...identity, [field]: null } });
    await unavailable(new ReadOnlyKv([legacy]), "published_log_not_found");
    for (const value of [null, "", " ", 10]) {
      const kv = new ReadOnlyKv();
      await unavailable(kv, "invalid_log_identity", { ...identity, [field]: value });
      assert.equal(kv.lists.length, 0);
    }
    const scoped = await read(new ReadOnlyKv([foreign, log(), legacy], 1));
    assert.equal(scoped.available, true);
    assert.equal(scoped.discovery.listCalls, 3);
    assert.equal(scoped.entry.key, "post_log:00001:fixture");
  }
  await unavailable(new ReadOnlyKv([]), "published_log_not_found");
  await unavailable(new ReadOnlyKv([log({ status: "failed" }), log({ status: "deleted" })]), "published_log_not_found");
  await unavailable(new ReadOnlyKv([log(), log()], 1), "published_log_ambiguous");
});

test("list/read errors after a first match never expose a partial authoritative result", async () => {
  for (const stage of ["list", "get"]) {
    const kv = new ReadOnlyKv([log(), log({ status: "failed" })], 1);
    const original = kv[stage].bind(kv);
    kv[stage] = async (...args) => {
      if (kv.reads.length) throw new Error("private provider failure");
      return original(...args);
    };
    await unavailable(kv, stage === "list" ? "log_list_failed" : "log_bulk_read_failed");
  }
  for (const response of [null, [], {}, new Map(), new Map([["post_log:00000:fixture", null]]),
    new Map([["post_log:00000:fixture", []]]), new Map([["post_log:00000:fixture", "bad"]])]) {
    const kv = new ReadOnlyKv();
    kv.get = async () => response;
    await unavailable(kv, "log_bulk_read_failed");
  }
});

test("invalid, looping and repeated-key pagination fails; empty intermediate pages continue", async () => {
  const badPages = [null, {}, { keys: [], list_complete: "true" }, { keys: [null], list_complete: true },
    { keys: [{ name: "other:key" }], list_complete: true }, { keys: [], list_complete: false },
    { keys: [], list_complete: false, cursor: 1 }];
  for (const page of badPages) {
    const kv = new ReadOnlyKv(); kv.list = async () => page;
    await unavailable(kv, "log_pagination_invalid");
  }
  const looping = new ReadOnlyKv();
  looping.list = async () => ({ keys: [], list_complete: false, cursor: "loop" });
  await unavailable(looping, "log_pagination_invalid");
  const repeated = new ReadOnlyKv();
  repeated.list = async (options) => ({ keys: [{ name: "post_log:00000:fixture" }], list_complete: Boolean(options.cursor), cursor: "next" });
  await unavailable(repeated, "log_pagination_invalid");
  const empty = new ReadOnlyKv();
  const original = empty.list.bind(empty);
  empty.list = async (options) => options.cursor === "after-empty" ? original({ ...options, cursor: undefined }) :
    { keys: [], list_complete: false, cursor: "after-empty" };
  assert.equal((await read(empty)).available, true);
});

test("key, list and bulk-read budgets are bounded and inclusive", async () => {
  const records = (count) => [log(), ...Array.from({ length: count - 1 }, () => log({ status: "failed" }))];
  const overKeys = new ReadOnlyKv(records(5001));
  const keys = await unavailable(overKeys, "log_key_budget_exceeded");
  assert.equal(keys.discovery.scannedKeys, 5001);
  assert.equal(keys.discovery.bulkReadCalls, 50);
  const overLists = new ReadOnlyKv(records(21), 1);
  await unavailable(overLists, "log_list_budget_exceeded");
  assert.equal(overLists.lists.length, 20);
  const overReads = new ReadOnlyKv(records(3417), 201);
  await unavailable(overReads, "log_bulk_budget_exceeded");
  assert.equal(overReads.reads.length, 50);
  const exactKeys = await read(new ReadOnlyKv(records(5000)));
  assert.equal(exactKeys.available, true);
  assert.equal(exactKeys.discovery.bulkReadCalls, 50);
  const exactLists = await read(new ReadOnlyKv(records(20), 1));
  assert.equal(exactLists.available, true);
  assert.equal(exactLists.discovery.listCalls, 20);
});
