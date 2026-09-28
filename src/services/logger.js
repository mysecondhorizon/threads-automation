import {
  putJson,
  listKeys,
  getJson,
} from "./kv.js";

const CONTENT_BASIS_VALUES = new Set([
  "CURRENT_TOPIC",
  "USER_EXPERIENCE",
  "PERSONA",
  "CONTENT_POOL",
  "PRODUCT_OPPORTUNITY",
]);
const COMMERCE_CONTENT_ANGLES = new Set(["FAILURE", "OBSERVATION", "REVERSAL", "DISCOVERY", "COMPARISON", "RELATABLE_MOMENT", "QUESTION", "PRACTICAL_TIP"]);
const COMMERCE_HOOK_TYPES = new Set(["CONTRARIAN", "CURIOSITY", "CONFESSION", "SPECIFIC_MOMENT", "UNEXPECTED_RESULT", "DIRECT_QUESTION", "OBSERVATION"]);

function normalizeContentBasis(value) {
  return CONTENT_BASIS_VALUES.has(value)
    ? value
    : null;
}

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
  const publishMode =
    metadata?.publishMode === "IMAGE" || metadata?.publishMode === "VIDEO"
      ? metadata.publishMode
      : "TEXT";

  return {
    // Absence is legacy Default Workspace data. New workspace-aware writers
    // always stamp this service-owned scope; it is never client supplied.
    workspaceId:
      typeof metadata?.workspaceId === "string" && metadata.workspaceId.trim()
        ? metadata.workspaceId.trim()
        : null,

    connectedAccountId:
      typeof metadata?.connectedAccountId === "string" && metadata.connectedAccountId.trim()
        ? metadata.connectedAccountId.trim()
        : null,

    threadsUserId:
      typeof metadata?.threadsUserId === "string" && metadata.threadsUserId.trim()
        ? metadata.threadsUserId.trim()
        : null,

    source:
      metadata?.source ||
      null,

    contentMode:
      metadata?.contentMode ||
      null,

    contentBasis:
      normalizeContentBasis(
        metadata?.contentBasis
      ),

    opportunityId:
      typeof metadata?.opportunityId === "string" && metadata.opportunityId.trim()
        ? metadata.opportunityId.trim()
        : null,

    contentAngle:
      COMMERCE_CONTENT_ANGLES.has(metadata?.contentAngle)
        ? metadata.contentAngle
        : null,

    hookType:
      COMMERCE_HOOK_TYPES.has(metadata?.hookType)
        ? metadata.hookType
        : null,

    usedCurrentTopic:
      metadata?.usedCurrentTopic === true,

    usedUserExperience:
      metadata?.usedUserExperience === true,

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

    publishMode,

    ...(publishMode === "IMAGE" || publishMode === "VIDEO"
      ? {
        mediaId:
          metadata?.mediaId ||
          null,

        ...(publishMode === "IMAGE"
          ? {
            contentPoolId:
              metadata?.contentPoolId ||
              null,
          }
          : {}),
      }
      : {}),

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
  details,
  workspaceId = null
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

      ...(typeof workspaceId === "string" && workspaceId.trim()
        ? { workspaceId: workspaceId.trim() }
        : {}),

      created_at:
        new Date().toISOString(),
    }
  );
}

