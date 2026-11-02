# Personal access to the existing workspace

Local implementation, 2026-11-01 KST. Not deployed or activated by these edits.

The optional server setting `LEGACY_WORKSPACE_OWNER_USER_ID` assigns the existing synthetic `default-workspace` to one exact active personal user for app access. The configured target is the verified `mysecondhorizon` app user `user_9a3c6bdc-09d3-4010-be98-ddf04dbb8b30`. A platform operator grant does not confer workspace ownership. Missing, invalid, ambiguous or inactive user identity denies this assignment.

This is an access bridge, not a data migration. Workspace-scoped app APIs use the existing default storage keys, including prompts, posts, media, products, schedules and activity. No records are copied or rekeyed. `threads_auth`, legacy connected account identity and scheduler execution remain unchanged. The unrelated Next Horizon workspace and its owner remain unchanged.

Assignment permits the existing workspace API actions, including prompt/schedule edits and explicit publishing under the existing Threads credentials. It is not read-only. Verification must use synthetic storage and injected publishing mocks; do not publish, generate content, refresh provider data, change live schedules or replace credentials as a test. Ordinary structured users, other platform operators and unselected sessions remain denied. Global legacy API and maintenance access remains legacy-only; shared app/topic/settings parity is outside this change.

App listing, selection, context, pages and workspace API authorization resolve the same ownership. Every personal workspace page requires a currently authorized workspace, even when the session selects default. Do not convert a personal session into a legacy session. The default workspace hides the new Threads connection button, since its existing credential remains managed through legacy maintenance.

## Activation and verification

1. Run foundation/access tests, the complete regression suite, syntax checks and diff checks. Independently review the exact diff and config target.
2. Obtain explicit commit/push approval per AGENTS.md. Main push may auto-deploy; verify the deployed version before claiming access is enabled.
3. Log out and sign in as `mysecondhorizon`; a single available workspace is selected automatically. An existing null selection can also use the one-workspace selector. Do not change user/workspace identity through query parameters.
4. Check default workspace name and existing prompts using read-only app requests. Do not click publishing, generation, credential or schedule mutation controls for smoke testing.

## Rollback

Remove `LEGACY_WORKSPACE_OWNER_USER_ID` and deploy the reviewed config, or roll back the release. The next authorization check denies personal default access even with an existing selected session. No data cleanup, credential rollback or registry ownership edits are required. Legacy maintenance remains available. User activity changes made while access was authorized are not undone. KV user state is eventually consistent; do not claim immediate cross-region revocation or cancellation of already authorized in-flight work.
