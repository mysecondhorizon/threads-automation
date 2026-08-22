import {
  getThreadsProfile,
  publishImagePost,
  publishTextPost,
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

const PRODUCT_REVIEW_SOURCE =
  "manual_product_test";

const PRODUCT_REVIEW_FIRST_COMMENT_DELAY_MS =
  45 * 1000;

function normalizeMediaSelection(
  mediaSelection
) {
  if (
    mediaSelection?.mode !== "IMAGE"
  ) {
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
    !contentPoolId
  ) {
    throw new Error(
      "IMAGE media selection requires mediaId and contentPoolId"
    );
  }

  return {
    mode: "IMAGE",
    mediaId,
    contentPoolId,
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

  if (
    selection.mode === "IMAGE"
  ) {
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
