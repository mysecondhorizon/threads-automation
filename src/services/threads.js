import { config } from "../config.js";

export class ThreadsApiError extends Error {
  constructor(
    step,
    detailspublishTextPost
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
  let data;

  try {
    data =
      await response.json();
  } catch (error) {
    throw new ThreadsApiError(
      step,
      {
        status:
          response.status,

        statusText:
          response.statusText,

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

export async function publishTextReply(
  accessToken,
  userId,
  replyToId,
  text
) {
  const normalizedReplyToId =
    String(
      replyToId || ""
    ).trim();

  const normalizedText =
    normalizeThreadsText(
      text
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

  const {
    containerId,
  } = await createTextContainer(
    accessToken,
    userId,
    normalizedText,
    {
      replyToId:
        normalizedReplyToId,
    }
  );

  const {
    postId,
  } = await publishContainer(
    accessToken,
    userId,
    containerId,
    {
      step:
        "publish_reply",
    }
  );

  return {
    containerId,
    replyId:
      postId,
  };
}