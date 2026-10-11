# Operator access phase 2: route separation and provisioning design

2026-10-11. Design, local source inspection and synthetic offline verification only. No runtime changes, production reads/writes, account grants, credential migration or deployment in this phase. Phase 1's guard remains unconnected.

Review status: primary completed the design review. The route audit agent confirmed shared global apps/topics consumers and scoped insights before stopping at its usage limit; it did not deliver final independent approval. Phase 1 approval applies only to its four source/test files.

## Implementation checkpoint: phase 2A, 2026-10-11

Local changes now close items 1 and 2 below at the shared API guard: all structured sessions are denied legacy/global API access, including null/default selections and users with platform grants. Workspace-enabled APIs require a selected active owned non-default workspace. Legacy access remains compatible. The legacy admin home/endpoints/post/media pages and global app settings page use an explicit legacy-only page guard; the dashboard already had its own equivalent denial and is unchanged.

Global app/topic API reads and writes remain unavailable to personal accounts; no shared-data product policy or new projection is introduced. Owned-workspace accounts were already blocked on these global APIs before this patch. The write page now states that limitation explicitly while retaining manual writing/storage. Structured null/default sessions cannot use the write page. This is intentional containment until owned app/topic designs are ready, not a claim of feature parity with legacy admin.

This denial applies to the direct global apps/topics endpoints. The existing workspace-enabled `/api/posts/generate` flow still consumes the shared topic inventory internally; it is unchanged. This patch does not claim full topic-data isolation. Inventory ownership and user-safe projections require a separate follow-up.

OAuth binding, mutation-via-GET, CSRF, provisioning/recovery, and a new operator console remain subsequent slices. This patch does not close every issue in the inventory and has not been deployed. The findings below describe the inspected pre-patch baseline.

## Product boundary

Use `/app/login` for personal ID/password authentication. Ordinary users operate only their owned workspace. Operators use the same personal identity with a separate explicit grant and a proposed `/operator` console. Operator status does not imply workspace ownership, account impersonation or access to raw credentials. Keep `/admin` as a temporary legacy maintenance surface until migration is verified; do not simply redirect every `/admin` request to `/app`.

## Current route inventory and proposed ownership

| Surface | Current boundary and storage | Proposed treatment |
|---|---|---|
| `/`, `/media/*` | Public health/media delivery | Preserve intended public access; do not add blanket operator middleware |
| `/app/login`, `/app/logout`, `/app/workspace` | Personal authentication and owned workspace selection | User/session operations; not operator-only |
| `/app/connected-accounts/threads/start`, structured `/oauth/callback` | Session/user/workspace-bound connection state | Preserve owned-account flow and callback state validation |
| `/connect`, `/oauth/start`, legacy callback | Public legacy start; `valid` state; callback writes global short-lived token | Legacy maintenance only; bind initiation/callback to authenticated maintenance identity before broader rollout |
| `/admin/login`, `/admin/logout` | Shared-password legacy session lifecycle | Temporary compatibility; retire only after recovery and migration gates |
| `/app/write`, `/app/daily`, `/app/media`, `/app/products`, `/app/prompts`, `/app/activity`, `/app/schedules` | App/session screens with shared APIs | Owned-workspace user capabilities; hiding navigation is not authorization |
| `/api/posts` and children, `/api/media` and children, `/api/products/media`, `/api/product-opportunities` and children, `/api/prompts` and reset, `/api/activity`, `/api/schedules` and children | `allowSelectedWorkspace:true`, downstream scope checks | Preserve owned-workspace behavior; reject unowned/default selection for structured users |
| `/admin/insights`, `/admin/insights/refresh` | Also `allowSelectedWorkspace:true` despite admin URL | Workspace capability; retain scope enforcement, consider app URL alias separately |
| `/api/apps` and children, `/app/apps` | Global app records, old auth guard | Platform configuration needs operator-only mutation; user-safe read projection or owned replacement needed for shared clients |
| `/api/topics`, `/api/topics/refresh` | Global inventory, old auth guard | Separate user-safe reads from operator refresh; define whether shared inventory is an intentional product feature |
| `/admin`, `/admin/endpoints`, `/admin/dashboard`, `/admin/post`, `/admin/media-page` | Legacy pages primarily guarded by login only | Keep legacy-only during transition; replace necessary operator views with sanitized console views |
| `/admin/ai/draft`, `/admin/context`, `/admin/auto-post`, status/preview, diagnostics, `/admin/media`, batch, `/admin/content-pool`, `/admin/schedule-status`, `/admin/logs` | Legacy/global helpers and operational data | Quarantine as legacy maintenance first; migrate individually by actual data/action ownership. Operator grant alone must not authorize publishing under another identity |
| `/admin/token`, `/admin/exchange-token`, `/admin/me` | Global credentials; token read and GET actions with writes | Remove raw-token UI output; move necessary maintenance actions behind explicit authorization and protected POST requests |

