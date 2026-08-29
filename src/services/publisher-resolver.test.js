import assert from "node:assert/strict";
import { resolvePublisher, PublisherResolutionError } from "./publisher-resolver.js";
import { BUILT_IN_THREADS_APP_ID } from "./apps.js";

const threadsApp = { id: BUILT_IN_THREADS_APP_ID, type: "THREADS", active: true };
const resolve = (targetApp, format, app = threadsApp) => resolvePublisher({
  env: {}, targetApp, format,
  dependencies: { getApp: async (_env, id) => id === app.id ? app : null },
});

assert.equal((await resolve(null, "TEXT")).app.id, BUILT_IN_THREADS_APP_ID);
assert.equal((await resolve(BUILT_IN_THREADS_APP_ID, "TEXT")).publisher.provider, "THREADS");
await assert.rejects(
  resolve("missing", "TEXT"),
  (error) => error instanceof PublisherResolutionError && error.code === "APP_NOT_FOUND"
);
await assert.rejects(
  resolve("wordpress", "TEXT", { id: "wordpress", type: "WORDPRESS", active: true }),
  (error) => error instanceof PublisherResolutionError && error.code === "PUBLISHER_NOT_SUPPORTED"
);
await assert.rejects(
  resolve(BUILT_IN_THREADS_APP_ID, "HTML"),
  (error) => error instanceof PublisherResolutionError && error.code === "FORMAT_NOT_SUPPORTED"
);
console.log("publisher resolver fixture passed");
