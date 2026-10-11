import assert from "node:assert/strict";
import test from "node:test";
import { hasPlatformOperatorGrant, PLATFORM_OPERATOR_GRANTS_KEY } from "./platform-operators.js";

const registry = grants => ({ version: 1, grants });
const allowed = { userId: "user-a", active: true };
function fixture(value) {
  return { THREADS_KV: {
    async get(key, type) { assert.equal(key, PLATFORM_OPERATOR_GRANTS_KEY); assert.equal(type, "json"); return structuredClone(value); },
    async put() { assert.fail("No writes allowed"); }, async delete() { assert.fail("No deletes allowed"); },
  } };
}

test("only exact explicit active grants authorize, and input is not mutated", async () => {
  const value = registry([allowed, { userId: "user-b", active: false }]);
  assert.equal(await hasPlatformOperatorGrant(fixture(value), "user-a"), true);
  assert.equal(await hasPlatformOperatorGrant(fixture(value), "user-b"), false);
  assert.equal(await hasPlatformOperatorGrant(fixture(value), "user-c"), false);
  assert.equal(await hasPlatformOperatorGrant(fixture(value), "USER-A"), false);
  assert.deepEqual(value, registry([allowed, { userId: "user-b", active: false }]));
});

test("missing, malformed or duplicate registry fails closed as a whole", async () => {
  for (const value of [null, [], {}, registry([]), { version: 2, grants: [allowed] }, { ...registry([allowed]), role: "operator" },
    registry([allowed, allowed]), registry([allowed, { ...allowed, active: false }]), registry([allowed, null]),
    registry([allowed, { userId: "bad id", active: true }]), registry([{ ...allowed, active: "true" }]),
    registry([{ ...allowed, extra: true }]), registry([allowed, { userId: "legacy-owner", active: true }])]) {
    assert.equal(await hasPlatformOperatorGrant(fixture(value), "user-a"), false);
  }
});

test("bounds allow 100 grants, deny 101 and invalid identities before reads", async () => {
  const grants = Array.from({ length: 100 }, (_, i) => ({ userId: `user-${i}`, active: true }));
  assert.equal(await hasPlatformOperatorGrant(fixture(registry(grants)), "user-0"), true);
  assert.equal(await hasPlatformOperatorGrant(fixture(registry([...grants, { userId: "extra", active: true }])), "user-0"), false);
  const env = { THREADS_KV: { async get() { assert.fail("Invalid identity must not read grants"); } } };
  for (const id of [null, {}, "", " user-a", "user-a ", "a".repeat(121), "legacy-owner", "user\n"])
    assert.equal(await hasPlatformOperatorGrant(env, id), false);
});

test("read failures propagate to the guard rather than yielding permission", async () => {
  await assert.rejects(hasPlatformOperatorGrant({ THREADS_KV: { async get() { throw new Error("offline"); } } }, "user-a"));
});
