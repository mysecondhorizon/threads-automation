import { config } from "../config.js";
import {
  deleteKey,
  getText,
  putJson,
} from "../services/kv.js";
import {
  activatePendingThreadsConnectedAccount,
  createPendingThreadsConnectedAccount,
  getExpectedCredentialRef,
  resolvePendingThreadsConnectedAccount,
} from "../services/connected-accounts.js";
import { resolveSelectedWorkspaceForSession } from "../services/login-foundation.js";
import { hasPlatformOperatorGrant } from "../services/platform-operators.js";
import { getThreadsProfile } from "../services/threads.js";
import { DEFAULT_WORKSPACE_ID } from "../services/workspace-foundation.js";
import { requireLegacyAdminSession, resolveCurrentSession } from "../middleware/auth.js";
import { html } from "../utils/response.js";
import { createCookie, getCookieValue } from "../utils/cookie.js";
import { requireSameOriginPost } from "../middleware/request-origin.js";

const OAUTH_STATE_PREFIX = "oauth_state:";
const CONNECTED_ACCOUNT_STATE_VERSION = 1;
const CONNECTED_ACCOUNT_STATE_TYPE = "connected_threads_account";
const OAUTH_STATE_TTL_SECONDS = 600;
const LEGACY_STATE_TYPE = "legacy_threads_account";
const RECONNECT_STATE_TYPE = "default_threads_reconnect";
const BINDING_COOKIE = "__Host-threads_oauth";

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
    "connectedAccountId", "createdAt", "expiresAt", "browserBinding",
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
    Date.parse(state.expiresAt) <= new Date(now).getTime()
  ) {
    return null;
  }
  return state;
}

function oauthRedirect(location, binding) {
  const headers = { location, "cache-control": "no-store", "referrer-policy": "no-referrer" };
  if (binding !== undefined) headers["set-cookie"] = createCookie(BINDING_COOKIE, binding, { sameSite: "Lax", maxAge: binding ? OAUTH_STATE_TTL_SECONDS : 0 });
  return new Response(null, { status: 302, headers });
}

async function resolveCallbackSession(request, env, state) {
  // Strict login cookies are absent on the provider redirect. The separate
  // short-lived browser proof can recover only this state-bound live session.
  try {
    if (getCookieValue(request, "admin_session")) return await resolveCurrentSession(request, env);
    if (!state.browserBinding || getCookieValue(request, BINDING_COOKIE) !== state.browserBinding) return null;
    const bound = new Request(request.url, { headers: { cookie: createCookie("admin_session", state.sessionId).split(";")[0] } });
    return await resolveCurrentSession(bound, env);
  } catch { return null; }
}

function connectionResult(path, outcome) {
  // End the provider's cross-site redirect chain before navigating with the
  // Strict login cookie. Only fixed local paths/status values enter this page.
  const response = html(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Threads 연결 결과</title></head><body><p>${outcome === "success" ? "Threads 연결 처리가 완료됐습니다." : "Threads 연결을 완료하지 못했습니다. 다시 시작해 주세요."}</p><a href="${path}?threadsConnection=${outcome}">돌아가기</a></body></html>`);
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  response.headers.set("content-security-policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  response.headers.set("set-cookie", createCookie(BINDING_COOKIE, "", { sameSite: "Lax", maxAge: 0 }));
  return response;
}

function safeAppConnectionResult(request, outcome) {
  return connectionResult("/app", outcome);
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

export async function handleConnectPage(request, env) {
  const auth = await requireLegacyAdminSession(request, env);
  if (!auth.ok) return auth.response;
  const response = html(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Threads 연결</title></head><body><h1>Threads 연결 관리</h1><form method="post" action="/oauth/start"><button>Threads 연결 시작</button></form><form method="post" action="/admin/exchange-token"><button>장기 토큰으로 전환</button></form><form method="post" action="/admin/me"><button>프로필 확인 및 저장</button></form><a href="/admin">관리 화면</a></body></html>`);
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "same-origin");
  return response;
}

async function isDefaultReconnectOwner(env, current) {
  if (!current || current.session.legacy || current.session.selectedWorkspaceId !== DEFAULT_WORKSPACE_ID) return false;
  const workspace = await resolveSelectedWorkspaceForSession(env, current.session);
  return workspace?.id === DEFAULT_WORKSPACE_ID && workspace.active &&
    await hasPlatformOperatorGrant(env, current.user.id);
}

