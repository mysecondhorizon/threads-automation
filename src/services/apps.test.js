import assert from "node:assert/strict";
import {
  AppsError,
  BUILT_IN_THREADS_APP_ID,
  OPERATOR_APPS_KEY,
  createApp,
  deleteApp,
  getApp,
  listApps,
  updateApp,
} from "./apps.js";

function createEnv() {
  const values = new Map();
  let writes = 0;
  return {
    values,
    get writes() { return writes; },
    THREADS_KV: {
      async get(key, type) {
        const value = values.get(key) ?? null;
        return type === "json" && value !== null ? JSON.parse(value) : value;
      },
      async put(key, value) { writes += 1; values.set(key, value); },
    },
  };
}

const env = createEnv();
await env.THREADS_KV.put("threads_auth", JSON.stringify({ access_token: "secret-token" }));

const initial = await listApps(env);
assert.equal(initial.length, 1);
assert.deepEqual(initial[0], {
  id: BUILT_IN_THREADS_APP_ID,
  name: "Second Horizon Threads",
  type: "THREADS",
  active: true,
  createdAt: initial[0].createdAt,
  updatedAt: initial[0].updatedAt,
  connectionStatus: "CONNECTED",
  builtIn: true,
  deletable: false,
});
assert.equal(JSON.stringify(initial).includes("secret-token"), false);
assert.equal(JSON.parse(env.values.get(OPERATOR_APPS_KEY)).records.length, 1);
const writesAfterSeed = env.writes;
assert.equal((await listApps(env)).length, 1);
assert.equal(env.writes, writesAfterSeed);

await assert.rejects(
  createApp(env, { name: "Future", type: "WORDPRESS", active: true }),
  (error) => error instanceof AppsError && error.code === "app_type_unavailable"
);
await assert.rejects(
  createApp(env, { name: "Bad", type: "UNKNOWN", active: true }),
  (error) => error instanceof AppsError && error.code === "invalid_app"
);
await assert.rejects(
  createApp(env, { name: "Bad", type: "THREADS", active: true, accessToken: "no" }),
  (error) => error instanceof AppsError && error.code === "invalid_app"
);

const added = await createApp(env, { name: "Additional Threads", type: "THREADS", active: false }, {
  idFactory: () => "threads-secondary",
  now: () => "2026-08-29T00:00:00.000Z",
});
assert.equal(added.connectionStatus, "NOT_CONFIGURED");
assert.equal(added.active, false);
const renamed = await updateApp(env, BUILT_IN_THREADS_APP_ID, { name: "Renamed Threads", active: false }, {
  now: () => "2026-08-29T01:00:00.000Z",
});
assert.equal(renamed.name, "Renamed Threads");
assert.equal(renamed.active, false);
assert.equal(renamed.connectionStatus, "CONNECTED");
await assert.rejects(
  updateApp(env, BUILT_IN_THREADS_APP_ID, { id: "spoof" }),
  (error) => error instanceof AppsError && error.code === "invalid_app"
);
await assert.rejects(
  deleteApp(env, BUILT_IN_THREADS_APP_ID),
  (error) => error instanceof AppsError && error.code === "built_in_app_delete_forbidden"
);
assert.equal(await deleteApp(env, added.id, { now: () => "2026-08-29T02:00:00.000Z" }), true);
assert.equal(await getApp(env, added.id), null);
console.log("apps service fixture passed");