export async function getPostLogEntries(
  env,
  { paginate = false } = {}
) {
  let list =
    await listKeys(
      env,
      "post_log:"
    );
  const keys = [...list.keys];
  const cursors = new Set();
  // Insight candidate discovery must not stop at the first KV page (which
  // can even be empty). Other callers keep their existing enumeration mode.
  while (paginate && list.list_complete === false) {
    if (!list.cursor || cursors.has(list.cursor)) throw new Error("Post log pagination unavailable");
    cursors.add(list.cursor);
    list = await env.THREADS_KV.list({ prefix: "post_log:", cursor: list.cursor });
    keys.push(...list.keys);
  }

  const entries = [];
  if (paginate) {
    // Cloudflare KV bulk reads support at most 100 keys and count as one
    // external operation. Keep this optimization scoped to insight discovery.
    for (let index = 0; index < keys.length; index += 100) {
      const batch = keys.slice(index, index + 100);
      const names = batch.map((item) => item.name);
      const values = await env.THREADS_KV.get(names, "json");
      // Older local test doubles may only implement scalar get(). Production
      // KV returns a Map for an array request.
      if (!values || typeof values.get !== "function") {
        entries.push(...await Promise.all(batch.map(async (item) => ({ key: item.name, log: await getJson(env, item.name) }))));
        continue;
      }
      entries.push(...batch.map((item) => ({ key: item.name, log: values.get(item.name) })));
    }
  } else {
    entries.push(...await Promise.all(keys.map(async (item) => ({ key: item.name, log: await getJson(env, item.name) }))));
  }

  return entries
    .filter((entry) => entry?.log)
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

// Attribution needs a unique, exact-scope success from a COMPLETE scan. The
// legacy post_log key has no scope segment, so this bounded reader must filter
// stored identities after reading; it never applies Default Workspace fallback.
export async function getScopedSuccessfulPostLog(env, identity) {
  const result = await getScopedSuccessfulPostLogs(env, identity, [identity?.postId]);
  if (!result.available) return { available: false, reason: result.reason, entry: null, discovery: result.discovery };
  return { ...result.results.get(identity.postId), discovery: result.discovery };
}

// Scan once for a bounded candidate set. Per-post missing/ambiguous results are
// released only after the same complete traversal used by the single reader.
export async function getScopedSuccessfulPostLogs(env, identity, postIds) {
  const discovery = { scannedKeys: 0, listCalls: 0, bulkReadCalls: 0 };
  const unavailable = (reason) => ({ available: false, reason, results: null, discovery });
  const fields = ["workspaceId", "connectedAccountId", "threadsUserId"];
  if (!fields.every((field) => typeof identity?.[field] === "string" && identity[field].trim()) ||
      !Array.isArray(postIds) || !postIds.length || postIds.length > 100 ||
      !postIds.every((id) => typeof id === "string" && id.trim()) || new Set(postIds).size !== postIds.length) {
    return unavailable("invalid_log_identity");
  }
  const seenKeys = new Set();
  const cursors = new Set();
  let cursor;
  const matches = new Map(postIds.map((id) => [id, { count: 0, entry: null }]));
  while (true) {
    if (discovery.listCalls >= 20) return unavailable("log_list_budget_exceeded");
    let page;
    try {
      discovery.listCalls += 1;
      page = await env.THREADS_KV.list({ prefix: "post_log:", limit: 1000, ...(cursor ? { cursor } : {}) });
    } catch {
      return unavailable("log_list_failed");
    }
    if (!Array.isArray(page?.keys) || typeof page.list_complete !== "boolean") {
      return unavailable("log_pagination_invalid");
    }
    discovery.scannedKeys += page.keys.length;
    if (discovery.scannedKeys > 5000) return unavailable("log_key_budget_exceeded");
    const names = [];
    for (const key of page.keys) {
      const name = key?.name;
      if (typeof name !== "string" || !name.startsWith("post_log:") || seenKeys.has(name)) {
        return unavailable("log_pagination_invalid");
      }
      seenKeys.add(name);
      names.push(name);
    }
    for (let start = 0; start < names.length; start += 100) {
      if (discovery.bulkReadCalls >= 50) return unavailable("log_bulk_budget_exceeded");
      const batch = names.slice(start, start + 100);
      let values;
      try {
        discovery.bulkReadCalls += 1;
        values = await env.THREADS_KV.get(batch, "json");
      } catch {
        return unavailable("log_bulk_read_failed");
      }
      // A listed key that disappears or cannot be read prevents proving
      // uniqueness. Do not silently treat unreadable records as non-matches.
      if (!(values instanceof Map) || batch.some((name) => {
        const value = values.get(name);
        return !value || typeof value !== "object" || Array.isArray(value);
      })) return unavailable("log_bulk_read_failed");
      for (const key of batch) {
        const log = values.get(key);
        const match = matches.get(log.post_id);
        if (log.status !== "published" || !match ||
            !fields.every((field) => log.metadata?.[field] === identity[field])) continue;
        match.count += 1;
        if (match.count === 1) match.entry = { key, log };
      }
    }
    if (page.list_complete) {
      const results = new Map([...matches].map(([id, match]) => [id, {
        available: match.count === 1,
        reason: match.count === 1 ? null : match.count ? "published_log_ambiguous" : "published_log_not_found",
        entry: match.count === 1 ? match.entry : null,
      }]));
      return { available: true, reason: null, results, discovery };
    }
    if (typeof page.cursor !== "string" || !page.cursor.trim() || cursors.has(page.cursor)) {
      return unavailable("log_pagination_invalid");
    }
    cursors.add(page.cursor);
    cursor = page.cursor;
  }
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
