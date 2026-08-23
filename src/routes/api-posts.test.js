import assert from "node:assert/strict";
import {
  handlePostById,
  handlePostsCollection,
} from "./api-posts.js";

function createEnv() {
  const values = new Map([["admin_session:session-1", "valid"]]);
  return {
    THREADS_KV: {
      async get(key, type) {
        const value = values.get(key) ?? null;
        return type === "json" && value !== null ? JSON.parse(value) : value;
      },
      async put(key, value) {
        values.set(key, value);
      },
    },
  };
}

function request(path, method = "GET", body, authenticated = true) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: {
      ...(authenticated ? { cookie: "admin_session=session-1" } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const env = createEnv();
const unauthorized = await handlePostsCollection(request("/api/posts", "GET", undefined, false), env, new URL("https://example.test/api/posts"));
assert.equal(unauthorized.status, 401);

const createdResponse = await handlePostsCollection(
  request("/api/posts", "POST", { body: " API 초안 ", status: "READY", sourceType: "AI" }),
  env,
  new URL("https://example.test/api/posts")
);
assert.equal(createdResponse.status, 201);
const created = (await createdResponse.json()).post;
assert.equal(created.body, "API 초안");
assert.equal(created.status, "READY");

const listedResponse = await handlePostsCollection(request("/api/posts?status=READY"), env, new URL("https://example.test/api/posts?status=READY"));
assert.equal((await listedResponse.json()).posts.length, 1);
const sourceFilteredResponse = await handlePostsCollection(request("/api/posts?sourceType=AI"), env, new URL("https://example.test/api/posts?sourceType=AI"));
assert.equal((await sourceFilteredResponse.json()).posts.length, 1);

const singleResponse = await handlePostById(request(`/api/posts/${created.id}`), env, created.id);
assert.equal((await singleResponse.json()).post.id, created.id);

const patchResponse = await handlePostById(
  request(`/api/posts/${created.id}`, "PATCH", { title: "수정", format: "HTML" }),
  env,
  created.id
);
assert.equal((await patchResponse.json()).post.format, "HTML");
const formatFilteredResponse = await handlePostsCollection(request("/api/posts?format=HTML"), env, new URL("https://example.test/api/posts?format=HTML"));
assert.equal((await formatFilteredResponse.json()).posts.length, 1);

const protectedResponse = await handlePostById(
  request(`/api/posts/${created.id}`, "PATCH", { publishedAt: "2026-08-01T00:00:00.000Z" }),
  env,
  created.id
);
assert.equal(protectedResponse.status, 400);

const missingResponse = await handlePostById(request("/api/posts/missing"), env, "missing");
assert.equal(missingResponse.status, 404);

const deletedResponse = await handlePostById(request(`/api/posts/${created.id}`, "DELETE"), env, created.id);
assert.equal(deletedResponse.status, 200);
assert.deepEqual(await deletedResponse.json(), { ok: true });
console.log("posts API fixture passed");
