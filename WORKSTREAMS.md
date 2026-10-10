# Second Horizon Workstreams

Updated: 2026-10-09 KST. Current assignments replace the old Codex A/B and ARCH-01-I3C queue. Historical records remain in Git history; implemented account runtime work is not a new assignment.

## Coordination and authorization

- Primary agent owns coordination and reports concrete results to the user.
- Use planning/implementation/independent review roles when assigned; one writer per file. Agents may discuss this authorized workflow with each other.
- A usage-limit failure is an incomplete agent task, not an approval. Report it; the primary agent may continue authorized work.
- User approves material product choices and production-changing actions.
- Current authorization: read-only operational checks, local test-environment repair, status-document updates and bounded AI generation failure diagnosis/response-handling fixes.
- Current prohibition: no commit, push, actual deploy, scheduler ownership/config changes or actual Threads test publication in this tranche.
- Main pushes may trigger Cloudflare Workers Builds. Explain that production effect before requesting push approval.

## Completed application checkpoint

bf89457d1f35583023e56f15049336f2a9d0df8b — feat: add learning evidence consumer.

General scoped AUTO consumer implementation, tests and independent final review are complete; commit/push were separately approved and performed. Production bundle equality was verified on 2026-10-08. Actual legacy cron learning use is NOT established: its missing explicit identity scope prevents the consumer from running.

## Current maintenance tranche

| Task | Owner | State |
|---|---|---|
| Production/bundle/config comparison | Primary | Completed; see PROJECT_STATUS.md for verification date |
| Bounded operational history inspection | Primary | Refreshed 2026-10-09 14:42 KST; latest run completed, intermittent AI failures and legacy scope gap remain |
| media-batch local Node fixture repair | repair_test_runtime | Implemented, focused test passed; primary reviewed diff |
| Full offline regression suite | Primary | 201/201 passed including new response regressions; dry-run build passed |
| Current status and handoff documentation | Primary | Updated locally; not committed |
| Independent final review | ai_response_final_review | APPROVED; independently reran 201/201 tests |
| Commit/main push | Primary after user approval | Not authorized yet; main push may auto-deploy |

Owned files: primary edits PROJECT_STATUS.md, WORKSTREAMS.md, src/services/ai.js and src/services/ai-response.test.js; test repair edited src/services/media-batch.test.js only. No dependency, model, prompt, schema or scheduler changes.

AI failure investigation: all 11 inspected failures contain invalid JSON, no application-side truncation found. Primary completed a local completed/refusal/incomplete response gate plus safe metadata diagnostics and synthetic regressions after implementation agent usage exhaustion. Independent final reviewer ai_response_final_review approved the patch and verified 201/201 tests. Upstream generation failures are not proven resolved; segmented/multiple final output is intentionally rejected, and no live-provider validation was performed.

Independent consumer reviewer consumer_final_review completed APPROVED before commit. Several older implementation/planning/deployment-audit agents exhausted usage; they are not active work owners. Do not interpret their old summaries as current project state.

## Next proposed work (not yet implementation authorization)

1. Diagnose ai_generation_failed / invalid JSON response handling using safe, bounded failure evidence.
2. Design a trusted scope bridge for the active legacy General AUTO path. Keep manual/preview/Commerce excluded; do not remove identity gates simply to make signals appear.
3. Decide minimal signal-use/omission observability and content-quality evaluation.
4. Translate content/commerce operation into measurable business outcomes; revenue improvement remains unverified.

Runtime scheduler ownership cutover, live posting, Commerce consumer integration and external publisher expansion each require their own scope/decision. The current priority is reliable publishing and verified learning use, not additional platform breadth.

## Shared repository procedure

- On resumption: git status --short --branch; git log -3 --oneline; read PROJECT_STATUS.md and this file.
- Inspect existing edits and agree file ownership before modifying; avoid overlapping writers.
- Run relevant tests, JavaScript syntax checks and git diff --check. Review complete local diffs without printing full source to the user.
- Report changed files, tests, limitations and production effect before requesting commit/push.
- Stage only the approved files. Never include .gitignore, .wrangler/, diagnostic-reply-container.js, maintenance-mark-log-deleted.js or node_modules/.
- Do not reset, clean, amend, force-push or discard unrelated work.
- Verify production version rather than assuming no deployment occurred because this thread did not call deploy.
