import assert from "node:assert/strict";
import {
  OPERATOR_POSTS_KEY,
  PostsError,
  createPost,
  deletePost,
  getPost,
  listPosts,
  markPostPublished,
  updatePost,
} from "./posts.js";

function createEnv() {
  const values = new Map();
  return {
    values,
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

const env = createEnv();
const first = await createPost(env, {
  title: " 첫 초안 ",
  body: " 첫 번째 본문 ",
}, {
  now: "2026-08-01T00:00:00.000Z",
  idFactory: () => "post-1",
});

assert.equal(first.status, "DRAFT");
assert.equal(first.format, "TEXT");
assert.equal(first.sourceType, "MANUAL");
assert.equal(first.title, "첫 초안");
assert.equal(first.body, "첫 번째 본문");
assert.deepEqual(await getPost(env, "post-1"), first);

const second = await createPost(env, {
  body: "두 번째 본문",
  status: "READY",
  format: "HTML",
  sourceType: "AI",
  topicId: " topic-1 ",
  targetApp: " threads ",
}, {
  now: "2026-08-02T00:00:00.000Z",
  idFactory: () => "post-2",
});

assert.deepEqual((await listPosts(env)).map((post) => post.id), ["post-2", "post-1"]);
assert.deepEqual((await listPosts(env, { status: "READY" })).map((post) => post.id), ["post-2"]);

const updated = await updatePost(env, "post-1", {
  body: "수정된 본문",
  status: "READY",
}, { now: "2026-08-03T00:00:00.000Z" });
assert.equal(updated.id, "post-1");
assert.equal(updated.createdAt, "2026-08-01T00:00:00.000Z");
assert.equal(updated.updatedAt, "2026-08-03T00:00:00.000Z");
assert.equal((await listPosts(env))[0].id, "post-1");

const published = await markPostPublished(env, "post-1", "threads-post-1", {
  now: "2026-08-03T01:00:00.000Z",
});
assert.equal(published.status, "PUBLISHED");
assert.equal(published.publishedPostId, "threads-post-1");
assert.equal(published.publishedAt, "2026-08-03T01:00:00.000Z");
await assert.rejects(
  markPostPublished(env, "post-1", "threads-post-2"),
  (error) => error instanceof PostsError && error.code === "post_not_ready_for_publish"
);
await assert.rejects(
  updatePost(env, "post-1", { status: "DRAFT" }),
  (error) => error instanceof PostsError && error.code === "published_post_update_forbidden"
);

await assert.rejects(
  createPost(env, { body: "   " }),
  (error) => error instanceof PostsError && error.code === "invalid_post"
);
await assert.rejects(
  createPost(env, { body: "x", status: "PUBLISHED" }),
  (error) => error instanceof PostsError
);
await assert.rejects(
  updatePost(env, "post-1", { id: "other" }),
  (error) => error instanceof PostsError
);
await assert.rejects(
  createPost(env, { body: "duplicate" }, { idFactory: () => "post-1" }),
  (error) => error instanceof PostsError && error.code === "duplicate_post_id"
);

const store = JSON.parse(env.values.get(OPERATOR_POSTS_KEY));
store.records.find((post) => post.id === "post-2").status = "PUBLISHED";
store.records.find((post) => post.id === "post-2").publishedAt = "2026-08-04T00:00:00.000Z";
store.records.find((post) => post.id === "post-2").publishedPostId = "threads-1";
env.values.set(OPERATOR_POSTS_KEY, JSON.stringify(store));
await assert.rejects(
  deletePost(env, "post-2"),
  (error) => error instanceof PostsError && error.code === "published_post_delete_forbidden"
);

const deletable = await createPost(env, { body: "deletable" }, { idFactory: () => "post-3" });
assert.equal(await deletePost(env, deletable.id, { now: "2026-08-05T00:00:00.000Z" }), true);
assert.equal(await getPost(env, deletable.id), null);
console.log("posts service fixture passed");