Source entry points: `src/index.js`, `src/middleware/auth.js`, `src/services/app-context.js`, `src/routes/app-auth.js`, `src/routes/oauth.js`, `src/routes/tokens.js`, `src/routes/api-apps.js`, `src/routes/api-topics.js`, and their shared page callers. This is a migration inventory, not a claim every downstream resource check has received a full security audit.

## Verified blockers before account rollout

1. `requireAdminApiSession` with its default options rejects a structured user only when a truthy non-default workspace is selected. A structured session with `selectedWorkspaceId:null` passes. `handleAppLogin` produces null when zero or multiple active workspaces exist. Thus global endpoints such as `/admin/token` can be reached by that authenticated state in current source. This is a source-level authorization gap; no production exploit was attempted or observed.
2. With `allowSelectedWorkspace:true`, a structured session naming the default workspace also bypasses ownership validation. Current app selection rejects this value, but the server boundary should not rely on that UI/service behavior. Regression tests currently preserve compatibility that must be deliberately changed.
3. Legacy OAuth start is public and its legacy state is not bound to a user/session. Its callback can replace the global short-lived token. This alone is not proof that long-lived credentials or published posts were replaced; those require separate actions.
4. `/admin/exchange-token` and `/admin/me` are GET routes with writes. Session cookies default to Secure/HttpOnly/SameSite=Strict, but that is not a complete mutation authorization/CSRF design. New privileged mutations require POST/PATCH/DELETE plus same-origin and CSRF checks; external OAuth callbacks retain their separately validated state protocol.
5. `/app/write` consumes the global apps/topics APIs. Blanket operator guards would break or silently degrade ordinary user flows. Define safe reads explicitly; do not expose global operational configuration just because a page needs a selector.

## Recommended implementation order

1. Close legacy/global authorization bypasses. Explicitly require legacy sessions on temporary legacy surfaces; structured sessions cannot gain legacy access via null/default/owned selection, even with an operator grant. Preserve existing owned-workspace endpoints and test direct API requests. Define safe app/topic reads before tightening their shared endpoints.
2. Bind legacy OAuth maintenance and replace mutation-via-GET paths; preserve the structured connected-account callback. Add origin/CSRF and method regressions. Remove raw credential responses from the future console.
3. Add a minimal read-only `/operator` console protected by the new grant guard. Start with sanitized system health and operator identity; no user content, token display, grant editing, scheduler toggles or publish controls.
4. Prepare controlled account/grant provisioning and recovery below. Only then apply an explicit live provisioning plan with a named target user and environment.
5. Separately plan default workspace/account ownership migration and finally shared-password retirement. Scheduler ownership and learning-consumer activation are separate changes.

## Controlled provisioning design

Existing `maintenance-provision-registered-user.js` prompts for a password in an interactive terminal, requires `--confirm`, and delegates user/password/new-workspace creation to `registered-user-provisioning.js`. It does not grant operator status or migrate the legacy workspace. It is not an operator bootstrap solution: writes are sequential and may partially succeed, and its remote adapter passes serialized KV values through command arguments. Do not reuse that transport for privileged provisioning without reviewing secret handling and shell boundaries.

