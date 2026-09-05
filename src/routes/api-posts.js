import { requireAdminApiSession } from "../middleware/auth.js";
import {
  PostsError,
  createPost,
  deletePost,
  getPost,
  listPosts,
  markPostPublished,
  updatePost,
} from "../services/posts.js";
import { OperatorPublishError, publishOperatorPost } from "../services/publish-service.js";
import { deleteKey, getJson, putJson } from "../services/kv.js";
import { fail, ok } from "../utils/response.js";

function apiError(error) {
  if (error instanceof PostsError) {
    return fail(error.message, error.status, { code: error.code });
  }
  if (error instanceof OperatorPublishError) {
    return fail(error.message, error.status, { code: error.code });
  }
  console.error(error);
  return fail("Posts API Error", 400);
}

const activeOperatorPublishes = new Set();
const OPERATOR_POST_PUBLISH_LOCK_PREFIX = "operator_post_publish_lock:";
const OPERATOR_POST_PUBLISH_LOCK_TTL_SECONDS = 300;

function getPublishLockKey(postId) {
  return `${OPERATOR_POST_PUBLISH_LOCK_PREFIX}${encodeURIComponent(postId)}`;
}

async function acquirePublishLock(env, postId) {
  const key = getPublishLockKey(postId);
  if (await getJson(env, key)) return null;
  const token = crypto.randomUUID();
  await putJson(env, key, { token }, { expirationTtl: OPERATOR_POST_PUBLISH_LOCK_TTL_SECONDS });
  const stored = await getJson(env, key);
  return stored?.token === token ? { key, token } : null;
}

async function releasePublishLock(env, lock) {
  if (!lock) return;
  const stored = await getJson(env, lock.key);
  if (stored?.token === lock.token) await deleteKey(env, lock.key);
}

export async function handlePostPublish(request, env, postId, { publish = publishOperatorPost } = {}) {
  const authorization = await requireAdminApiSession(request, env);
  if (!authorization.ok) return authorization.response;
  if (request.method !== "POST") return fail("Method Not Allowed", 405);
  if (activeOperatorPublishes.has(postId)) {
    return fail("This post is already being published", 409, { code: "post_publish_in_progress" });
  }

  activeOperatorPublishes.add(postId);
  let lock = null;
  try {
    lock = await acquirePublishLock(env, postId);
    if (!lock) {
      return fail("This post is already being published", 409, { code: "post_publish_in_progress" });
    }
    const post = await getPost(env, postId);
    if (!post) return fail("Post not found", 404, { code: "post_not_found" });
    // Recheck immediately before the side effect. The publish service repeats
    // format/content checks, while this route owns the state boundary.
    if (post.status !== "READY") {
      throw new PostsError("Only READY posts can be published", {
        code: "post_not_ready_for_publish",
        status: 409,
      });
    }
    const published = await publish({ env, post });
    const updatedPost = await markPostPublished(env, postId, published.postId);
    if (!updatedPost) return fail("Post not found", 404, { code: "post_not_found" });
    return ok({
      post: updatedPost,
      published: { app: published.app, postId: published.postId },
    });
  } catch (error) {
    return apiError(error);
  } finally {
    try {
      await releasePublishLock(env, lock);
    } catch (error) {
      console.warn("Operator post publish lock release failed", { postId });
    }
    activeOperatorPublishes.delete(postId);
  }
}

async function authorize(request, env) {
  return requireAdminApiSession(request, env, { allowSelectedWorkspace: true });
}

function getFilters(url) {
  const filters = {};
  for (const name of ["status", "format", "sourceType"]) {
    if (url.searchParams.has(name)) filters[name] = url.searchParams.get(name);
  }
  return filters;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new PostsError("Invalid JSON body", { code: "invalid_json" });
  }
}

export async function handlePostsCollection(request, env, url) {
  const authorization = await authorize(request, env);
  if (!authorization.ok) return authorization.response;

  try {
    if (request.method === "GET") {
      return ok({ posts: await listPosts(env, getFilters(url), authorization.workspaceId) });
    }
    if (request.method === "POST") {
      const post = await createPost(env, await readJson(request), { workspaceId: authorization.workspaceId });
      return ok({ post }, 201);
    }
    return fail("Method Not Allowed", 405);
  } catch (error) {
    return apiError(error);
  }
}

export async function handlePostById(request, env, postId) {
  const authorization = await authorize(request, env);
  if (!authorization.ok) return authorization.response;

  try {
    if (request.method === "GET") {
      const post = await getPost(env, postId, authorization.workspaceId);
      return post ? ok({ post }) : fail("Post not found", 404, { code: "post_not_found" });
    }
    if (request.method === "PATCH") {
      const post = await updatePost(env, postId, await readJson(request), { workspaceId: authorization.workspaceId });
      return post ? ok({ post }) : fail("Post not found", 404, { code: "post_not_found" });
    }
    if (request.method === "DELETE") {
      const deleted = await deletePost(env, postId, { workspaceId: authorization.workspaceId });
      return deleted ? ok() : fail("Post not found", 404, { code: "post_not_found" });
    }
    return fail("Method Not Allowed", 405);
  } catch (error) {
    return apiError(error);
  }
}
