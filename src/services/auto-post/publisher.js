import {
  getThreadsProfile,
  publishTextPost,
} from "../threads.js";

import {
  logPostSuccess,
  updatePostLogFirstComment,
} from "../logger.js";

import {
  publishFirstComment,
} from "./first-comment.js";

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
  }
) {
  const profile =
    await getThreadsProfile(
      accessToken
    );

  const publishResult =
    await publishTextPost(
      accessToken,
      profile.id,
      text
    );

  const logKey =
    await logPostSuccess(
    env,
    profile.username,
    publishResult.postId,
    text,
    {
      ...metadata,

      firstCommentTopicTag:
        firstCommentTopicTag ||
        null,
    }
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
    await updatePostLogFirstComment(
      env,
      logKey,
      firstCommentResult
    );
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
  };
}
