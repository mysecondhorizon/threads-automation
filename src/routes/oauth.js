import { config } from "../config.js";
import {
  deleteKey,
  getText,
  putJson,
  putText,
} from "../services/kv.js";
import {
  activatePendingThreadsConnectedAccount,
  createPendingThreadsConnectedAccount,
  getExpectedCredentialRef,
  resolvePendingThreadsConnectedAccount,
} from "../services/connected-accounts.js";
import { resolveSelectedWorkspaceForSession } from "../services/login-foundation.js";
import { getThreadsProfile } from "../services/threads.js";
import { DEFAULT_WORKSPACE_ID } from "../services/workspace-foundation.js";
import { resolveCurrentSession } from "../middleware/auth.js";
import { html, fail, redirect } from "../utils/response.js";

const OAUTH_STATE_PREFIX = "oauth_state:";
const CONNECTED_ACCOUNT_STATE_VERSION = 1;
const CONNECTED_ACCOUNT_STATE_TYPE = "connected_threads_account";
const OAUTH_STATE_TTL_SECONDS = 600;

function oauthStateKey(state) {
  return `${OAUTH_STATE_PREFIX}${state}`;
}

function buildThreadsAuthorizationUrl(env, state) {
  const authUrl = new URL("https://threads.net/oauth/authorize");
  authUrl.searchParams.set("client_id", env.THREADS_APP_ID);
  authUrl.searchParams.set("redirect_uri", config.oauth.redirectUri);
  authUrl.searchParams.set("scope", config.oauth.scopes.join(","));
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);
  return authUrl;
}

function nowIso(now) {
  const value = now instanceof Date ? now : new Date(now ?? Date.now());
  if (!Number.isFinite(value.getTime())) throw new Error("OAuth clock is invalid");
  return value.toISOString();
}

function isNonEmptyString(value) {
  return typeof value === "string" && Boolean(value.trim());
}

function parseConnectedAccountState(value, { now = Date.now() } = {}) {
  if (!isNonEmptyString(value)) return null;
  let state;
  try {
    state = JSON.parse(value);
  } catch {
    return null;
  }

  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  const allowedKeys = new Set([
    "version", "type", "sessionId", "userId", "workspaceId",
    "connectedAccountId", "createdAt", "expiresAt",
  ]);
  if (Object.keys(state).some((key) => !allowedKeys.has(key))) return null;
  if (
    state.version !== CONNECTED_ACCOUNT_STATE_VERSION ||
    state.type !== CONNECTED_ACCOUNT_STATE_TYPE ||
    ![
      state.sessionId, state.userId, state.workspaceId,
      state.connectedAccountId, state.createdAt, state.expiresAt,
    ].every(isNonEmptyString) ||
    !Number.isFinite(Date.parse(state.createdAt)) ||
    !Number.isFinite(Date.parse(state.expiresAt)) ||
    Date.parse(state.expiresAt) <= Date.parse(state.createdAt) ||
    Date.parse(state.expiresAt) <= now
  ) {
    return null;
  }
  return state;
}

function safeAppConnectionResult(request, outcome) {
  const location = new URL("/app", request.url);
  location.searchParams.set("threadsConnection", outcome);
  return redirect(location.toString());
}

async function exchangeAuthorizationCode(env, code, { fetchImpl = fetch } = {}) {
  const form = new URLSearchParams({
    client_id: env.THREADS_APP_ID,
    client_secret: env.THREADS_APP_SECRET,
    grant_type: "authorization_code",
    redirect_uri: config.oauth.redirectUri,
    code,
  });
  const response = await fetchImpl("https://graph.threads.net/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !isNonEmptyString(data?.access_token)) {
    throw new Error("OAuth token exchange failed");
  }
  return data;
}

async function exchangeLongLivedToken(env, shortLivedToken, { fetchImpl = fetch } = {}) {
  // Threads documents this exchange as server-to-server. This URL is never
  // returned, logged, or persisted; only the account-specific result is kept.
  const exchangeUrl = new URL("https://graph.threads.net/access_token");
  exchangeUrl.searchParams.set("grant_type", "th_exchange_token");
  exchangeUrl.searchParams.set("client_secret", env.THREADS_APP_SECRET);
  exchangeUrl.searchParams.set("access_token", shortLivedToken);
  const response = await fetchImpl(exchangeUrl);
  const data = await response.json().catch(() => null);
  if (!response.ok || !isNonEmptyString(data?.access_token)) {
    throw new Error("OAuth long-lived token exchange failed");
  }
  return data;
}

function createConnectedAccountState({ sessionId, userId, workspaceId, connectedAccountId }, { now } = {}) {
  const createdAt = nowIso(now);
  return {
    version: CONNECTED_ACCOUNT_STATE_VERSION,
    type: CONNECTED_ACCOUNT_STATE_TYPE,
    sessionId,
    userId,
    workspaceId,
    connectedAccountId,
    createdAt,
    expiresAt: new Date(Date.parse(createdAt) + OAUTH_STATE_TTL_SECONDS * 1000).toISOString(),
  };
}

