import { config } from "../config.js";
import { getMedia } from "./media.js";
import { getMediaObject } from "./media-storage.js";

export class ThreadsApiError extends Error {
  constructor(
    step,
    details
  ) {
    super(
      `Threads API failed at ${step}`
    );

    this.name =
      "ThreadsApiError";

    this.step =
      step;

    this.details =
      details;
  }
}

async function readThreadsResponse(
  response,
  step
) {
  const contentType =
    response.headers.get(
      "content-type"
    ) || null;

  const traceHeaders = {};

  for (const [name, value] of
    response.headers.entries()) {
    if (
      /^(x-fb-|x-request-id$|traceparent$|tracestate$)/iu.test(
        name
      )
    ) {
      traceHeaders[name] = value;
    }
  }

  let rawBody;

  try {
    rawBody =
      await response.text();
  } catch (error) {
    throw new ThreadsApiError(
      step,
      {
        status:
          response.status,

        statusText:
          response.statusText,

        contentType,

        traceHeaders,

        rawBody:
          null,

        message:
          "Threads API response body could not be read",

        cause:
          error instanceof Error
            ? error.message
            : String(error),
      }
    );
  }

  const responseBodyKind =
    rawBody.trim()
      ? "invalid_json"
      : "empty";

  let data;

  try {
    data = JSON.parse(
      rawBody
    );
  } catch (error) {
    throw new ThreadsApiError(
      step,
      {
        status:
          response.status,

        statusText:
          response.statusText,

        contentType,

        traceHeaders,

        rawBody,

        responseBodyKind,

        message:
          "Threads API returned an invalid JSON response",

        cause:
          error instanceof Error
            ? error.message
            : String(error),
      }
    );
  }

  if (!response.ok) {
    throw new ThreadsApiError(
      step,
      data
    );
  }

  return data;
}

async function createTextContainer(
  accessToken,
  userId,
  text,
  {
    replyToId = null,
    topicTag = null,
  } = {}
) {
  const body =
    new URLSearchParams({
      media_type:
        "TEXT",

      text,

      access_token:
        accessToken,
    });

  if (replyToId) {
    body.set(
      "reply_to_id",
      replyToId
    );
  }

  if (topicTag) {
    body.set(
      "topic_tag",
      topicTag
    );
  }

  const response =
    await fetch(
      `${config.threads.graphBase}/${userId}/threads`,
      {
        method:
          "POST",

        headers: {
          "content-type":
            "application/x-www-form-urlencoded",
        },

        body,
      }
    );

  const data =
    await readThreadsResponse(
      response,
      replyToId
        ? "create_reply_container"
        : "create_container"
    );

  if (!data.id) {
    throw new ThreadsApiError(
      replyToId
        ? "create_reply_container"
        : "create_container",
      data
    );
  }

  return {
    containerId:
      data.id,
  };
}

async function createImageContainer(
  accessToken,
  userId,
  text,
  imageUrl
) {
  const body = new URLSearchParams({
    media_type: "IMAGE",
    image_url: imageUrl,
    text,
    access_token: accessToken,
  });
  const response = await fetch(
    `${config.threads.graphBase}/${userId}/threads`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }
  );
  const data = await readThreadsResponse(response, "create_image_container");
  if (!data.id) {
    throw new ThreadsApiError("create_image_container", data);
  }
  return { containerId: data.id };
}

function serializeTopicError(
  error
) {
  return {
    name:
      error?.name ||
      "ThreadsApiError",

    message:
      error?.message ||
      String(error),

    step:
      error?.step ||
      null,

    details:
      error?.details ||
      null,
  };
}

function isExplicitTopicContainerError(
  error
) {
  if (
    !(error instanceof ThreadsApiError) ||
    error.step !== "create_reply_container"
  ) {
    return false;
  }

  let details = "";

  try {
    details = JSON.stringify(
      error.details || {}
    );
  } catch {
    details = String(
      error.details || ""
    );
  }

  return /topic[_\s-]*tag|topic\s+tag/iu.test(
    details
  );
}

function isTopicFallbackResponseError(
  error
) {
  if (
    !(error instanceof ThreadsApiError) ||
    error.step !== "create_reply_container" ||
    Number(error.details?.status) !== 500
  ) {
    return false;
  }

  return (
    error.details?.responseBodyKind === "empty" ||
    error.details?.responseBodyKind === "invalid_json"
  );
}

