import {
  publishTextReply,
} from "../threads.js";

function normalizeFirstComment(
  value
) {
  const text =
    String(
      value || ""
    ).trim();

  if (
    !text ||
    text === "없음" ||
    text === "해당 없음"
  ) {
    return "";
  }

  return text;
}

export async function publishFirstComment(
  {
    accessToken,
    userId,
    postId,
    firstComment,
    topicTag = null,
  }
) {
  const text =
    normalizeFirstComment(
      firstComment
    );

  if (!text) {
    return {
      published:
        false,

      replyId:
        null,

      text:
        "",

      topicTag:
        null,

      topicApplied:
        null,

      topicError:
        null,
    };
  }

  const result =
    await publishTextReply(
      accessToken,
      userId,
      postId,
      text,
      {
        topicTag,
      }
    );

  return {
    published:
      true,

    replyId:
      result.replyId,

    text,

    topicTag:
      result.topicTag,

    topicApplied:
      result.topicApplied,

    topicError:
      result.topicError,
  };
}
