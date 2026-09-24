import { getJson, putJson } from "./kv.js";
import { getPostLogEntries, syncPostLogFromThreads } from "./logger.js";
import { getUserThreads, getThreadsProfile } from "./threads.js";
import { getPostInsights } from "./insights.js";
import { getThreadsCredentialForAccount, resolveWorkspaceThreadsConnectedAccount } from "./connected-accounts.js";
import { DEFAULT_WORKSPACE_ID } from "./workspace-foundation.js";
import { getInsightSnapshot, saveInsightSnapshot, observationAgeSeconds, insightObservationWindow,
  INSIGHT_COLLECTION_MAX_AGE_SECONDS } from "./insight-snapshots.js";

const MAX_POSTS_PER_REFRESH = 20;
const THREADS_FETCH_LIMIT = 100;
const text = (value) => typeof value === "string" ? value.trim() : "";

export class InsightCollectionError extends Error {
  constructor(code, status = 502) {
    super("Threads insight collection is unavailable");
    this.name = "InsightCollectionError";
    this.code = code;
    this.status = status;
  }
}

function logWorkspace(log) {
  const value = log?.metadata?.workspaceId;
  return value === undefined || value === null ? DEFAULT_WORKSPACE_ID : text(value);
}

async function resolveScope(env, { workspaceId, executionContext } = {}, dependencies) {
  const scope = workspaceId === undefined || workspaceId === null ? DEFAULT_WORKSPACE_ID : text(workspaceId);
  if (!scope || (executionContext && executionContext.workspaceId !== scope)) {
    throw new InsightCollectionError("insight_scope_invalid", 403);
  }
  const resolveAccount = dependencies.resolveWorkspaceThreadsConnectedAccount || resolveWorkspaceThreadsConnectedAccount;
  const resolveCredential = dependencies.getThreadsCredentialForAccount || getThreadsCredentialForAccount;
  const accountId = executionContext
    ? executionContext.connectedAccountId
    : scope !== DEFAULT_WORKSPACE_ID ? (await resolveAccount(env, { workspaceId: scope })).id : undefined;
  if (executionContext && !text(accountId)) throw new InsightCollectionError("insight_scope_invalid", 403);
  const { account, credential } = await resolveCredential(env, { workspaceId: scope, connectedAccountId: accountId });
  if (account?.workspaceId !== scope || !text(account?.id) || !text(credential?.access_token)) {
    throw new InsightCollectionError("insight_scope_invalid", 403);
  }
  const profile = await (dependencies.getThreadsProfile || getThreadsProfile)(credential.access_token);
  if (!text(profile?.id)) throw new InsightCollectionError("insight_account_unavailable");
  return { workspaceId: scope, connectedAccountId: account.id, threadsUserId: profile.id, accessToken: credential.access_token };
}

function matchesOwner(log, scope, remotePosts) {
  if (logWorkspace(log) !== scope.workspaceId) return false;
  const metadata = log.metadata || {};
  if (metadata.connectedAccountId != null && metadata.connectedAccountId !== scope.connectedAccountId) return false;
  if (metadata.threadsUserId != null && metadata.threadsUserId !== scope.threadsUserId) return false;
  return (metadata.connectedAccountId === scope.connectedAccountId && metadata.threadsUserId === scope.threadsUserId) ||
    remotePosts.has(String(log.post_id));
}

function publishedEntries(entries, scope) {
  return entries.filter(({ log }) =>
    log?.status === "published" && text(log.post_id) && logWorkspace(log) === scope
  );
}

async function loadRemotePosts(scope, dependencies) {
  const response = await (dependencies.getUserThreads || getUserThreads)(scope.accessToken, { limit: THREADS_FETCH_LIMIT });
  return new Map((Array.isArray(response?.data) ? response.data : [])
    .filter((post) => text(post?.id)).map((post) => [post.id, post]));
}