async function publishContainer(
  accessToken,
  userId,
  containerId,
  {
    step = "publish",
  } = {}
) {
  const body =
    new URLSearchParams({
      creation_id:
        containerId,

      access_token:
        accessToken,
    });

  const response =
    await fetch(
      `${config.threads.graphBase}/${userId}/threads_publish`,
      {
        method:
          "POST",

        headers: {
          "content-type":
            "application/x-www-form-urlencoded",
        },

        body,
      }
    );

  const data =
    await readThreadsResponse(
      response,
      step
    );

  if (!data.id) {
    throw new ThreadsApiError(
      step,
      data
    );
  }

  return {
    postId:
      data.id,
  };
}

function normalizeThreadsText(
  value
) {
  return String(
    value || ""
  ).trim();
}

function normalizeThreadItem(
  item
) {
  return {
    id:
      String(
        item?.id || ""
      ),

    text:
      normalizeThreadsText(
        item?.text
      ),

    username:
      String(
        item?.username || ""
      ),

    timestamp:
      item?.timestamp ||
      null,

    permalink:
      item?.permalink ||
      null,

    mediaType:
      item?.media_type ||
      null,
  };
}

export async function getThreadsProfile(
  accessToken
) {
  const url =
    new URL(
      `${config.threads.graphBase}/me`
    );

  url.searchParams.set(
    "fields",
    "id,username"
  );

  url.searchParams.set(
    "access_token",
    accessToken
  );

  const response =
    await fetch(
      url
    );

  const data =
    await readThreadsResponse(
      response,
      "get_profile"
    );

  if (!data.id) {
    throw new ThreadsApiError(
      "get_profile",
      data
    );
  }

  return data;
}

export async function getThreadPost(
  accessToken,
  postId
) {
  const normalizedPostId =
    String(
      postId || ""
    ).trim();

  if (!normalizedPostId) {
    throw new ThreadsApiError(
      "validate_thread_post_id",
      {
        message:
          "Threads post ID is empty",
      }
    );
  }

  const url =
    new URL(
      `${config.threads.graphBase}/${normalizedPostId}`
    );

  url.searchParams.set(
    "fields",
    [
      "id",
      "text",
      "username",
      "timestamp",
      "permalink",
      "media_type",
    ].join(",")
  );

  url.searchParams.set(
    "access_token",
    accessToken
  );

  const response =
    await fetch(
      url
    );

  const data =
    await readThreadsResponse(
      response,
      "get_thread_post"
    );

  if (!data.id) {
    throw new ThreadsApiError(
      "get_thread_post",
      data
    );
  }

  return normalizeThreadItem(
    data
  );
}

export async function getUserThreads(
  accessToken,
  {
    limit = 50,
  } = {}
) {
  const safeLimit =
    Math.max(
      1,
      Math.min(
        Number(
          limit || 50
        ),
        100
      )
    );

  const url =
    new URL(
      `${config.threads.graphBase}/me/threads`
    );

  url.searchParams.set(
    "fields",
    [
      "id",
      "text",
      "username",
      "timestamp",
      "permalink",
      "media_type",
    ].join(",")
  );

  url.searchParams.set(
    "limit",
    String(
      safeLimit
    )
  );

  url.searchParams.set(
    "access_token",
    accessToken
  );

  const response =
    await fetch(
      url
    );

  const data =
    await readThreadsResponse(
      response,
      "get_user_threads"
    );

  const items =
    Array.isArray(
      data?.data
    )
      ? data.data
      : [];

  return {
    data:
      items
        .map(
          normalizeThreadItem
        )
        .filter(
          (item) =>
            item.id
        ),

    paging:
      data?.paging ||
      null,
  };
}

export async function publishTextPost(
  accessToken,
  userId,
  text
) {
  const normalizedText =
    normalizeThreadsText(
      text
    );

  if (!normalizedText) {
    throw new ThreadsApiError(
      "validate_post_text",
      {
        message:
          "Threads post text is empty",
      }
    );
  }

  const body =
    new URLSearchParams({
      media_type:
        "TEXT",

      text:
        normalizedText,

      auto_publish_text:
        "true",

      access_token:
        accessToken,
    });

  const response =
    await fetch(
      `${config.threads.graphBase}/${userId}/threads`,
      {
        method:
          "POST",

        headers: {
          "content-type":
            "application/x-www-form-urlencoded",
        },

        body,
      }
    );

  const data =
    await readThreadsResponse(
      response,
      "auto_publish_text"
    );

  if (!data.id) {
    throw new ThreadsApiError(
      "auto_publish_text",
      data
    );
  }

  return {
    containerId:
      null,

    postId:
      data.id,

    autoPublished:
      true,
  };
}

