import assert from "node:assert/strict";
import test from "node:test";
import { handleDefaultThreadsReconnectPage, handleDefaultThreadsReconnectStart, handleOAuthCallback } from "./oauth.js";

const CREATED = "2026-11-01T00:00:00.000Z";
const CALLBACK = "2026-11-01T00:01:00.000Z";
const STATE_KEY = "oauth_state:reconnect-state";
const CREDENTIAL = { user_id: "123456789", username: "existing", access_token: "old-secret-token", saved_at: CREATED, custom: "preserved" };
function fixture() {
  const values = new Map([
    ["operator_users:v1", JSON.stringify({ version: 1, users: [{ id: "owner", loginId: "owner", displayName: "Owner", active: true, createdAt: CREATED, updatedAt: CREATED }] })],
    ["operator_workspaces:v1", JSON.stringify({ version: 1, workspaces: [{ id: "other", ownerUserId: "owner", name: "Other", active: true, createdAt: CREATED, updatedAt: CREATED }] })],
    ["platform_operator_grants:v1", JSON.stringify({ version: 1, grants: [{ userId: "owner", active: true }] })],
    ["admin_session:session", JSON.stringify({ version: 1, userId: "owner", selectedWorkspaceId: "default-workspace", createdAt: CREATED, expiresAt: "2099-01-01T00:00:00.000Z" })],
    ["threads_auth", JSON.stringify(CREDENTIAL)],
  ]);
  const writes = [], deletes = [], reads = [];
  const setup = { values, writes, deletes, reads, failWrite: false };
  setup.env = { LEGACY_WORKSPACE_OWNER_USER_ID: "owner", THREADS_APP_ID: "synthetic-app", THREADS_APP_SECRET: "synthetic-secret", THREADS_KV: {
    async get(key, type) { reads.push(key); const value = values.get(key) ?? null; return type === "json" && value !== null ? JSON.parse(value) : value; },
    async put(key, value) { if (setup.failWrite) throw Error("private-write-error-secret"); writes.push(key); values.set(key, value); },
    async delete(key) { deletes.push(key); values.delete(key); },
  } };
  return setup;
}
function request(path = "/app/threads/reconnect/start", { method = "POST", origin = "https://example.test", session = "session", binding } = {}) {
  const cookies = [...(session ? [`admin_session=${session}`] : []), ...(binding ? [`__Host-threads_oauth=${binding}`] : [])];
  return new Request("https://example.test" + path, { method, headers: { ...(origin === null ? {} : { origin }), ...(cookies.length ? { cookie: cookies.join("; ") } : {}) } });
}
function changeSession(setup, changes) {
  setup.values.set("admin_session:session", JSON.stringify({ ...JSON.parse(setup.values.get("admin_session:session")), ...changes }));
}
async function start(setup) {
  const response = await handleDefaultThreadsReconnectStart(request(), setup.env, { now: CREATED, createState: () => "reconnect-state" });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location"), /threads\.net\/oauth\/authorize/u);
  return JSON.parse(setup.values.get(STATE_KEY));
}
function provider({ shortId = CREDENTIAL.user_id, duringExchange, fail = false } = {}) {
  let calls = 0;
  return { get calls() { return calls; }, async fetchImpl() {
    calls++;
    if (duringExchange && calls === 1) await duringExchange();
    if (fail) return Response.json({ error: "private-provider-secret" }, { status: 400 });
    return Response.json(calls === 1 ? { access_token: "new-short-secret", user_id: shortId } : { access_token: "new-long-secret", token_type: "bearer", expires_in: 5184000 });
  } };
}
async function callback(setup, state, { session = null, binding = state.browserBinding, now = CALLBACK, profileId = CREDENTIAL.user_id, profileImpl, fetcher = provider(), query = "code=private-code&state=reconnect-state" } = {}) {
  const req = request("/oauth/callback?" + query, { method: "GET", session, binding });
  const response = await handleOAuthCallback(req, new URL(req.url), setup.env, { now, fetchImpl: (...args) => fetcher.fetchImpl(...args), getThreadsProfileImpl: profileImpl ?? (async () => ({ id: profileId, username: "renamed_account" })) });
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(text, /private-code|private-provider-secret|private-write-error-secret|old-secret-token|new-short-secret|new-long-secret/u);
  return { text, fetcher };
}
const unchanged = setup => assert.equal(setup.values.get("threads_auth"), JSON.stringify(CREDENTIAL));

