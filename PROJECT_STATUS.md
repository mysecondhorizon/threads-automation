# Second Horizon Project Status

Updated: 2026-10-09 KST. This checkpoint replaces the outdated 4eceeb09-era status; earlier milestone details remain in Git history.

## Product goal

Build an operator-controlled Threads business: publish credible everyday/experience-based content, grow audience trust, connect relevant product opportunities naturally, and validate sustainable affiliate revenue (including Coupang Partners). Automation reduces operating effort; descriptive learning informs content. Feature completion is not evidence of audience growth, conversion, revenue, or causal improvement.

## Repository and deployment

- Repository: mysecondhorizon/threads-automation; branch: main.
- Latest application checkpoint: bf89457d1f35583023e56f15049336f2a9d0df8b — feat: add learning evidence consumer.
- On 2026-10-08, production index.js matched a Wrangler 4.131.2 dry-run build of bf89457 byte-for-byte (1,136,739 bytes).
- Verified production version: 6f83288f-e4f1-430d-a0fa-ccaf8b0ece64, serving 100%, deployed 2026-10-07 18:43:47 KST.
- The established deployment path is GitHub main -> Cloudflare Workers Builds. Treat any push to main as potentially production-changing. Metadata says wrangler; the exact actor/build trigger for that deployment was not verified.
- Do not run an actual local deploy, change scheduler ownership, or publish test posts without explicit user authorization.
- Prior version candidate: 6570c41c-d095-4b12-a3f6-229872edb76a (2026-10-06 21:49:53 KST). Existence/binding names verified; rollback execution and state compatibility are not validated.

## Implemented capabilities

| Area | Code state | Verification boundary |
|---|---|---|
| Account/workspace | Connected-account credentials and workspace-scoped write, media, prompts, activity and schedule paths | Not every workspace/account's production activation has been verified |
| General AUTO | Topic/experience context, provenance, image/video selection and publishing paths | Latest inspected run completed; intermittent AI failures remain; see operations below |
| Commerce | Product opportunities, discovery, asset matching, Coupang candidates, generation, manual publishing and performance linkage | Revenue/conversion results not verified |
| Legacy product/review | Old product/review domain removed; Commerce supersedes it | Do not restore old 20:30 Product Review assumptions |
| L02-L07 | Scoped collection hardening, D1/D3 snapshots, dimensions, account baselines, attribution and aggregation | Observational, bounded discovery and KV consistency limits remain |
| L08 policy | Sufficient and consistent descriptive evidence evaluation | Not causal evidence or statistical significance |
| L08 consumer | Exact scoped General cron AUTO integration, max 5 signals, 4096-byte serialized advisory, fixed safety guidance | Deployed code does not mean active legacy cron consumes it |

L08 consumer excludes insufficient/inconsistent/unavailable evidence and omits guidance on failures. General and Commerce stay separate. Manual/preview/Commerce runtime integration, content ranking/selection changes and automatic prompt learning are out of scope. analytics.js is unchanged.

## Actual operations: last successful read on 2026-10-09 14:42 KST

- Scheduler ownership constant remains LEGACY_ACTIVE_RUNTIME_PREPARING. Runtime scheduler code exists but global ownership has not switched.
- Legacy scheduled execution calls the engine without workspace/executionContext. The consumer requires trusted workspace/account/user scope, so the inspected legacy path omits learning guidance intentionally.
- No stored consumer-usage diagnostic exists. Do not claim actual signal use from code deployment alone.
- Remote cron configuration: KST 08:10, 11:30, 14:30, 18:40; matches wrangler.jsonc. This is not proof of successful posting.
- Stored schedule history (50 records, 2026-09-26 11:30 KST through 2026-10-09 14:31 KST): 39 completed, 11 failed; none has workspace scope. All 11 failure codes were ai_generation_failed. This bounded history is not a lifetime reliability measure.
- Latest inspected execution: started 2026-10-09 14:32:16 KST, completed, no workspace scope. The issue is intermittent, not a claim that every current run fails.
- A previously inspected failure (2026-10-08 08:11:59 through 08:25:05 KST) had outputText in its error details, matching the invalid-JSON branch in ai.js. Exact response content/provider root cause was not inspected; avoid attributing all failures to that branch or to the new consumer.
- Recent preceding runs had published:true in application history. Independent Threads-side verification was not performed.