function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function trustedPublishedAt(entry, scope, remotePosts, previous) {
  const trustedCache = previous?.integrityVersion === 1 && previous.postId === entry.log.post_id &&
    ["success", "partial"].includes(previous.collectionStatus) &&
    ["workspaceId", "connectedAccountId", "threadsUserId"].every((field) => previous[field] === scope[field]);
  return validTimestamp(remotePosts.get(entry.log.post_id)?.timestamp) || validTimestamp(entry.log.threads_timestamp) ||
    (trustedCache ? validTimestamp(previous.publishedAt) : null);
}

function directPublishedAt(entry, remotePosts) {
  return validTimestamp(remotePosts.get(entry.log.post_id)?.timestamp) || validTimestamp(entry.log.threads_timestamp);
}

async function automaticCandidates(env, entries, scope, remotePosts, now) {
  const candidates = [];
  for (const entry of entries) {
    try {
      const postId = entry.log.post_id;
      // Provider/log timestamps are already trusted and let expired posts exit
      // before any per-post latest-cache or snapshot reads.
      let publishedAt = directPublishedAt(entry, remotePosts);
      if (!publishedAt) {
        const previous = await getJson(env, `post_insight:${postId}`);
        publishedAt = trustedPublishedAt(entry, scope, remotePosts, previous);
      }
      const age = observationAgeSeconds(publishedAt, now);
      if (age === null || age >= INSIGHT_COLLECTION_MAX_AGE_SECONDS) continue;
      const identity = { ...scope, postId };
      const window = insightObservationWindow(publishedAt, now);
      const currentSnapshot = window ? await getInsightSnapshot(env, identity, window) : null;
      const d3Snapshot = window === "D3" ? currentSnapshot : await getInsightSnapshot(env, identity, "D3");
      if (d3Snapshot) continue;
      const needsCurrentWindow = window && !currentSnapshot;
      // Due windows before future windows; earliest deadline first, not the
      // newest 20 remote posts. Keep the existing per-run provider-call cap.
      const needsD1 = age < 24 * 3600 || (window === "D1" && !currentSnapshot);
      const deadline = Date.parse(publishedAt) + (needsD1 ? 48 : 96) * 3600000;
      candidates.push({ entry, due: Boolean(needsCurrentWindow), deadline });
    } catch {
      // An unreadable cache/snapshot fails closed for this post, not the
      // scheduled publish or other posts. Do not log private record contents.
      console.warn("Insight candidate state unavailable");
    }
  }
  return candidates.sort((a, b) => Number(b.due) - Number(a.due) || a.deadline - b.deadline ||
    a.entry.log.post_id.localeCompare(b.entry.log.post_id)).map(({ entry }) => entry);
}

async function collectPost(env, entry, scope, remotePosts, dependencies, automatic = false) {
  const postId = String(entry.log.post_id);
  const key = `post_insight:${postId}`;
  const previous = await getJson(env, key);
  // A reconnect, conflicting log, or another Workspace must not take over an
  // observation already attributed to a different owner.
  if (previous && ["workspaceId", "connectedAccountId", "threadsUserId"].some((field) =>
    previous[field] != null && previous[field] !== scope[field]
  )) throw new InsightCollectionError("insight_cache_owner_mismatch", 409);
  const publishedAt = trustedPublishedAt(entry, scope, remotePosts, previous);
  if (automatic) {
    // Sequential collection can cross a window's end after candidate discovery.
    const age = observationAgeSeconds(publishedAt, (dependencies.now || (() => new Date().toISOString()))());
    if (age === null || age >= INSIGHT_COLLECTION_MAX_AGE_SECONDS ||
        await getInsightSnapshot(env, { ...scope, postId }, "D3")) return null;
  }
  const insights = await (dependencies.getPostInsights || getPostInsights)(scope.accessToken, postId);
  if (insights?.integrityVersion !== 1 || insights.postId !== postId ||
      !["success", "partial"].includes(insights.collectionStatus)) {
    throw new InsightCollectionError("insight_observation_unavailable");
  }
  const remote = remotePosts.get(postId);
  const observation = {
    ...insights,
    postId,
    workspaceId: scope.workspaceId,
    connectedAccountId: scope.connectedAccountId,
    threadsUserId: scope.threadsUserId,
    ownershipSource: entry.log.metadata?.connectedAccountId && entry.log.metadata?.threadsUserId
      ? "published_log" : "account_post_list",
    text: remote?.text || entry.log.text || "",
    username: remote?.username || entry.log.username || "",
    // Local log creation time is not asserted to be the provider's publish time.
    publishedAt,
    permalink: remote?.permalink || previous?.permalink || null,
    syncedAt: new Date().toISOString(),
  };
  await putJson(env, key, observation);
  try {
    await saveInsightSnapshot(env, observation);
  } catch {
    // Snapshot storage must not undo a successful latest observation or block
    // an otherwise permitted publish. Never log the observation/provider body.
    console.warn("Insight snapshot storage unavailable");
  }
  return observation;
}