test("reconnect page requires personal ownership plus operator grant and exposes a same-origin form", async () => {
  const setup = fixture();
  const response = await handleDefaultThreadsReconnectPage(request("/app/threads/reconnect", { method: "GET" }), setup.env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("referrer-policy"), "same-origin");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const text = await response.text();
  assert.match(text, /method="post" action="\/app\/threads\/reconnect\/start"/u);
  assert.match(text, /예약된 자동 게시/u);
  assert.doesNotMatch(text, /old-secret-token/u);
  assert.deepEqual(setup.writes, []);
  assert.equal((await handleDefaultThreadsReconnectPage(request(), setup.env)).status, 405);
  assert.equal((await handleDefaultThreadsReconnectPage(request("/app/threads/reconnect", { method: "GET", session: null }), setup.env)).headers.get("location"), "/app/login");
});

test("start rejects wrong method, origin, identity, workspace and grant before state writes", async () => {
  for (const mode of ["get", "missing-origin", "null-origin", "foreign-origin", "no-login", "legacy", "unselected", "other-workspace", "no-owner", "no-grant", "inactive", "missing-credential", "missing-stable-id"]) {
    const setup = fixture();
    const options = {};
    if (mode === "get") options.method = "GET";
    if (mode === "missing-origin") options.origin = null;
    if (mode === "null-origin") options.origin = "null";
    if (mode === "foreign-origin") options.origin = "https://foreign.test";
    if (mode === "no-login") options.session = null;
    if (mode === "legacy") setup.values.set("admin_session:session", "valid");
    if (mode === "unselected") changeSession(setup, { selectedWorkspaceId: null });
    if (mode === "other-workspace") changeSession(setup, { selectedWorkspaceId: "other" });
    if (mode === "no-owner") delete setup.env.LEGACY_WORKSPACE_OWNER_USER_ID;
    if (mode === "no-grant") setup.values.set("platform_operator_grants:v1", JSON.stringify({ version: 1, grants: [] }));
    if (mode === "inactive") { const users = JSON.parse(setup.values.get("operator_users:v1")); users.users[0].active = false; setup.values.set("operator_users:v1", JSON.stringify(users)); }
    if (mode === "missing-credential") setup.values.delete("threads_auth");
    if (mode === "missing-stable-id") setup.values.set("threads_auth", JSON.stringify({ access_token: "existing" }));
    const response = await handleDefaultThreadsReconnectStart(request(undefined, options), setup.env);
    assert.ok(response.status >= 400, mode);
    assert.deepEqual(setup.writes, [], mode);
  }
});

test("successful proof-bound callback replaces only existing credentials and prevents sequential replay", async () => {
  const setup = fixture();
  const state = await start(setup);
  assert.equal(state.type, "default_threads_reconnect");
  assert.equal(state.expectedThreadsUserId, CREDENTIAL.user_id);
  assert.equal(Date.parse(state.expiresAt) - Date.parse(state.createdAt), 600000);
  assert.doesNotMatch(JSON.stringify(state), /old-secret-token|new-short-secret/u);
  const fetcher = provider();
  const { text } = await callback(setup, state, { fetcher });
  assert.match(text, /threadsConnection=success/u);
  const credential = JSON.parse(setup.values.get("threads_auth"));
  assert.equal(credential.user_id, CREDENTIAL.user_id);
  assert.equal(credential.username, "renamed_account");
  assert.equal(credential.access_token, "new-long-secret");
  assert.equal(credential.expires_in, 5184000);
  assert.equal(credential.custom, "preserved");
  assert.deepEqual(setup.writes, [STATE_KEY, "threads_auth"]);
  assert.deepEqual(setup.deletes, [STATE_KEY]);
  assert.equal([...setup.values.keys()].some(key => /connected_account|short_lived/u.test(key)), false);
  const replay = await callback(setup, state, { fetcher });
  assert.match(replay.text, /threadsConnection=failed/u);
  assert.equal(fetcher.calls, 2);
});

test("same-account checks reject mismatched code and profile identities without replacing credentials", async () => {
  for (const mode of ["code", "profile"]) {
    const setup = fixture(), state = await start(setup);
    const result = await callback(setup, state, { fetcher: provider({ shortId: mode === "code" ? "different" : CREDENTIAL.user_id }), profileId: mode === "profile" ? "different" : CREDENTIAL.user_id });
    assert.match(result.text, /threadsConnection=failed/u);
    unchanged(setup);
    assert.deepEqual(setup.writes, [STATE_KEY]);
  }
});

