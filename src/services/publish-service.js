import { logPostSuccess } from "./logger.js";
import { PublisherResolutionError, resolvePublisher } from "./publisher-resolver.js";
import { ThreadsPublisherError } from "./publishers/threads-publisher.js";

export class OperatorPublishError extends Error {
  constructor(message, { code = "operator_publish_failed", status = 400 } = {}) {
    super(message);
    this.name = "OperatorPublishError";
    this.code = code;
    this.status = status;
  }
}

// Shared domain boundary for every publisher migration. It resolves only app
// metadata; adapters keep provider credentials in their existing stores.
export async function publishWithResolvedApp({
  env,
  targetApp,
  content,
  format,
  context = {},
  executionContext = null,
  dependencies = {},
}) {
  const resolve = dependencies.resolvePublisher || resolvePublisher;
  const resolved = await resolve({ env, targetApp, format, dependencies });
  return resolved.publisher.publish({
    env,
    content,
    format,
    app: resolved.app,
    context,
    executionContext,
    dependencies,
  });
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
  if ((post.format !== "TEXT" && post.format !== "HTML") || typeof post.body !== "string" || !post.body.trim()) {
    throw new OperatorPublishError("Post is not eligible for Threads publishing", {
      code: "invalid_operator_post_for_publish",
      status: 400,
    });
  }
}

export async function publishOperatorPost({
  env,
  post,
  executionContext = null,
  dependencies = {},
}) {
  assertPublishableOperatorPost(post);
  const logSuccess = dependencies.logPostSuccess || logPostSuccess;
  let publishResult;
  try {
    publishResult = await publishWithResolvedApp({
      env,
      targetApp: post.targetApp,
      content: post.body.trim(),
      format: post.format,
      context: { source: "OPERATOR", postId: post.id },
      executionContext,
      dependencies,
    });
  } catch (error) {
    if (error instanceof PublisherResolutionError) {
      if (error.code === "FORMAT_NOT_SUPPORTED" && post.format === "HTML") {
        throw new OperatorPublishError("HTML posts cannot be published to Threads yet", {
          code: "html_threads_publish_unsupported",
          status: 400,
        });
      }
      throw new OperatorPublishError(error.message, { code: error.code, status: error.status });
    }
    if (error instanceof ThreadsPublisherError && error.code === "threads_auth_missing") {
      throw new OperatorPublishError(error.message, { code: "threads_auth_missing", status: 400 });
    }
    console.error("Operator publisher adapter failed", { postId: post.id, code: error?.code || "PUBLISH_FAILED" });
    throw new OperatorPublishError("Threads publishing failed. Please try again later.", {
      code: "threads_publish_failed",
      status: 400,
    });
  }

  // This uses the existing post-log format; a tracking write failure must not
  // turn an already-successful external post into a caller-visible failure.
  try {
    await logSuccess(env, publishResult.logUsername, publishResult.externalPostId, post.body.trim(), {
      source: "OPERATOR",
      contentMode: "operator_post",
    });
  } catch (error) {
    console.warn("Operator publish success log failed", {
      postId: post.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return { app: publishResult.provider, postId: publishResult.externalPostId };
}
