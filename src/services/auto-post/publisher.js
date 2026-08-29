import {
  getThreadsProfile,
  publishImagePost,
  publishTextPost,
  publishVideoPost,
} from "../threads.js";

import {
  markMediaUsed,
} from "../media.js";

import {
  markContentPoolItemUsed,
} from "../content-pool.js";

import {
  logPostSuccess,
  updatePostLogFirstComment,
} from "../logger.js";

import {
  publishFirstComment,
} from "./first-comment.js";

import {
  AutoPostEngineError,
} from "./errors.js";

import {
  publishWithResolvedApp,
} from "../publish-service.js";

import {
  ThreadsPublisherError,
} from "../publishers/threads-publisher.js";

const PRODUCT_REVIEW_SOURCE =
  "manual_product_test";

const PRODUCT_REVIEW_FIRST_COMMENT_DELAY_MS =
  45 * 1000;

function normalizeMediaSelection(
  mediaSelection
) {
  const mode = mediaSelection?.mode;
  if (mode !== "IMAGE" && mode !== "VIDEO") {
    return {
      mode: "TEXT",
      mediaId: null,
      contentPoolId: null,
      reason:
        mediaSelection?.reason ||
        null,
    };
  }

  const mediaId =
    String(
      mediaSelection.mediaId || ""
    ).trim();

  const contentPoolId =
    String(
      mediaSelection.contentPoolId || ""
    ).trim();

  if (
    !mediaId ||
    (mode === "IMAGE" && !contentPoolId)
  ) {
    throw new Error(
      mode === "IMAGE"
        ? "IMAGE media selection requires mediaId and contentPoolId"
        : "VIDEO media selection requires mediaId"
    );
  }

  return {
    mode,
    mediaId,
    contentPoolId: mode === "IMAGE" ? contentPoolId : null,
    reason:
      mediaSelection.reason ||
      null,
  };
}

function recordTrackingWarning(
  warnings,
  postId,
  category
) {
  warnings.push(category);

  console.warn(
    "Auto post tracking update failed",
    {
      postId,
      category,
    }
  );
}

async function waitBeforeFirstComment(
  delayMs
) {
  if (delayMs <= 0) {
    return;
  }

  await new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        delayMs
      )
  );
}

function serializeCommentError(
  error
) {
  if (
    error instanceof Error
  ) {
    return {
      name:
        error.name,

      message:
        error.message,

      step:
        error.step || null,

      details:
        error.details || null,
    };
  }

  return {
    name:
      "UnknownError",

    message:
      String(error),

    step:
      null,

    details:
      null,
  };
}

async function safelyPublishFirstComment(
  {
    accessToken,
    userId,
    postId,
    firstComment,
    topicTag,
  }
) {
  try {
    return await publishFirstComment({
      accessToken,
      userId,
      postId,
      firstComment,
      topicTag,
    });
  } catch (error) {
    const serializedError =
      serializeCommentError(
        error
      );

    console.error(
      "Auto post first comment failed",
      {
        postId,

        error:
          serializedError,
      }
    );

    return {
      published:
        false,

      replyId:
        null,

      text:
        String(
          firstComment || ""
        ).trim(),

      error:
        serializedError,

      topicTag:
        topicTag ||
        null,

      topicApplied:
        typeof error?.topicApplied === "boolean"
          ? error.topicApplied
          : topicTag
            ? false
            : null,

      topicError:
        error?.topicError ||
        null,
    };
  }
}

export async function publishAutoPost(
  env,
  {
    accessToken,
    text,
    firstComment = "",
    firstCommentTopicTag = null,
    metadata = null,
    mediaSelection = null,
  }
) {
  const selection =
    normalizeMediaSelection(
      mediaSelection
    );

  const profile =
    await getThreadsProfile(
      accessToken
    );

  const publishResult =
    selection.mode === "IMAGE"
      ? await publishImagePost(
        env,
        accessToken,
        profile.id,
        text,
        selection.mediaId
      )
      : selection.mode === "VIDEO"
        ? await publishVideoPost(
          env,
          accessToken,
          profile.id,
          text,
          selection.mediaId
        )
        : await publishTextPost(
        accessToken,
        profile.id,
        text
      );

  const trackingWarnings = [];

  let logKey = null;

  try {
    logKey =
      await logPostSuccess(
        env,
        profile.username,
        publishResult.postId,
        text,
        {
          ...metadata,

          publishMode:
            selection.mode,

          mediaId:
            selection.mediaId,

          contentPoolId:
            selection.contentPoolId,

          firstCommentTopicTag:
            firstCommentTopicTag ||
            null,
        }
      );
  } catch (error) {
    recordTrackingWarning(
      trackingWarnings,
      publishResult.postId,
      "post_success_log_failed"
    );
  }

  if (selection.mode === "IMAGE" || selection.mode === "VIDEO") {
    try {
      await markMediaUsed(
        env,
        selection.mediaId
      );
    } catch (error) {
      recordTrackingWarning(
        trackingWarnings,
        publishResult.postId,
        "media_usage_update_failed"
      );
    }

    if (selection.mode === "IMAGE") {
      try {
        await markContentPoolItemUsed(
          env,
          selection.contentPoolId
        );
      } catch (error) {
        recordTrackingWarning(
          trackingWarnings,
          publishResult.postId,
          "content_pool_usage_update_failed"
        );
      }
    }
  }

  await waitBeforeFirstComment(
    metadata?.source ===
      PRODUCT_REVIEW_SOURCE &&
    String(
      firstComment || ""
    ).trim()
      ? PRODUCT_REVIEW_FIRST_COMMENT_DELAY_MS
      : 0
  );

  const firstCommentResult =
    await safelyPublishFirstComment({
      accessToken,

      userId:
        profile.id,

      postId:
        publishResult.postId,

      firstComment,

      topicTag:
        firstCommentTopicTag,
    });

  try {
    if (logKey) {
      await updatePostLogFirstComment(
        env,
        logKey,
        firstCommentResult
      );
    }
  } catch (error) {
    console.error(
      "Post log first comment metadata update failed",
      {
        postId:
          publishResult.postId,

        error:
          serializeCommentError(
            error
          ),
      }
    );
  }

  return {
    profile,

    publishResult,

    firstCommentResult,

    mediaSelection:
      selection,

    trackingWarnings,
  };
}