test("callback requires browser proof even with a valid personal login cookie", async () => {
  for (const binding of [undefined, "wrong-proof"]) {
    const setup = fixture(), state = await start(setup), fetcher = provider();
    const req = request("/oauth/callback?code=private-code&state=reconnect-state", { method: "GET", session: "session", binding });
    const response = await handleOAuthCallback(req, new URL(req.url), setup.env, { now: CALLBACK, fetchImpl: (...args) => fetcher.fetchImpl(...args) });
    assert.match(await response.text(), /threadsConnection=failed/u);
    assert.equal(fetcher.calls, 0);
    unchanged(setup);
  }
});

test("expired, malformed, wrong-session and changed-credential callbacks fail before exchange", async () => {
  for (const mode of ["expired", "extra-key", "wrong-type", "target-tamper", "wrong-session", "credential-change"]) {
    const setup = fixture(), state = await start(setup), fetcher = provider();
    const options = { fetcher };
    if (mode === "expired") options.now = "2026-11-01T00:10:00.000Z";
    if (mode === "extra-key") setup.values.set(STATE_KEY, JSON.stringify({ ...state, extra: true }));
    if (mode === "wrong-type") setup.values.set(STATE_KEY, JSON.stringify({ ...state, type: "unexpected" }));
    if (mode === "target-tamper") setup.values.set(STATE_KEY, JSON.stringify({ ...state, expectedThreadsUserId: "different" }));
    if (mode === "wrong-session") { setup.values.set("admin_session:other", setup.values.get("admin_session:session")); options.session = "other"; }
    if (mode === "credential-change") setup.values.set("threads_auth", JSON.stringify({ ...CREDENTIAL, access_token: "newer-credential" }));
    const before = setup.values.get("threads_auth");
    assert.match((await callback(setup, state, options)).text, /threadsConnection=failed/u);
    assert.equal(fetcher.calls, 0, mode);
    assert.equal(setup.values.get("threads_auth"), before, mode);
  }
});

function revoke(setup, mode) {
  if (mode === "owner") delete setup.env.LEGACY_WORKSPACE_OWNER_USER_ID;
  if (mode === "grant") setup.values.set("platform_operator_grants:v1", JSON.stringify({ version: 1, grants: [] }));
  if (mode === "user") { const users = JSON.parse(setup.values.get("operator_users:v1")); users.users[0].active = false; setup.values.set("operator_users:v1", JSON.stringify(users)); }
  if (mode === "session") setup.values.delete("admin_session:session");
  if (mode === "selection") changeSession(setup, { selectedWorkspaceId: null });
}
test("revocation before callback or during exchange prevents final credential write", async () => {
  for (const timing of ["before", "during"]) for (const mode of ["owner", "grant", "user", "session", "selection"]) {
    const setup = fixture(), state = await start(setup);
    if (timing === "before") revoke(setup, mode);
    const fetcher = provider({ duringExchange: timing === "during" ? () => revoke(setup, mode) : undefined });
    const result = await callback(setup, state, { fetcher });
    assert.match(result.text, /threadsConnection=failed/u, timing + mode);
    unchanged(setup);
    assert.deepEqual(setup.writes, [STATE_KEY]);
  }
});

test("provider, profile and write failures return generic result without partial credential replacement", async () => {
  for (const mode of ["provider", "profile", "write", "credential-concurrency"]) {
    const setup = fixture(), state = await start(setup);
    const options = { fetcher: provider({ fail: mode === "provider" }) };
    if (mode === "profile") options.profileImpl = async () => { throw Error("private-provider-secret"); };
    if (mode === "write") setup.failWrite = true;
    if (mode === "credential-concurrency") options.fetcher = provider({ duringExchange: () => setup.values.set("threads_auth", JSON.stringify({ ...CREDENTIAL, access_token: "newer-credential" })) });
    assert.match((await callback(setup, state, options)).text, /threadsConnection=failed/u);
    if (mode === "credential-concurrency") assert.equal(JSON.parse(setup.values.get("threads_auth")).access_token, "newer-credential");
    else unchanged(setup);
    assert.deepEqual(setup.writes, [STATE_KEY]);
  }
});
