import {
  getJson,
} from "../kv.js";

import {
  validateAutoPostText,
  AutoPostValidationError,
} from "../auto-post-validator.js";

import {
  AutoPostEngineError,
  serializeAutoPostError,
} from "./errors.js";

import {
  saveExecution,
  updateExecution,
} from "./execution-store.js";

import {
  acquireExecutionLock,
  releaseExecutionLock,
} from "./lock.js";

import {
  publishAutoPost,
} from "./publisher.js";

function createExecutionId() {
  if (
    globalThis.crypto &&
    typeof globalThis.crypto
      .randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return [
    Date.now().toString(36),
    Math.random()
      .toString(36)
      .slice(2, 12),
  ].join("-");
}

function createExecution(
  executionId,
  {
    postType,
    firstComment,
    source,
  }
) {
  const now =
    new Date().toISOString();

  return {
    id:
      executionId,

    source:
      source,

    status:
      "starting",

    step:
      "initializing",

    startedAt:
      now,

    updatedAt:
      now,

    completedAt:
      null,

    postId:
      null,

    username:
      null,

    postType:
      postType || null,

    textLength:
      null,

    firstComment: {
      requested:
        Boolean(
          firstComment
        ),

      published:
        false,

      replyId:
        null,

      text:
        firstComment,

      error:
        null,
    },

    error:
      null,
  };
}

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
    text === "해당 없음" ||
    text.toLowerCase() ===
      "none" ||
    text.toLowerCase() ===
      "null"
  ) {
    return "";
  }

  if (
    text.length > 500
  ) {
    throw new AutoPostValidationError(
      "첫 댓글이 500자를 초과했습니다.",
      {
        code:
          "first_comment_too_long",

        details: {
          length:
            text.length,

          maxLength:
            500,
        },
      }
    );
  }

  return text;
}

function normalizePostType(
  value
) {
  return String(
    value || ""
  ).trim();
}

function normalizeReviewedError(
  error,
  text
) {
  if (
    error instanceof
    AutoPostEngineError
  ) {
    if (!error.text) {
      error.text =
        text;
    }

    return error;
  }

  if (
    error instanceof
    AutoPostValidationError
  ) {
    return new AutoPostEngineError(
      error.message,
      {
        code:
          error.code,

        status:
          400,

        step:
          "validation",

        details:
          error.details,

        text,

        cause:
          error,
      }
    );
  }

  return new AutoPostEngineError(
    "검수된 자동 게시글을 게시하지 못했습니다.",
    {
      code:
        "reviewed_publish_failed",

      status:
        500,

      step:
        error?.step ||
        "reviewed_publish",

      details:
        error?.details ||
        serializeAutoPostError(
          error
        ),

      text,

      cause:
        error instanceof Error
          ? error
          : null,
    }
  );
}

function normalizeFirstCommentResult(
  firstComment,
  result,
  topicTag = null
) {
  return {
    requested:
      Boolean(
        firstComment
      ),

    published:
      Boolean(
        result?.published
      ),

    replyId:
      result?.replyId ||
      null,

    text:
      result?.text ||
      firstComment ||
      "",

    error:
      result?.error ||
      null,

    topicTag:
      result?.topicTag ||
      topicTag ||
      null,

    topicApplied:
      typeof result?.topicApplied === "boolean"
        ? result.topicApplied
        : null,

    topicError:
      result?.topicError ||
      null,
  };
}

