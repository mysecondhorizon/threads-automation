# Operator access transition

Checkpoint: 2026-10-10. Phase 1 is a local, unconnected authorization foundation.

## Target separation

Personal ID/password login identifies a user. An explicit server-held grant separately permits platform operations. Workspace ownership remains a separate check: an operator grant does not imply access to another user's content, credentials, or publishing controls.

The existing shared-password admin login and current app/admin routes are unchanged in phase 1. No route imports the new guard yet; this change does not secure or migrate those routes by itself.

## Phase 1 contract

- `requirePlatformOperatorSession` requires a valid structured session, an active uniquely identifiable stored user, and an active exact-ID grant. Legacy sessions and `legacy-owner` cannot qualify.
- The read-only `platform_operator_grants:v1` KV record has exactly `version: 1` and `grants`, an array of at most 100 records with exactly `userId` and boolean `active`. Unknown fields, invalid identities or duplicate IDs invalidate the entire registry.
- Missing authorization is denied by default. Missing/invalid authentication returns 401; authenticated users without valid operator authority return 403; storage failures return a generic 503. Denial responses use `Cache-Control: no-store`.
- Success exposes only the operator user ID. User-supplied roles, workspace selection and legacy access confer no authority.
- Each request reads current storage without an application authorization cache. KV eventual consistency still permits stale reads; immediate global revocation is not guaranteed. Separate reads are not an atomic identity/grant snapshot.
- No grants, users or sessions are written. There is no bootstrap endpoint, automatic first-user elevation or default operator. No binding/configuration changes are required.

## Acceptance criteria

1. Active personal login plus explicit active grant succeeds; ordinary and legacy logins fail the new guard.
2. Expired/forged sessions, inactive/deleted users, ambiguous user IDs, malformed/duplicate grants and read failures never authorize.
3. Changing a grant or user status is re-evaluated on subsequent requests, subject to KV consistency.
4. Existing login and workspace tests continue to pass. Checks do not call external services or write storage.
5. Existing routes, scheduler ownership, publishing and stored production data remain unchanged.

## Subsequent phases, not implemented here

The route inventory and provisioning/recovery design are recorded in [phase 2 design](operator-access-phase2-design.md). Phase 2 was documentation; its subsequent phase 2A implementation now tightens legacy/global and owned-workspace access locally. See that document's implementation checkpoint for the current scope. Platform-operator grants remain unconnected and live account rollout has not begun.

1. Inventory admin routes and classify platform operations versus workspace-owned operations; identify shared app callers before wiring guards. Review CSRF protection for future state-changing endpoints.
2. Design controlled first-operator provisioning and recovery. Verify the intended personal account and immutable user ID; never collect passwords in chat. Provisioning must handle partial failures and establish an audit trail. Decide whether KV revocation latency is acceptable before enforcing sensitive platform operations.
3. Map legacy default workspace/account ownership and dependencies with a dry-run plan and rollback. A newly registered user does not automatically own the legacy workspace. Keep credential migration distinct from granting operator authority.
4. Introduce the operator console and route-specific server checks, with authorized and unauthorized integration tests. Check every relevant API, not only navigation visibility.
5. After verified personal login, data access, recovery and route protection, retire shared-password login and invalidate legacy sessions deliberately.

Scheduler ownership cutover, learning activation, automatic content publishing, account impersonation, bulk data migration, grants administration UI and immediate-consistency authorization storage are outside phase 1. Main pushes may auto-deploy and need separate authorization.
