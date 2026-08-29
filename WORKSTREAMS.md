# Second Horizon Workstreams

> Shared coordination file for Codex A and Codex B.
> This file prevents file collisions and records active ownership.
> GitHub `main` is the common handoff point between accounts.

---

## 1. Operating Model

There are two independent ChatGPT/Codex accounts.

### Account A

Primary worker:

**Codex A**

Current workstream:

**WAITING FOR NEXT TASK**

### Account B

PM / coordination account plus parallel worker:

**Codex B**

Current parallel workstream:

**WAITING FOR NEXT TASK**

The two ChatGPT accounts do not share conversation memory.

The workers share the same local repository and working tree. GitHub `origin/main`, `PROJECT_STATUS.md`, and `WORKSTREAMS.md` remain the shared checkpoint for remote and cross-session coordination.

---

## 2. Global Rules

Before beginning any workstream:

```bash
git status
git log -3 --oneline
```

Remote synchronization is conditional: fetch/pull only when another machine or clone may have pushed, GitHub changed directly, `origin/main` may be ahead, or the PM explicitly requests it.

Confirm the working tree does not contain another worker's changes.

Do not delete, overwrite, or reset unknown work.

Avoid:

- `git reset --hard`
- `git clean`
- `git restore .`
- `git checkout -- .`

unless explicitly approved by the PM.

---

## 3. Commit Policy

Default development flow:

1. Agent/PM assigns bounded task.
2. Codex implements.
3. Codex runs tests.
4. Codex reports exact changed files.
5. Codex does NOT commit/push yet.
6. PM reviews.
7. PM issues separate commit/push instruction.
8. Commit becomes the new shared checkpoint.

Prefer frequent small checkpoints over one long uncommitted implementation.

---

## 4. Protected Untracked Files

Never include:

- `.gitignore`
- `.wrangler/`
- `diagnostic-reply-container.js`
- `maintenance-mark-log-deleted.js`

---

# WORKSTREAM A

## 5. Codex A Assignment

Status:

**WAITING FOR NEXT TASK**

Last completed task:

**R13A — Shared Operator Prompt Scope — COMPLETE / MERGED**

Merged application checkpoint: `84509f055ef4e49549c163e762cbcb5819ca3836`

### Objective

Make the existing operator prompt profile apply consistently to:

- Manual AI generation
- General AUTO
- Product Review

using the existing:

`operator_prompt_profile:v1`

### Operator-editable sections

- `identityWriting`
- `generalWritingPolicy`
- `contentAndFormatPreferences`
- `productWritingGuidance`
- `analyticsWritingGuidance`

### Code-owned sections

Must remain authoritative:

- validation
- output
- post-format enforcement
- `recent_signature_repeated`
- factual verification
- forbidden claims
- Product Review disclosure/link safety
- provider/schema requirements

---

## 6. Completed R13A Checkpoints

R13A is complete. The entries below are retained as implementation history.

### R13A-1

Shared effective prompt injection — **COMPLETE**.

ARCH-01-I2A established the workspace-aware loader; R13A-1 injects it once at the shared regenerated-generation boundary.

### R13A-2

Manual and General AUTO integration — **COMPLETE**.

Manual `/app/write`, General AUTO, and General AUTO preview receive the effective profile while publisher, media, format, and scheduler behavior remain unchanged.

### R13A-3

Product Review integration — **COMPLETE**.

Product Review candidate generation receives the shared profile while code-owned link/disclosure rules remain authoritative.

### R13A-4

Prompt UI scope note and regression — **COMPLETE**.

`/app/prompts` explains the scope and protected rules; focused Manual, General AUTO, Product Review, and prompt-profile regressions passed.

---

## 7. Codex A Preferred File Ownership

Codex A should primarily own prompt-generation / prompt-profile related files.

Likely areas:

- prompt profile service
- prompt composition helpers
- General AUTO generation prompt integration
- Product Review prompt composition
- `/api/prompts` only if needed
- `/app/prompts` only if needed
- focused prompt tests

### Codex A should avoid

Files being actively changed by Codex B for R11D, especially:

- `/app/write` target selector UI
- write client target selection logic
- target-app UI tests

If both tasks require the same file:

STOP.

Do not modify concurrently.

Merge one workstream first, sync the other, then continue.

---

# WORKSTREAM B

## 8. Codex B Assignment

Status:

**WAITING FOR NEXT TASK**

Last completed task:

**ARCH-01-I2A — Workspace-Aware Prompt Profile Storage — COMPLETE / MERGED**

Merged application checkpoint:

`c81e037a138ef454b50be74f330153413f637bf7`

### Completed checkpoints

- UI-02 — Products UI/UX Cleanup merged.
- PRODUCT-01-D decision complete / deferred.
- AUTO-PV1 read-only verification complete: **NOT VERIFIABLE**.
- MEDIA-02-D design verification complete.
- MEDIA-02-I merged: optional `experienceTags` / `experienceNote` upload hints.
- ADMIN-01-D legacy `/admin` retirement inventory analysis complete; no route was removed.

ARCH-01-I2A is complete. It preserves the Default Workspace legacy profile key and isolates non-default Workspace prompt profiles without migration.

### R11D completion

**COMPLETED / MERGED**

Commit: `7d6eea3`

The R11D detail below is retained as historical scope, not a current assignment.

### Completed verification checkpoint

**R11D-V — Target App Selection Integration Verification**

Completed with no code changes required. Verified target-app save/edit/publish boundaries, null compatibility, explicit invalid-target no-fallback behavior, and empty/unavailable registry fallback.

### Objective

Expose the existing Post `targetApp` concept in `/app/write`.