The proposed operator maintenance tool defaults to a read-only plan. Pin repository revision, environment/namespace and exact immutable user ID; validate unique active user, authentication record and complete grant registry. Present only non-secret identities, intended changes and registry digest. Require explicit application of that plan. No password/hash/token should appear in arguments, logs, repository files, tool outputs or chat; use a hidden interactive entry and a non-logging transport for credential writes.

Prefer an existing verified personal account; if creating one, complete and verify ordinary login before granting authority. Do not automatically create or attach a workspace for platform authority. Grant active status last, only after identity verification. Re-read preconditions before applying, refuse a stale plan, and preserve other grants. KV cannot make these checks and the final write atomic: require exclusive maintenance ownership and do not claim digest checks prevent concurrent lost updates. Use serialized/transactional authority storage before supporting concurrent grant administration.

Record a restricted audit entry containing actor, environment, target user ID, action, timestamp, operation ID, non-secret before/after state and outcome. Define and test behavior on audit-write failure; never report a partially applied operation as complete. Do not expand the strict grant schema with audit fields silently. On account/password/workspace failures stop and report the completed stages; do not blindly rerun or delete unrelated data. On failed verification after grant application, revoke the target grant, report partial state and verify denial subject to storage consistency.

## Recovery and revocation

- Maintain an out-of-band Cloudflare account recovery path with scoped maintenance access independent of the app login. A second operator is optional, not automatically created.
- Lost password: verify identity out of band, suspend the operator grant, reset credentials privately, invalidate existing sessions, verify fresh login, then deliberately restore the grant. `setUserPassword` alone does not invalidate stored sessions; session invalidation is an implementation prerequisite.
- Compromised identity: suspend grant/user and use an independently controlled ingress restriction when immediate blocking is required. Re-enabling a user while old sessions remain valid can restore old access; do not rely on password rotation alone.
- KV is eventually consistent, including negative lookups. Re-reading after a write is not proof of immediate worldwide revocation. Do not give a fixed safe waiting period or rely on KV-only suspension for emergency containment. Before sensitive console mutations, either establish a tested emergency restriction procedure or design strongly consistent authorization checks.
- Rollback is scoped: disable new console/routes if necessary and revoke only the introduced grant; preserve app user data and current unrelated changes. Do not restore old shared-password access automatically after retiring it.

Cloudflare consistency reference: https://developers.cloudflare.com/kv/concepts/how-kv-works/ (checked 2026-10-10).

## Acceptance criteria for subsequent implementation

- Test a matrix of unauthenticated, legacy, ordinary and granted structured users against null/default/owned/unowned/deleted workspace states. Neither login nor an operator grant bypasses ownership.
- Global legacy API/page tests demonstrate denial before reads/writes/external calls for ordinary structured users; intended legacy compatibility remains explicit.
- Shared app APIs continue to provide only approved user-safe data; unsupported global configuration is denied visibly, not silently replaced with another account's data.
- Cross-origin privileged mutations, missing/invalid CSRF proof and unsupported methods cause no writes. OAuth callbacks verify their bound state and intended account without requiring the normal form-CSRF flow.
- Provisioning defaults to no writes; stale plans, duplicate users/grants, storage errors, partial writes and audit errors never report success. Output redaction and transport are tested with synthetic secrets.
- Recovery invalidates old sessions and does not restore them when re-granting authority. Test the emergency restriction separately from KV consistency.
- Route tests use fakes; no live posting, OAuth exchange or account provisioning is part of offline validation.

Likely files: auth middleware and tests; route-specific admin/OAuth/token handlers and tests; shared app/topic adapters and callers; new operator console and route wiring; separate maintenance planner/applicator, audit and recovery tests. Keep these as separate reviewable changes, not one broad auth rewrite.

## Product choices and defaults

Recommended defaults for local work: shared personal login; separate `/operator` console; operator authority independent of workspace ownership; no impersonation; read-only console first; no self-service operator enrollment. Keep legacy access temporarily restricted to its existing maintenance identity.

Before live provisioning, the user must choose the personal account to grant and verify recovery access. Before exposing mutation controls, choose the required revocation guarantee. Shared topic inventory reads and app-selector semantics must be resolved in the first implementation slice, using current caller needs. No password or token should be requested in chat.
