import assert from "node:assert/strict";
import { handleAppById, handleAppsCollection } from "./api-apps.js";
import { BUILT_IN_THREADS_APP_ID } from "../services/apps.js";

function createEnv(authenticated = true) {
  const values = new Map();
  if (authenticated) values.set("admin_session:session-1", "valid");
  values.set("threads_auth", JSON.stringify({ access_token: "private-access-token" }));
  return {
    values,
    THREADS_KV: {
      async get(key, type) { const value = values.get(key) ?? null; return type === "json" && value !== null ? JSON.parse(value) : value; },
      async put(key, value) { values.set(key, value); },
    },
  };
}

function request(path, method = "GET", body, authenticated = true) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: { ...(authenticated ? { cookie: "admin_session=session-1" } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

assert.equal((await handleAppsCollection(request("/api/apps", "GET", undefined, false), createEnv(false))).status, 401);
const env = createEnv();
const listed = await handleAppsCollection(request("/api/apps"), env);
const listedBody = await listed.json();
assert.equal(listed.status, 200);
assert.equal(listedBody.apps.length, 1);
assert.equal(listedBody.apps[0].connectionStatus, "CONNECTED");
assert.equal(JSON.stringify(listedBody).includes("private-access-token"), false);

const invalidType = await handleAppsCollection(request("/api/apps", "POST", { name: "Future", type: "WORDPRESS", active: true }), env);
assert.equal(invalidType.status, 400);
const protectedField = await handleAppsCollection(request("/api/apps", "POST", { name: "Bad", type: "THREADS", active: true, createdAt: "spoof" }), env);
assert.equal(protectedField.status, 400);
const created = await handleAppsCollection(request("/api/apps", "POST", { name: "Extra", type: "THREADS", active: true }), env);
assert.equal(created.status, 201);
const createdApp = (await created.json()).app;
assert.equal(createdApp.type, "THREADS");

const updated = await handleAppById(request(`/api/apps/${BUILT_IN_THREADS_APP_ID}`, "PATCH", { name: "Display name", active: false }), env, BUILT_IN_THREADS_APP_ID);
assert.equal(updated.status, 200);
assert.equal((await updated.json()).app.name, "Display name");
const read = await handleAppById(request(`/api/apps/${BUILT_IN_THREADS_APP_ID}`), env, BUILT_IN_THREADS_APP_ID);
assert.equal((await read.json()).app.active, false);
const builtinDelete = await handleAppById(request(`/api/apps/${BUILT_IN_THREADS_APP_ID}`, "DELETE"), env, BUILT_IN_THREADS_APP_ID);
assert.equal(builtinDelete.status, 400);
assert.equal((await builtinDelete.json()).code, "built_in_app_delete_forbidden");
const deleted = await handleAppById(request(`/api/apps/${createdApp.id}`, "DELETE"), env, createdApp.id);
assert.equal(deleted.status, 200);
console.log("operator apps API fixture passed");