export async function refreshScopedPostInsights(env, postId, options = {}, dependencies = {}) {
  const entries = await (dependencies.getPostLogEntries || getPostLogEntries)(env, { paginate: true });
  const workspaceId = options.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const candidates = publishedEntries(entries, workspaceId).filter(({ log }) => log.post_id === postId);
  if (!candidates.length) throw new InsightCollectionError("insight_post_not_found", 404);
  const scope = await resolveScope(env, options, dependencies);
  const remotePosts = await loadRemotePosts(scope, dependencies);
  if (!candidates.every(({ log }) => matchesOwner(log, scope, remotePosts))) {
    throw new InsightCollectionError("insight_post_not_owned", 403);
  }
  return collectPost(env, candidates[0], scope, remotePosts, dependencies);
}

export async function syncThreadsData(env, options = {}, dependencies = {}) {
  const scope = await resolveScope(env, options, dependencies);
  const remotePosts = await loadRemotePosts(scope, dependencies);
  const entries = publishedEntries(await (dependencies.getPostLogEntries || getPostLogEntries)(env, { paginate: true }), scope.workspaceId);
  const owned = entries.filter(({ log }) => matchesOwner(log, scope, remotePosts));
  const syncResults = [];
  for (const entry of owned) {
    const remote = remotePosts.get(String(entry.log.post_id));
    // Bounded-list absence is never a deletion signal, even for owned posts.
    if (!remote) continue;
    const changed = String(entry.log.text || "").trim() !== String(remote.text || "").trim();
    await (dependencies.syncPostLogFromThreads || syncPostLogFromThreads)(env, entry.key, remote);
    syncResults.push({ post_id: entry.log.post_id, status: changed ? "updated" : "unchanged" });
  }
  const uniqueEntries = [...new Map(owned.map((entry) => [entry.log.post_id, entry])).values()];
  const candidates = options.automatic === true
    ? await automaticCandidates(env, uniqueEntries, scope, remotePosts, (dependencies.now || (() => new Date().toISOString()))())
    : uniqueEntries;
  const activeEntries = candidates.slice(0, MAX_POSTS_PER_REFRESH);
  const results = [];
  for (const entry of activeEntries) {
    try {
      const insights = await collectPost(env, entry, scope, remotePosts, dependencies, options.automatic === true);
      if (!insights) continue;
      results.push({ ok: true, post_id: entry.log.post_id, insights });
    } catch (error) {
      // Preserve the previous observation; failure details must not contain
      // provider payloads, credentials, or request headers.
      results.push({ ok: false, post_id: entry.log.post_id, collectionStatus: "failed",
        error: "Insight refresh failed",
        code: error instanceof InsightCollectionError ? error.code : "insight_refresh_failed" });
    }
  }
  const refreshed = results.filter((result) => result.ok).length;
  return {
    threadsFetched: remotePosts.size,
    localPublishedLogs: entries.length,
    sync: {
      deleted: 0,
      updated: syncResults.filter((result) => result.status === "updated").length,
      unchanged: syncResults.filter((result) => result.status === "unchanged").length,
      skipped: entries.length - owned.length,
      results: syncResults,
    },
    insights: { requested: results.length, refreshed, failed: results.length - refreshed, results },
  };
}
