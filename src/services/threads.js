import { config } from "../config.js";

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

  const {
    containerId,
  } = await createTextContainer(
    accessToken,
    userId,
    normalizedText
  );

  const {
    postId,
  } = await publishContainer(
    accessToken,
    userId,
    containerId,
    {
      step:
        "publish",
    }
  );

  return {
    containerId,
    postId,
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