export function handleConnectPage() {
  return html(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Second Horizon</title></head><body style="font-family:Arial;padding:40px;"><h1>Second Horizon</h1><a href="/oauth/start"><button type="button">Connect Threads</button></a></body></html>`);
}

/** Legacy default-account OAuth start. */
export async function handleOAuthStart(env, { createState = () => crypto.randomUUID() } = {}) {
  const state = createState();
  await putText(env, oauthStateKey(state), "valid", { expirationTtl: OAUTH_STATE_TTL_SECONDS });
  return redirect(buildThreadsAuthorizationUrl(env, state).toString());
}

/** Creates a pending account for a trusted structured selected Workspace. */
export async function handleConnectedAccountOAuthStart(
  request,
  env,
  { createState = () => crypto.randomUUID(), now, createConnectedAccountId } = {}
) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "POST", "cache-control": "no-store" },
    });
  }

  const current = await resolveCurrentSession(request, env);
  if (!current) return new Response("Authentication required", { status: 401, headers: { "cache-control": "no-store" } });
  if (current.session.legacy) return new Response("Workspace connection is unavailable", { status: 403, headers: { "cache-control": "no-store" } });

  const workspace = await resolveSelectedWorkspaceForSession(env, current.session);
  if (!workspace || !workspace.active || workspace.id === DEFAULT_WORKSPACE_ID) {
    return new Response("Workspace connection is unavailable", { status: 403, headers: { "cache-control": "no-store" } });
  }

  try {
    const account = await createPendingThreadsConnectedAccount(
      env,
      { workspaceId: workspace.id },
      { now, createConnectedAccountId },
    );
    const state = createState();
    const payload = createConnectedAccountState({
      sessionId: current.sessionId,
      userId: current.user.id,
      workspaceId: workspace.id,
      connectedAccountId: account.id,
    }, { now });
    await putJson(env, oauthStateKey(state), payload, { expirationTtl: OAUTH_STATE_TTL_SECONDS });
    return redirect(buildThreadsAuthorizationUrl(env, state).toString());
  } catch {
    return new Response("Threads connection could not be started", {
      status: 500,
      headers: { "cache-control": "no-store" },
    });
  }
}

async function handleLegacyOAuthCallback(url, env, savedState, { fetchImpl = fetch } = {}) {
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  if (oauthError || !code || savedState !== "valid") {
    return fail(oauthError || "Invalid or expired OAuth state", 400);
  }
  await deleteKey(env, oauthStateKey(url.searchParams.get("state")));
  try {
    const data = await exchangeAuthorizationCode(env, code, { fetchImpl });
    await putJson(env, "threads_short_lived_token", {
      access_token: data.access_token,
      user_id: data.user_id,
      saved_at: new Date().toISOString(),
    }, { expirationTtl: 3600 });
    return Response.json({ ok: true, token_received: true, user_id: data.user_id });
  } catch {
    return fail("Token exchange failed", 400);
  }
}

/** Dispatches legacy and server-bound connected-account OAuth states safely. */
export async function handleOAuthCallback(
  request,
  url,
  env,
  { fetchImpl = fetch, getThreadsProfileImpl = getThreadsProfile, now } = {}
) {
  const code = url.searchParams.get("code");
  const stateId = url.searchParams.get("state");
  if (!stateId) {
    return safeAppConnectionResult(request, "failed");
  }

  const savedState = await getText(env, oauthStateKey(stateId));
  if (savedState === "valid") {
    return handleLegacyOAuthCallback(url, env, savedState, { fetchImpl });
  }

  if (url.searchParams.get("error") || !code) {
    return safeAppConnectionResult(request, "failed");
  }

  const state = parseConnectedAccountState(savedState, { now });
  if (!state) return safeAppConnectionResult(request, "failed");

  const current = await resolveCurrentSession(request, env);
  if (!current || current.session.legacy || current.sessionId !== state.sessionId || current.user.id !== state.userId) {
    return safeAppConnectionResult(request, "failed");
  }

  const workspace = await resolveSelectedWorkspaceForSession(env, current.session);
  if (!workspace || !workspace.active || workspace.id !== state.workspaceId || workspace.id === DEFAULT_WORKSPACE_ID) {
    return safeAppConnectionResult(request, "failed");
  }

  try {
    const account = await resolvePendingThreadsConnectedAccount(env, {
      workspaceId: workspace.id,
      connectedAccountId: state.connectedAccountId,
    });
    const credentialRef = getExpectedCredentialRef(account.id);
    if (await getText(env, credentialRef) !== null) {
      return safeAppConnectionResult(request, "failed");
    }

    await deleteKey(env, oauthStateKey(stateId));
    const shortLived = await exchangeAuthorizationCode(env, code, { fetchImpl });
    const longLived = await exchangeLongLivedToken(env, shortLived.access_token, { fetchImpl });
    const profile = await getThreadsProfileImpl(longLived.access_token);
    if (!isNonEmptyString(profile?.id) || !isNonEmptyString(profile?.username)) {
      throw new Error("Threads profile verification failed");
    }

    await putJson(env, credentialRef, {
      access_token: longLived.access_token,
      user_id: profile.id,
      token_type: longLived.token_type ?? null,
      expires_in: Number.isFinite(longLived.expires_in) ? longLived.expires_in : null,
      saved_at: nowIso(now),
      username: profile.username.trim(),
    });
    await activatePendingThreadsConnectedAccount(env, {
      workspaceId: workspace.id,
      connectedAccountId: account.id,
      displayName: profile.username,
    }, { now });
    return safeAppConnectionResult(request, "success");
  } catch {
    return safeAppConnectionResult(request, "failed");
  }
}