// General AUTO alone is migrated to the shared adapter. Reviewed publishing,
// including Product Review candidate flows, stays on publishAutoPost above.
export async function publishGeneralAutoPost(
  env,
  {
    accessToken,
    text,
    firstComment = "",
    firstCommentTopicTag = null,
    metadata = null,
    mediaSelection = null,
    dependencies = {},
  }
) {
  const selection = normalizeMediaSelection(mediaSelection);
  if (selection.mode === "VIDEO") {
    throw new AutoPostEngineError(
      "General AUTO does not support video publishing",
      { code: "FORMAT_NOT_SUPPORTED", status: 400, step: "publishing" }
    );
  }

  let published;
  try {
    published = await publishWithResolvedApp({
      env,
      targetApp: null,
      content: text,
      format: "TEXT",
      context: {
        source: "GENERAL_AUTO",
        mediaSelection: selection,
      },
      dependencies,
    });
  } catch (error) {
    if (error?.code === "APP_NOT_FOUND" || error?.code === "PUBLISHER_NOT_SUPPORTED") {
      throw new AutoPostEngineError(
        "General AUTO publishing target is unavailable",
        { code: error.code, status: error.status, step: "publishing", cause: error }
      );
    }
    if (error instanceof ThreadsPublisherError) {
      throw new AutoPostEngineError(
        "Automatic Threads publishing failed",
        {
          code: error.code === "FORMAT_NOT_SUPPORTED" ? error.code : "threads_publish_failed",
          status: error.status,
          step: "publishing",
          cause: error,
        }
      );
    }
    throw error;
  }

  const profile = {
    id: published.publisherUserId,
    username: published.logUsername,
  };
  const publishResult = { postId: published.externalPostId };
  const trackingWarnings = [];
  const logSuccess = dependencies.logPostSuccess || logPostSuccess;
  const markUsed = dependencies.markMediaUsed || markMediaUsed;
  const markPoolUsed = dependencies.markContentPoolItemUsed || markContentPoolItemUsed;
  const updateFirstComment = dependencies.updatePostLogFirstComment || updatePostLogFirstComment;
  let logKey = null;

  try {
    logKey = await logSuccess(env, profile.username, publishResult.postId, text, {
      ...metadata,
      publishMode: selection.mode,
      mediaId: selection.mediaId,
      contentPoolId: selection.contentPoolId,
      firstCommentTopicTag: firstCommentTopicTag || null,
    });
  } catch (error) {
    recordTrackingWarning(trackingWarnings, publishResult.postId, "post_success_log_failed");
  }

  if (selection.mode === "IMAGE") {
    try {
      await markUsed(env, selection.mediaId);
    } catch (error) {
      recordTrackingWarning(trackingWarnings, publishResult.postId, "media_usage_update_failed");
    }
    try {
      await markPoolUsed(env, selection.contentPoolId);
    } catch (error) {
      recordTrackingWarning(trackingWarnings, publishResult.postId, "content_pool_usage_update_failed");
    }
  }

  const firstCommentResult = await safelyPublishFirstComment({
    accessToken,
    userId: profile.id,
    postId: publishResult.postId,
    firstComment,
    topicTag: firstCommentTopicTag,
  });
  try {
    if (logKey) await updateFirstComment(env, logKey, firstCommentResult);
  } catch (error) {
    console.error("Post log first comment metadata update failed", {
      postId: publishResult.postId,
      error: serializeCommentError(error),
    });
  }

  return {
    profile,
    publishResult,
    firstCommentResult,
    mediaSelection: selection,
    trackingWarnings,
  };
}
