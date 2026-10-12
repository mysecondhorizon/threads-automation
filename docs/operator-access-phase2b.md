# Phase 2B: connection and token mutation protection

Local implementation checkpoint, 2026-10-12. Previous phase 1 + 2A was committed as b400a1da93031db4f55a474865cd97b518866d31 and pushed to main. Deployment version 3d4d506a-fcc7-467a-a4a6-90a037428af9 served 100% at 15:06 KST on October 11; the production module matched the local b400a1d build byte-for-byte. This new phase is not committed or deployed.

## Scope

- `/connect` becomes an authenticated legacy maintenance page with explicit POST controls.
- `/oauth/start` requires legacy authentication and a same-origin POST; legacy callbacks require typed expiring state bound to the initiating browser/session. Old unbound `valid` states cannot complete; start the connection again after rollout.
- Structured workspace connection initiation also requires same-origin POST. Existing ownership, pending-account and credential-reference validation remain required.
- `/admin/exchange-token` and `/admin/me` become same-origin POST operations. GET must have no provider calls or storage writes. Existing bookmarked GET actions must be replaced by `/connect` form controls.
- The pending legacy short-lived token is tied to the initiating session; another session cannot exchange or inspect it. `/admin/token` returns availability only, never the token itself. Provider error bodies are not returned by these token handlers.

## Browser request boundary

Require exact `Origin` equality with the request URL origin for these POSTs. Missing, null, foreign or malformed origins fail closed; no Referer fallback. When supplied, `Sec-Fetch-Site` must be `same-origin`. Browser forms naturally send Origin on POST. Non-browser maintenance clients must explicitly send the intended Origin and still authenticate. These checks defend browser cross-site requests; Origin is not an authentication credential. The main session cookie remains HttpOnly/Secure/SameSite=Strict.

Callbacks arrive from an external provider and use their own expiring state/browser-binding proof rather than the normal POST origin rule. Use the configured canonical application host for connection flows: cookies from a different host cannot bind a callback. Restarting a connection in the same browser may supersede its prior pending flow. Revoked/expired sessions must fail callback validation.

The callback accepts the matching live main session, or (when that cookie is absent) a short-lived `__Host-threads_oauth` HttpOnly/Secure/Lax proof and revalidates the state-bound session from storage. A present conflicting/invalid main session never falls back. The callback ends with a no-store, no-referrer HTML result and a fixed local user-activated return link, clearing the proof cookie. It does not immediately redirect, avoiding Strict-cookie behavior across provider redirect chains. Offline tests verify these response contracts; real-browser provider completion has not been performed.

## Validation and limits

Final local validation on 2026-10-12: full src suite 235/235 passed; the corrected valid-but-expired session fixture additionally passed the OAuth suite. Independent reviewer phase2b_review completed APPROVED and ran 23/23 focused tests. Changed JavaScript syntax, tracked/untracked whitespace checks and Wrangler 4.131.2 dry-run build passed (container rollout disabled). No real provider/browser completion or deploy was performed. Commit/push await explicit user authorization.

Tests use synthetic storage and mocked provider calls: unauthenticated/personal/legacy sessions; correct and incorrect origin/method; wrong/absent/expired callback binding; old state and sequential replay; revoked sessions; successful personal and legacy callbacks; token ownership; safe error and status output. Verify routing, navigation and form callers match the new methods.

KV does not provide an atomic consume-once operation across regions. State removal plus provider code consumption prevents normal sequential reuse; this is not proof of exactly-once global execution under simultaneous stale reads. No broader session revocation architecture is introduced.

This is not global CSRF coverage. Other legacy publishing/media/insights routes, login CSRF, provisioning/recovery, operator console and final shared-password retirement need their own scoped work. Do not claim all GET side effects are removed. No real OAuth exchange, token mutation, account migration or Threads post is permitted as a verification step in this tranche.

Reference for exact source/target origin validation: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html (checked 2026-10-11).
