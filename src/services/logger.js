import {
  putJson,
  listKeys,
  getJson,
} from "./kv.js";

export async function logPostSuccess(
  env,
  username,
  postId,
  text
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
    }
  );
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