export async function publishImagePost(
  env,
  accessToken,
  userId,
  text,
  mediaId
) {
  const normalizedText = normalizeThreadsText(text);
  const normalizedMediaId = String(mediaId || "").trim();

  if (!normalizedText) {
    throw new ThreadsApiError("validate_post_text", {
      message: "Threads post text is empty",
    });
  }
  if (!normalizedMediaId) {
    throw new ThreadsApiError("validate_image_media", {
      message: "Media ID is required for an IMAGE post",
    });
  }

  let media;
  try {
    media = await getMedia(env, normalizedMediaId);
  } catch (error) {
    throw new ThreadsApiError("validate_image_media", {
      message: "Media Library lookup failed",
      cause: error?.message || String(error),
    });
  }
  if (!media) {
    throw new ThreadsApiError("validate_image_media", {
      message: "Media record was not found",
      mediaId: normalizedMediaId,
    });
  }
  if (media.active === false) {
    throw new ThreadsApiError("validate_image_media", {
      message: "Media record is inactive",
      mediaId: normalizedMediaId,
    });
  }

  let object;
  try {
    object = await getMediaObject(env, media.objectKey);
  } catch (error) {
    throw new ThreadsApiError("validate_image_media", {
      message: "Media object lookup failed",
      mediaId: normalizedMediaId,
      cause: error?.message || String(error),
    });
  }
  if (!object) {
    throw new ThreadsApiError("validate_image_media", {
      message: "Media object was not found",
      mediaId: normalizedMediaId,
    });
  }
  const contentType = object.httpMetadata?.contentType;
  if (contentType && !/^image\//iu.test(contentType)) {
    throw new ThreadsApiError("validate_image_media", {
      message: "Media object is not an image",
      mediaId: normalizedMediaId,
      contentType,
    });
  }

  const imageUrl = `${config.app.baseUrl}/media/${encodeURIComponent(normalizedMediaId)}`;
  let containerId;
  ({ containerId } = await createImageContainer(
    accessToken,
    userId,
    normalizedText,
    imageUrl
  ));
  const { postId } = await publishContainer(
    accessToken,
    userId,
    containerId,
    { step: "publish_image" }
  );
  return {
    containerId,
    postId,
    autoPublished: false,
    mediaId: normalizedMediaId,
    imageUrl,
  };
}

export async function publishTextReply(
  accessToken,
  userId,
  replyToId,
  text,
  {
    topicTag = null,
  } = {}
) {
  const normalizedReplyToId =
    String(
      replyToId || ""
    ).trim();

  const normalizedText =
    normalizeThreadsText(
      text
    );

  const normalizedTopicTag =
    normalizeThreadsText(
      topicTag
    );

  if (!normalizedReplyToId) {
    throw new ThreadsApiError(
      "validate_reply_target",
      {
        message:
          "Threads reply target ID is empty",
      }
    );
  }

  if (!normalizedText) {
    throw new ThreadsApiError(
      "validate_reply_text",
      {
        message:
          "Threads reply text is empty",
      }
    );
  }

  let containerId;

  let topicApplied =
    normalizedTopicTag
      ? true
      : null;

  let topicError =
    null;

  try {
    ({
      containerId,
    } = await createTextContainer(
      accessToken,
      userId,
      normalizedText,
      {
        replyToId:
          normalizedReplyToId,

        topicTag:
          normalizedTopicTag ||
          null,
      }
    ));
  } catch (error) {
    if (
      !normalizedTopicTag ||
      !(
        isExplicitTopicContainerError(
          error
        ) ||
        isTopicFallbackResponseError(
          error
        )
      )
    ) {
      throw error;
    }

    topicApplied =
      false;

    topicError =
      serializeTopicError(
        error
      );

    ({
      containerId,
    } = await createTextContainer(
      accessToken,
      userId,
      normalizedText,
      {
        replyToId:
          normalizedReplyToId,
      }
    ));
  }

  let postId;

  try {
    ({
      postId,
    } = await publishContainer(
      accessToken,
      userId,
      containerId,
      {
        step:
          "publish_reply",
      }
    ));
  } catch (error) {
    if (
      normalizedTopicTag &&
      error &&
      typeof error === "object"
    ) {
      error.topicTag =
        normalizedTopicTag;

      error.topicApplied =
        false;

      error.topicError =
        topicError;
    }

    throw error;
  }

  return {
    containerId,
    replyId:
      postId,

    topicTag:
      normalizedTopicTag ||
      null,

    topicApplied,

    topicError,
  };
}
