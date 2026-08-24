import { getJson } from "./kv.js";
import { logPostSuccess } from "./logger.js";
import { getThreadsProfile, publishTextPost } from "./threads.js";

export class OperatorPublishError extends Error {
  constructor(message, { code = "operator_publish_failed", status = 400 } = {}) {
    super(message);
    this.name = "OperatorPublishError";
    this.code = code;
    this.status = status;
  }
}

function assertPublishableOperatorPost(post) {
  if (!post || typeof post !== "object") {
    throw new OperatorPublishError("Post not found", { code: "post_not_found", status: 404 });
  }
  if (post.status !== "READY") {
    throw new OperatorPublishError("Only READY posts can be published", {
      code: "post_not_ready_for_publish",
      status: 409,
    });
  }
  if (post.format === "HTML") {
    throw new OperatorPublishError("HTML posts cannot be published to Threads yet", {
      code: "html_threads_publish_unsupported",
      status: 400,
    });
  }
  if (post.format !== "TEXT" || typeof post.body !== "string" || !post.body.trim()) {
    throw new OperatorPublishError("Post is not eligible for Threads publishing", {
      code: "invalid_operator_post_for_publish",
      status: 400,
    });
  }
}

// R8 is intentionally a thin one-target service boundary. The route does not
// couple directly to low-level Threads container/publish calls.
export async function publishOperatorPost({ env, post, dependencies = {} }) {
  assertPublishableOperatorPost(post);
  const readJson = dependencies.getJson || getJson;
  const loadProfile = dependencies.getThreadsProfile || getThreadsProfile;
  const publishText = dependencies.publishTextPost || publishTextPost;
  const logSuccess = dependencies.logPostSuccess || logPostSuccess;
  const threadsAuth = await readJson(env, "threads_auth");
  if (!threadsAuth?.access_token) {
    throw new OperatorPublishError("Threads account is not connected", {
      code: "threads_auth_missing",
      status: 400,
    });
  }

  let profile;
  let publishResult;
  try {
    profile = await loadProfile(threadsAuth.access_token);
    publishResult = await publishText(threadsAuth.access_token, profile.id, post.body.trim());
  } catch (error) {
    console.error("Operator Threads publish failed", {
      postId: post.id,
      step: error?.step || "threads_publish",
    });
    throw new OperatorPublishError("Threads publishing failed. Please try again later.", {
      code: "threads_publish_failed",
      status: 400,
    });
  }

  // This uses the existing post-log format; a tracking write failure must not
  // turn an already-successful external post into a caller-visible failure.
  try {
    await logSuccess(env, profile.username, publishResult.postId, post.body.trim(), {
      source: "OPERATOR",
      contentMode: "operator_post",
    });
  } catch (error) {
    console.warn("Operator publish success log failed", {
      postId: post.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return { app: "THREADS", postId: publishResult.postId };
}