## Validation

- 2026-10-08: production dry-run build passed; container rollout disabled. No container image build/runtime validation.
- 2026-10-09: full src Node test suite passed 191/191 on Node 24.19.0 after test-only media-batch fixture repair.
- After local AI response hardening: 201/201 tests passed; JavaScript syntax, diff whitespace check and Wrangler dry-run build passed. This newer build has not been deployed.
- Repair isolates the Workers-only @cloudflare/containers import using node:module registerHooks; unexpected container calls fail. It also supplies missing topics:[] in a normalized-input fixture.
- This verifies image upload/metadata and video metadata behavior, not actual container normalization.
- Production bindings and secret names were present; secret values/validity were not tested. OPENAI_MODEL=gpt-5.6-luna; compatibility_date=2026-08-02.
- Consumer independently reviewed APPROVED before bf89457 commit, including serialized byte-limit repair.

## Next priorities

1. Separately authorize commit/main push of the reviewed AI response validation/diagnostics patch if desired; main push may auto-deploy. Provider root cause remains unresolved until status/usage evidence is available.
2. Design the minimal trusted identity bridge for the active legacy General AUTO path, or separately approve runtime ownership cutover. Never infer user identity from post history or silently switch scheduler ownership.
3. Make actual advisory use/omission measurable with minimal diagnostics if approved; do not log post bodies, private experience text or credentials.
4. Evaluate generated-content quality, diversity and factuality before expanding consumer scope.
5. Define business measurement: operating effort, publishing success, audience engagement, product/affiliate conversion and revenue. No achieved revenue or KPI target is claimed here.

Potential later work: Commerce learning integration, external research with explicit provenance, other publisher platforms, legacy admin migration, KV scalability and stronger deduplication. These are options, not active assignments.

## Current working changes and safety

Reviewed, pending commit authorization: PROJECT_STATUS.md, WORKSTREAMS.md, src/services/media-batch.test.js, src/services/ai.js and new src/services/ai-response.test.js. No commit/push/deploy/actual post was authorized for these changes.

### AI response investigation and local hardening

The 11 failures in the inspected 50-record history all contained unparsable outputText (434-532 characters), with JSON parsing failing at end-of-input; none was a fenced JSON response. Three structurally inspected samples had one closed draft object inside an unclosed drafts array/root. Content was not copied into fixtures or documentation. The application error logger and KV writer do not truncate these details; the request already requires exactly three drafts. Original response status/incomplete_details/usage were not retained, so provider truncation, refusal, or other upstream causes cannot be established retrospectively.

The uncommitted patch changes generateThreadsDrafts only: require completed response/message status, reject refusals/incomplete/ambiguous output, omit commentary from final JSON, and store bounded category/status/reason/token counts instead of raw response/draft text for errors at this boundary. It preserves the model, prompt, strict schema, three-draft requirement and downstream validation. It adds no retry, partial-JSON repair, scheduler change or live API call. The shared requestOpenAiJson path is unchanged.

Diagnostics persist through the existing raw execution/log path; the normalized dashboard currently does not expose these new fields. This is validation/diagnostic hardening, not a claim that the production failure rate has been fixed. Independent final reviewer ai_response_final_review approved the five-file tranche and reran all 201 tests successfully. Compatibility limitation: one final message containing one output_text part is accepted; segmented/multiple output is rejected safely. No live-provider validation was performed.

References: https://developers.openai.com/api/docs/guides/structured-outputs (completed/incomplete/refusal handling).

Never stage protected untracked items: .gitignore, .wrangler/, diagnostic-reply-container.js, maintenance-mark-log-deleted.js, node_modules/.
Preserve existing TEXT/first-comment behavior, validated publishing boundaries, credential isolation and provenance. Never reset/clean another worker's changes.
