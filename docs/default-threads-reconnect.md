# Existing Threads account recovery

Local implementation, 2026-11-02 KST. Production activation requires reviewed commit/push/deployment approval.

`GET /app/threads/reconnect` and `POST /app/threads/reconnect/start` require all of: an active personal login, an active platform operator grant, and the explicitly assigned Default Workspace selected. They do not accept legacy sessions, a grant alone, another workspace, an absent selection or a missing existing credential identity. No shared admin password is read or changed. Other legacy maintenance routes retain their legacy-only guards.

The page uses same-origin Referrer-Policy so its POST retains the exact Origin checked by the server. Existing `/connect` forms receive the same correction. OAuth redirects and callback landings retain no-referrer and no-store; the reconnect form permits the fixed OAuth redirect instead of blocking it with form-action self.

Start stores a dedicated, exact-schema 10-minute OAuth state bound to the personal session, user, Default Workspace, existing stable Threads user ID, original credential revision digest and separate HttpOnly browser proof. No raw code/token is stored in state or returned in application response bodies. Callback requires the browser proof even when the login cookie is present. State consumption precedes provider exchange. The authorization-code exchange user ID and long-token profile ID must both equal the original Threads account ID; username changes do not change the stable identity.

Before replacing `threads_auth`, the callback rechecks the live initiating session, active owner/operator authority and unchanged original credential. Success replaces only that existing credential record, preserving other fields while updating token, profile and expiry metadata. It does not create a pending account, write a second credential, change workspace ownership/schedules, generate content or publish. Failures return a generic local landing with no provider body, token or code. The callback and result page do not auto-retry.

KV state consumption and credential read/check/write are not atomic. This flow does not guarantee concurrent single-use exchange, prevent simultaneous lost updates, immediately revoke cross-region cached authority or cancel in-flight provider requests. Concurrent credential maintenance should be avoided; transactional coordination is a separate change. A transport error after a credential write may leave the outcome uncertain; inspect metadata and perform a read-only profile check before restarting recovery.

## User steps after deployment

1. Log into `/app/login` with the personal account and select Default Workspace.
2. Open **기존 Threads 재연결** and click **Threads 재인증 시작**.
3. Authorize the same existing Threads account. A different account is rejected.
4. The callback exchanges and verifies the credential, then displays a local success/failure page. Follow its app return link.
5. Read-only profile verification can confirm recovery. Do not trigger a real test post. Subsequent scheduled AUTO attempts may resume once the credential is valid; other content/AI checks still apply.

Verification uses synthetic KV and injected provider/profile functions. Required cases include authorization/origin/method denial, expired/wrong/replayed state, wrong proof/session, ownership/grant/session revocation, original credential changes, incorrect provider identity, provider/storage failures, success-only existing-key replacement, no raw secret response and legacy/ordinary connected-account regression coverage.

Rollback the release to remove personal recovery routes. It does not undo credentials already renewed by an authorized user. Never restore an expired token merely to roll back UI code.
