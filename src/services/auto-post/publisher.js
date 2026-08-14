import {
  getThreadsProfile,
  publishTextPost,
} from "../threads.js";

import {
  logPostSuccess,
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
  }
) {
  try {
    return await publishFirstComment({
      accessToken,
      userId,
      postId,
      firstComment,
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
    };
  }
}

export async function publishAutoPost(
  env,
  {
    accessToken,
    text,
    firstComment = "",
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

  await logPostSuccess(
    env,
    profile.username,
    publishResult.postId,
    text,
    metadata
  );

  const firstCommentResult =
    await safelyPublishFirstComment({
      accessToken,

      userId:
        profile.id,

      postId:
        publishResult.postId,

      firstComment,
    });

  return {
    profile,

    publishResult,

    firstCommentResult,
  };
}