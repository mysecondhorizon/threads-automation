import { requireAdminApiSession } from "../middleware/auth.js";
import {
  PostsError,
  createPost,
  deletePost,
  getPost,
  listPosts,
  updatePost,
} from "../services/posts.js";
import { fail, ok } from "../utils/response.js";

function apiError(error) {
  if (error instanceof PostsError) {
    return fail(error.message, error.status, { code: error.code });
  }
  console.error(error);
  return fail("Posts API Error", 400);
}

async function authorize(request, env) {
  const auth = await requireAdminApiSession(request, env);
  return auth.ok ? null : auth.response;
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
  const unauthorized = await authorize(request, env);
  if (unauthorized) return unauthorized;

  try {
    if (request.method === "GET") {
      return ok({ posts: await listPosts(env, getFilters(url)) });
    }
    if (request.method === "POST") {
      const post = await createPost(env, await readJson(request));
      return ok({ post }, 201);
    }
    return fail("Method Not Allowed", 405);
  } catch (error) {
    return apiError(error);
  }
}

export async function handlePostById(request, env, postId) {
  const unauthorized = await authorize(request, env);
  if (unauthorized) return unauthorized;

  try {
    if (request.method === "GET") {
      const post = await getPost(env, postId);
      return post ? ok({ post }) : fail("Post not found", 404, { code: "post_not_found" });
    }
    if (request.method === "PATCH") {
      const post = await updatePost(env, postId, await readJson(request));
      return post ? ok({ post }) : fail("Post not found", 404, { code: "post_not_found" });
    }
    if (request.method === "DELETE") {
      const deleted = await deletePost(env, postId);
      return deleted ? ok() : fail("Post not found", 404, { code: "post_not_found" });
    }
    return fail("Method Not Allowed", 405);
  } catch (error) {
    return apiError(error);
  }
}