Use the existing:

`GET /api/apps`

and existing Post storage/API wherever possible.

---

## 9. R11D Required Behavior

For DRAFT / READY posts:

show:

`게시 대상`

Current functional option:

`Second Horizon Threads`

Future unsupported options may be visible only as:

- `WordPress — 준비 중`
- `Custom API — 준비 중`

They must not behave as working publishing destinations.

### Backward compatibility

Existing:

`targetApp = null`

must remain valid.

Publishing continues resolving null to:

`threads-primary`

Do not bulk migrate existing posts.

### PUBLISHED posts

Target app must be read-only.

Do not allow target changes after publication.

---

## 10. Codex B Preferred File Ownership

Codex B should primarily own:

- `/app/write` page UI
- `/app/write` browser/client logic
- target selection presentation
- Post API/storage validation only if targetApp support is genuinely missing
- R11D-focused tests

### Codex B should avoid

Prompt-generation files owned by R13A.

Do not modify:

- prompt composition
- General AUTO prompt generation
- Product Review prompt generation
- `/app/prompts`

unless the PM explicitly serializes the work.

---

## 11. R11D Out of Scope

Do not implement:

- WordPress publishing
- Custom API publishing
- credentials UI
- OAuth redesign
- multi-destination publishing
- General AUTO target-app selection
- Product Review publisher
- scheduler changes
- post-format changes
- Publisher Adapter redesign

---

# COLLISION MANAGEMENT

## 12. Collision Rule

If Codex A and Codex B need the same file:

Do not resolve by both editing and hoping Git merges cleanly.

Instead:

1. identify which workstream has higher dependency priority;
2. pause the other;
3. complete/review/commit/push the first;
4. other account updates from new `origin/main`;
5. rerun relevant regression;
6. resume.

File-level serialization is preferred over manual conflict resolution.

---

## 13. Merge Order

R11D is merged in commit:

`7d6eea3`

ARCH-01-I2A merged in `c81e037a138ef454b50be74f330153413f637bf7` before R13A resumed. R13A then merged in `4840261f3b3343cf1055bdc652e50b0df6a3e2d4` and `84509f055ef4e49549c163e762cbcb5819ca3836`.

Both workstreams are complete. Future work must still use the shared working-tree collision checks and rerun relevant regression before commit approval.

---

## 14. Handoff Report Format

Every Codex completion report should include:

1. task / tranche name
2. starting HEAD
3. exact changed files
4. implemented behavior
5. intentionally unchanged behavior
6. tests run
7. test results
8. `git diff --check`
9. production safety confirmations
10. final `git status`
11. commit/push status

After approved push also report:

- commit hash
- push range
- final clean/expected-untracked state

---

## 15. Production Safety Shared by Both Workstreams

Current real scheduler owner:

`LEGACY_ACTIVE_RUNTIME_PREPARING`

Runtime Scheduler execution:

`false`

Do not alter:

- scheduler ownership
- ScheduleCoordinator
- runtime alarm
- Cron expressions
- `wrangler.jsonc`

unless explicitly assigned.

Do not manually:

- execute General AUTO
- generate Product Review
- publish Threads content

unless a PM task explicitly requires it.

---

## 16. Current Protected Production Behavior

Preserve:

- successful 2026-08-29 11:30 KST General AUTO path
- General AUTO TEXT/IMAGE adapter route
- General AUTO VIDEO exclusion
- exact-repeat format protection
- Product Review candidate-only workflow
- R8 operator duplicate-publish protection
- app registry credential separation
- scheduler observability / stale receipt recovery

---

## 17. Synchronization Checklist

Whenever switching accounts:

### Leaving current account

Ensure latest completed tranche is:

- reviewed;
- committed;
- pushed;
- reflected in these status files when appropriate.

### Entering other account

Run:

```bash
git status
git log -3 --oneline
```

Do not fetch/pull automatically when switching accounts in this shared local repository. Use remote synchronization only when another machine or clone may have pushed, GitHub changed directly, `origin/main` may be ahead, or the PM explicitly requests it.

Read:

- `PROJECT_STATUS.md`
- `WORKSTREAMS.md`

Then continue only the workstream assigned to that account.

---

## 18. Current Shared Checkpoint

Latest shared repository checkpoint before this documentation commit:

`84509f055ef4e49549c163e762cbcb5819ca3836`

Latest application implementation checkpoint:

`84509f055ef4e49549c163e762cbcb5819ca3836` — R13A shared prompt scope complete.

Before relying on this hash, use the default local switch check; verify `origin/main` only when remote synchronization is required.

Update this section after each approved merged checkpoint.

---

## 19. Next Handoff

Current handoff status:

### Codex A

WAITING FOR NEXT TASK. R13A is complete.

### Codex B

WAITING FOR NEXT TASK. ARCH-01-I2A is complete.

---

## 20. Pending PM Action Items

- **UI-01 — `/app/prompts` UI/UX cleanup**
  - fix broken/awkward alignment
  - clean up page hierarchy/layout and responsive behavior
  - preserve functional prompt semantics
- **MEDIA-02-AI — provenance-labeled AI generation context for user experience hints**
  - preserve `USER_EXPERIENCE` as distinct from observation and fact context
- **MEDIA-02-R — optional future external research use**
  - preserve `USER_EXPERIENCE` vs `EXTERNAL_FACT` distinction
- **ARCH-01-D — Multi-Account / Multi-Platform Storage & Scope Design Verification**
  - Priority: **HIGH**
  - verify `User → Workspace → Connected Account` model and audit current storage/KV scope
  - no implementation or migration in this tranche

These are pending PM decisions and are not assigned to Codex B.