async function credentialRevision(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function reconnectDenied(status = 403) {
  return new Response("Threads reconnection is unavailable", { status, headers: { "cache-control": "no-store" } });
}

export async function handleDefaultThreadsReconnectPage(request, env) {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { allow: "GET", "cache-control": "no-store" } });
  try {
    const current = await resolveCurrentSession(request, env);
    if (!current) return oauthRedirect("/app/login");
    if (!await isDefaultReconnectOwner(env, current)) return reconnectDenied();
    const response = html(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>기존 Threads 재연결</title></head><body><h1>기존 Threads 계정 재연결</h1><p>기존 운영 공간에 연결된 동일한 Threads 계정으로 인증해 주세요. 다른 계정으로 변경할 수 없습니다.</p><p>인증이 완료되면 장기 인증정보를 저장합니다. 이후 예약된 자동 게시가 다시 시도됩니다. 이 화면에서 바로 게시하지는 않습니다.</p><form method="post" action="/app/threads/reconnect/start"><button>Threads 재인증 시작</button></form><a href="/app">앱으로 돌아가기</a></body></html>`);
    response.headers.set("cache-control", "no-store");
    response.headers.set("referrer-policy", "same-origin");
    // The fixed local form redirects to the provider; form-action 'self' would
    // block that cross-origin OAuth redirect in some browsers.
    response.headers.set("content-security-policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    return response;
  } catch { return reconnectDenied(503); }
}

export async function handleDefaultThreadsReconnectStart(request, env, { createState = () => crypto.randomUUID(), now } = {}) {
  const denied = requireSameOriginPost(request);
  if (denied) return denied;
  try {
    const current = await resolveCurrentSession(request, env);
    if (!current) return reconnectDenied(401);
    if (!await isDefaultReconnectOwner(env, current)) return reconnectDenied();
    const stored = await getText(env, "threads_auth");
    const credential = JSON.parse(stored);
    if (!isNonEmptyString(credential?.user_id) || !isNonEmptyString(credential?.access_token)) return reconnectDenied(409);
    const stateId = createState();
    const createdAt = nowIso(now);
    const state = {
      version: 1, type: RECONNECT_STATE_TYPE, sessionId: current.sessionId,
      userId: current.user.id, workspaceId: DEFAULT_WORKSPACE_ID,
      expectedThreadsUserId: credential.user_id,
      credentialRevision: await credentialRevision(stored), browserBinding: crypto.randomUUID(),
      createdAt, expiresAt: new Date(Date.parse(createdAt) + OAUTH_STATE_TTL_SECONDS * 1000).toISOString(),
    };
    await putJson(env, oauthStateKey(stateId), state, { expirationTtl: OAUTH_STATE_TTL_SECONDS });
    return oauthRedirect(buildThreadsAuthorizationUrl(env, stateId).toString(), state.browserBinding);
  } catch { return reconnectDenied(503); }
}

function parseReconnectState(value, { now = Date.now() } = {}) {
  try {
    const state = JSON.parse(value);
    const keys = ["version", "type", "sessionId", "userId", "workspaceId", "expectedThreadsUserId", "credentialRevision", "browserBinding", "createdAt", "expiresAt"];
    if (!state || Object.keys(state).length !== keys.length || !keys.every(key => Object.hasOwn(state, key)) ||
        state.version !== 1 || state.type !== RECONNECT_STATE_TYPE ||
        !keys.slice(2).every(key => isNonEmptyString(state[key])) || state.workspaceId !== DEFAULT_WORKSPACE_ID ||
        !/^[a-f0-9]{64}$/u.test(state.credentialRevision) ||
        !Number.isFinite(Date.parse(state.createdAt)) || !Number.isFinite(Date.parse(state.expiresAt)) ||
        Date.parse(state.expiresAt) <= Date.parse(state.createdAt) ||
        Date.parse(state.expiresAt) - Date.parse(state.createdAt) > OAUTH_STATE_TTL_SECONDS * 1000 ||
        Date.parse(state.expiresAt) <= new Date(now).getTime()) return null;
    return state;
  } catch { return null; }
}

async function handleDefaultReconnectCallback(request, url, env, state, { fetchImpl, getThreadsProfileImpl, now }) {
  const result = outcome => connectionResult("/app", outcome);
  try {
    if (getCookieValue(request, BINDING_COOKIE) !== state.browserBinding) return result("failed");
    const current = await resolveCallbackSession(request, env, state);
    if (!current || current.sessionId !== state.sessionId || current.user.id !== state.userId ||
        !await isDefaultReconnectOwner(env, current)) return result("failed");
    const original = await getText(env, "threads_auth");
    if (!original || await credentialRevision(original) !== state.credentialRevision) return result("failed");
    const existing = JSON.parse(original);
    if (existing.user_id !== state.expectedThreadsUserId) return result("failed");
    await deleteKey(env, oauthStateKey(url.searchParams.get("state")));
    const code = url.searchParams.get("code");
    if (!code || url.searchParams.get("error")) return result("failed");
    const short = await exchangeAuthorizationCode(env, code, { fetchImpl });
    if (short.user_id !== state.expectedThreadsUserId) return result("failed");
    const long = await exchangeLongLivedToken(env, short.access_token, { fetchImpl });
    const profile = await getThreadsProfileImpl(long.access_token);
    if (profile?.id !== state.expectedThreadsUserId || !isNonEmptyString(profile?.username)) return result("failed");
    const live = await resolveCallbackSession(request, env, state);
    if (!live || live.sessionId !== state.sessionId || live.user.id !== state.userId ||
        !await isDefaultReconnectOwner(env, live) || await getText(env, "threads_auth") !== original) return result("failed");
    await putJson(env, "threads_auth", {
      ...existing, access_token: long.access_token, user_id: profile.id, username: profile.username.trim(),
      token_type: long.token_type ?? null, expires_in: Number.isFinite(long.expires_in) ? long.expires_in : null,
      saved_at: nowIso(now), updated_at: nowIso(now),
    });
    return result("success");
  } catch { return result("failed"); }
}

/** Legacy default-account OAuth start, explicitly bound to a live operator session. */
export async function handleOAuthStart(request, env, { createState = () => crypto.randomUUID(), now } = {}) {
  const blocked = requireSameOriginPost(request);
  if (blocked) return blocked;
  const auth = await requireLegacyAdminSession(request, env);
  if (!auth.ok) return auth.response;
  const state = createState();
  const createdAt = nowIso(now);
  const browserBinding = crypto.randomUUID();
  await putJson(env, oauthStateKey(state), {
    version: 1, type: LEGACY_STATE_TYPE, sessionId: auth.sessionId,
    userId: auth.user.id, browserBinding, createdAt,
    expiresAt: new Date(Date.parse(createdAt) + OAUTH_STATE_TTL_SECONDS * 1000).toISOString(),
  }, { expirationTtl: OAUTH_STATE_TTL_SECONDS });
  return oauthRedirect(buildThreadsAuthorizationUrl(env, state).toString(), browserBinding);
}

/** Creates a pending account for a trusted structured selected Workspace. */
export async function handleConnectedAccountOAuthStart(
  request,
  env,
  { createState = () => crypto.randomUUID(), now, createConnectedAccountId } = {}
) {
  const blocked = requireSameOriginPost(request);
  if (blocked) return blocked;

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
    payload.browserBinding = crypto.randomUUID();
    await putJson(env, oauthStateKey(state), payload, { expirationTtl: OAUTH_STATE_TTL_SECONDS });
    return oauthRedirect(buildThreadsAuthorizationUrl(env, state).toString(), payload.browserBinding);
  } catch {
    return new Response("Threads connection could not be started", {
      status: 500,
      headers: { "cache-control": "no-store" },
    });
  }
}

function parseLegacyState(value, { now = Date.now() } = {}) {
  try {
    const state = JSON.parse(value);
    const keys = ["version", "type", "sessionId", "userId", "browserBinding", "createdAt", "expiresAt"];
    if (!state || Object.keys(state).length !== keys.length || !keys.every(key => Object.hasOwn(state, key)) ||
        state.version !== 1 || state.type !== LEGACY_STATE_TYPE ||
        !keys.slice(2).every(key => isNonEmptyString(state[key])) ||
        !Number.isFinite(Date.parse(state.createdAt)) || !Number.isFinite(Date.parse(state.expiresAt)) ||
        Date.parse(state.expiresAt) <= Date.parse(state.createdAt) || Date.parse(state.expiresAt) <= new Date(now).getTime()) return null;
    return state;
  } catch { return null; }
}

async function handleLegacyOAuthCallback(request, url, env, state, { fetchImpl = fetch, now } = {}) {
  const result = outcome => connectionResult("/connect", outcome);
  const current = await resolveCallbackSession(request, env, state);
  if (!current || !current.session.legacy || current.sessionId !== state.sessionId || current.user.id !== state.userId) return result("failed");
  const code = url.searchParams.get("code");
  await deleteKey(env, oauthStateKey(url.searchParams.get("state")));
  if (url.searchParams.get("error") || !code) return result("failed");
  try {
    const data = await exchangeAuthorizationCode(env, code, { fetchImpl });
    await putJson(env, "threads_short_lived_token", {
      access_token: data.access_token, user_id: data.user_id,
      sessionId: current.sessionId, saved_at: nowIso(now),
    }, { expirationTtl: 3600 });
    return result("success");
  } catch { return result("failed"); }
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
  const reconnectState = parseReconnectState(savedState, { now });
  if (reconnectState) return handleDefaultReconnectCallback(request, url, env, reconnectState, { fetchImpl, getThreadsProfileImpl, now });
  const legacyState = parseLegacyState(savedState, { now });
  if (legacyState) return handleLegacyOAuthCallback(request, url, env, legacyState, { fetchImpl, now });

  if (url.searchParams.get("error") || !code) {
    return safeAppConnectionResult(request, "failed");
  }

  const state = parseConnectedAccountState(savedState, { now });
  if (!state) return safeAppConnectionResult(request, "failed");

  const current = await resolveCallbackSession(request, env, state);
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
