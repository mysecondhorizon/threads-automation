import {
  putJson,
  listKeys,
  getJson,
} from "./kv.js";

function normalizeFirstCommentMetadata(
  metadata
) {
  const firstComment =
    metadata?.firstComment ||
    {};

  const topicTag =
    firstComment.topicTag ||
    metadata?.firstCommentTopicTag ||
    null;

  return {
    topicTag,

    topicApplied:
      typeof firstComment.topicApplied === "boolean"
        ? firstComment.topicApplied
        : null,

    topicError:
      firstComment.topicError ||
      null,
  };
}

function normalizePostMetadata(
  metadata
) {
  return {
    source:
      metadata?.source ||
      null,

    contentMode:
      metadata?.contentMode ||
      null,

    currentTopicId:
      metadata?.currentTopicId ||
      null,

    currentTopicCategory:
      metadata?.currentTopicCategory ||
      null,

    currentTopicSelectedAngle:
      metadata?.currentTopicSelectedAngle ||
      null,

    candidateId:
      metadata?.candidateId ||
      null,

    style:
      metadata?.style ||
      null,

    contentType:
      metadata?.contentType ||
      null,

    topic:
      metadata?.topic ||
      null,

    emotion:
      metadata?.emotion ||
      null,

    hookStyle:
      metadata?.hookStyle ||
      null,

    endingStyle:
      metadata?.endingStyle ||
      null,

    questionUsed:
      Boolean(
        metadata?.questionUsed
      ),

    productId:
      metadata?.productId ||
      null,

    productConnected:
      Boolean(
        metadata?.productConnected
      ),

    affiliateLinkUsed:
      Boolean(
        metadata?.affiliateLinkUsed
      ),

    affiliateDisclosureRequired:
      Boolean(
        metadata
          ?.affiliateDisclosureRequired
      ),

    firstComment:
      normalizeFirstCommentMetadata(
        metadata
      ),
  };
}

export async function logPostSuccess(
  env,
  username,
  postId,
  text,
  metadata = null
) {
  const key =
    `post_log:${Date.now()}:${crypto.randomUUID()}`;

  await putJson(
    env,
    key,
    {
      status:
        "published",

      username,

      post_id:
        postId,

      text,

      created_at:
        new Date().toISOString(),

      updated_at:
        null,

      deleted_at:
        null,

      metadata:
        normalizePostMetadata(
          metadata
        ),
    }
  );

  return key;
}

export async function updatePostLogFirstComment(
  env,
  key,
  result
) {
  const log =
    await getJson(
      env,
      key
    );

  if (!log) {
    return false;
  }

  await putJson(
    env,
    key,
    {
      ...log,

      updated_at:
        new Date().toISOString(),

      metadata:
        normalizePostMetadata({
          ...log.metadata,

          firstComment: {
            topicTag:
              result?.topicTag ||
              log.metadata
                ?.firstComment
                ?.topicTag ||
              null,

            topicApplied:
              typeof result?.topicApplied === "boolean"
                ? result.topicApplied
                : null,

            topicError:
              result?.topicError ||
              null,
          },
        }),
    }
  );

  return true;
}

export async function logPostFailure(
  env,
  step,
  text,
  details
) {
  const key =
    `post_log:${Date.now()}:${crypto.randomUUID()}`;

  await putJson(
    env,
    key,
    {
      status:
        "failed",

      step,

      text,

      details,

      created_at:
        new Date().toISOString(),
    }
  );
}

export async function getPostLogEntries(
  env
) {
  const list =
    await listKeys(
      env,
      "post_log:"
    );

  const entries =
    await Promise.all(
      list.keys.map(
        async (
          item
        ) => {
          const log =
            await getJson(
              env,
              item.name
            );

          if (!log) {
            return null;
          }

          return {
            key:
              item.name,

            log,
          };
        }
      )
    );

  return entries
    .filter(Boolean)
    .sort(
      (
        first,
        second
      ) =>
        String(
          second.log
            ?.created_at ||
          ""
        ).localeCompare(
          String(
            first.log
              ?.created_at ||
            ""
          )
        )
    );
}

export async function updatePostLog(
  env,
  key,
  updates
) {
  const normalizedKey =
    String(
      key || ""
    ).trim();

  if (
    !normalizedKey.startsWith(
      "post_log:"
    )
  ) {
    throw new Error(
      "Invalid post log key"
    );
  }

  const existing =
    await getJson(
      env,
      normalizedKey
    );

  if (!existing) {
    return null;
  }

  const nextValue = {
    ...existing,
    ...updates,

    synced_at:
      new Date().toISOString(),
  };

  await putJson(
    env,
    normalizedKey,
    nextValue
  );

  return nextValue;
}

export async function markPostLogDeleted(
  env,
  key
) {
  return updatePostLog(
    env,
    key,
    {
      status:
        "deleted",

      deleted_at:
        new Date().toISOString(),
    }
  );
}

export async function syncPostLogFromThreads(
  env,
  key,
  thread
) {
  const text =
    String(
      thread?.text || ""
    ).trim();

  return updatePostLog(
    env,
    key,
    {
      status:
        "published",

      text,

      username:
        String(
          thread?.username || ""
        ),

      threads_timestamp:
        thread?.timestamp ||
        null,

      permalink:
        thread?.permalink ||
        null,

      media_type:
        thread?.mediaType ||
        null,

      updated_at:
        new Date().toISOString(),

      deleted_at:
        null,
    }
  );
}

export async function getPostLogs(
  env
) {
  const entries =
    await getPostLogEntries(
      env
    );

  return entries.map(
    (
      entry
    ) =>
      entry.log
  );
}

export async function getRecentPostLogs(
  env,
  limit = 30
) {
  const logs =
    await getPostLogs(
      env
    );

  return logs.slice(
    0,
    limit
  );
}
