# Read-only operator console

2026-10-12 local implementation. `/operator` GET uses the existing platform operator session guard. A personal active user requires an explicit active grant; legacy/shared-password sessions and ordinary users are denied. Workspace selection does not confer operator access, and operator access does not confer workspace ownership.

The page shows only the validated operator user ID, access confirmation, read-only scope and the scheduler ownership mode from the executing code. It explicitly does not claim recent posting success or external-service health. It does not read execution logs, credentials, workspace content or other users for presentation. Authentication reads remain the existing session/users/grants records.

All responses use no-store, no-referrer, nosniff and restrictive CSP. Unsupported methods return 405 before storage access. Missing authentication returns a 401 page linking to `/app/login`; after login the user returns to `/operator`. No return URL input, role-editing form, impersonation, new API or automatic provisioning is added. Denied users get 403; storage failure gives generic 503.

The new route is the first consumer of the platform-operator guard. Existing app/admin behavior is not otherwise changed. There are no production grant writes in this task, so successful real operator access is not yet established. Follow-up: controlled provisioning/recovery plan and a named target personal account before granting actual authority. The existing grant store's eventual-consistency revocation limits remain.

Tests cover granted null/selected workspace sessions, ordinary/legacy denial, expired session/inactive user/revoked grant, generic storage errors, method rejection, narrow read allowlist and absent external or mutation effects. Browser visual/live-login testing and production health verification are outside this local test evidence.

Validation complete: full src suite 241/241 passed; independent operator_console_review APPROVED with 6/6 focused tests and JavaScript syntax/diff checks. Wrangler 4.131.2 dry-run build passed with container rollout disabled. Six intended files remain uncommitted pending user approval; protected untracked files are excluded.