export async function publishReviewedAutoPost(
  env,
  {
    text,
    postType = "",
    contentType = "",
    topic = "",
    emotion = "",
    hookStyle = "",
    endingStyle = "",
    questionUsed = false,
    productId = null,
    productConnected = false,
    affiliateLinkUsed = false,
    affiliateDisclosureRequired = false,
    firstComment = "",
    firstCommentTopicTag = null,
    source = "reviewed_preview",
    candidateId = null,
    mediaSelection = null,
  }
) {
  const executionId =
    createExecutionId();

  const normalizedPostType =
    normalizePostType(
      postType
    );

  const normalizedSource =
    source === "manual_product_test"
      ? "manual_product_test"
      : "reviewed_preview";

  const metadata = {
    source:
      normalizedSource,

    candidateId:
      candidateId
        ? String(candidateId).trim() || null
        : null,

    style:
      normalizePostType(
        postType
      ) ||
      null,

    contentType:
      String(
        contentType || ""
      ).trim() ||
      null,

    topic:
      String(
        topic || ""
      ).trim() ||
      null,

    emotion:
      String(
        emotion || ""
      ).trim() ||
      null,

    hookStyle:
      String(
        hookStyle || ""
      ).trim() ||
      null,

    endingStyle:
      String(
        endingStyle || ""
      ).trim() ||
      null,

    questionUsed:
      Boolean(
        questionUsed
      ),

    productId:
      productId
        ? String(
            productId
          ).trim() ||
          null
        : null,

    productConnected:
      Boolean(
        productConnected
      ),

    affiliateLinkUsed:
      Boolean(
        affiliateLinkUsed
      ),

    affiliateDisclosureRequired:
      Boolean(
        affiliateDisclosureRequired
      ),

    firstCommentTopicTag:
      firstCommentTopicTag
        ? String(firstCommentTopicTag).trim() || null
        : null,
  };

  let normalizedText =
    String(
      text || ""
    ).trim();

  let normalizedFirstComment =
    "";

  let lockAcquired =
    false;

  const execution =
    createExecution(
      executionId,
      {
        postType:
          normalizedPostType,

        firstComment:
          "",

        source:
          normalizedSource,
      }
    );

  await saveExecution(
    env,
    executionId,
    execution
  );

  try {
    await acquireExecutionLock(
      env,
      executionId
    );

    lockAcquired =
      true;

    await updateExecution(
      env,
      execution,
      {
        status:
          "running",

        step:
          "loading_auth",
      }
    );

    const threadsAuth =
      await getJson(
        env,
        "threads_auth"
      );

    if (
      !threadsAuth?.access_token
    ) {
      throw new AutoPostEngineError(
        "Threads 연결 정보가 없습니다.",
        {
          code:
            "threads_auth_missing",

          status:
            400,

          step:
            "loading_auth",
        }
      );
    }

    await updateExecution(
      env,
      execution,
      {
        step:
          "validating_content",
      }
    );

    const validation =
      validateAutoPostText(
        normalizedText
      );

    normalizedText =
      validation.text;

    normalizedFirstComment =
      normalizeFirstComment(
        firstComment
      );

    await updateExecution(
      env,
      execution,
      {
        step:
          "publishing",

        textLength:
          validation.length,

        postType:
          normalizedPostType ||
          null,

        firstComment: {
          requested:
            Boolean(
              normalizedFirstComment
            ),

          published:
            false,

          replyId:
            null,

          text:
            normalizedFirstComment,

          error:
            null,

          topicTag:
            metadata.firstCommentTopicTag,

          topicApplied:
            null,

          topicError:
            null,
        },
      }
    );

    const {
      profile,
      publishResult,
      firstCommentResult,
    } = await publishAutoPost(
      env,
      {
        accessToken:
          threadsAuth.access_token,

        text:
          normalizedText,

        firstComment:
          normalizedFirstComment,

        firstCommentTopicTag:
          metadata.firstCommentTopicTag,

        metadata,

        mediaSelection,
      }
    );

    const finalFirstComment =
      normalizeFirstCommentResult(
        normalizedFirstComment,
        firstCommentResult,
        metadata.firstCommentTopicTag
      );

    await updateExecution(
      env,
      execution,
      {
        status:
          "completed",

        step:
          "completed",

        completedAt:
          new Date().toISOString(),

        postId:
          publishResult.postId,

        username:
          profile.username,

        postType:
          normalizedPostType ||
          null,

        textLength:
          validation.length,

        firstComment:
          finalFirstComment,

        error:
          null,
      }
    );

    return {
      executionId,

      source:
        normalizedSource,

      username:
        profile.username,

      post_id:
        publishResult.postId,

      text:
        normalizedText,

      postType:
        normalizedPostType,

      contentType:
        metadata.contentType,

      topic:
        metadata.topic,

      emotion:
        metadata.emotion,

      hookStyle:
        metadata.hookStyle,

      endingStyle:
        metadata.endingStyle,

      questionUsed:
        metadata.questionUsed,

      productId:
        metadata.productId,

      productConnected:
        metadata.productConnected,

      affiliateLinkUsed:
        metadata.affiliateLinkUsed,

      affiliateDisclosureRequired:
        metadata
          .affiliateDisclosureRequired,

      firstComment:
        finalFirstComment,

      validation: {
        length:
          validation.length,

        maxLength:
          validation.maxLength,
      },
    };
  } catch (
    error
  ) {
    const engineError =
      normalizeReviewedError(
        error,
        normalizedText
      );

    console.error(
      "Reviewed auto post failed",
      {
        executionId,

        code:
          engineError.code,

        step:
          engineError.step,

        message:
          engineError.message,

        details:
          engineError.details,
      }
    );

    await updateExecution(
      env,
      execution,
      {
        status:
          "failed",

        step:
          engineError.step,

        completedAt:
          new Date().toISOString(),

        error: {
          code:
            engineError.code,

          message:
            engineError.message,

          details:
            engineError.details,
        },
      }
    );

    throw engineError;
  } finally {
    if (
      lockAcquired
    ) {
      try {
        await releaseExecutionLock(
          env,
          executionId
        );
      } catch (
        releaseError
      ) {
        console.error(
          "Reviewed auto post lock release failed",
          {
            executionId,

            error:
              serializeAutoPostError(
                releaseError
              ),
          }
        );
      }
    }
  }
}
