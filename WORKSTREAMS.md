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

**R13A — Shared Operator Prompt Scope**

### Account B

PM / coordination account plus parallel worker:

**Codex B**

Current parallel workstream:

**UI-02 — Products UI/UX Cleanup — COMPLETED / MERGED TO MAIN**

The two ChatGPT accounts do not share conversation memory.

Synchronization happens through:

1. GitHub `origin/main`
2. `PROJECT_STATUS.md`
3. `WORKSTREAMS.md`

---

## 2. Global Rules

Before beginning any workstream:

```bash
git status
git fetch origin
git log -5 --oneline
git rev-parse HEAD
```

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

**ACTIVE / CONTINUE EXISTING WORK**

Task:

**R13A — Shared Operator Prompt Scope**

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

## 6. Suggested R13A Tranches

To reduce Codex session-limit risk, split work if needed.

### R13A-1

Shared effective prompt loader.

Goal:

one normalized loader with exact R7 fallback semantics.

Suggested ownership:

- prompt profile service/helper
- focused prompt service tests

Checkpoint after completion.

### R13A-2

General AUTO integration.

Goal:

General AUTO uses the shared effective profile.

Do not change publisher, media, format, scheduler behavior.

Checkpoint after completion.

### R13A-3

Product Review integration.

Goal:

Product Review uses shared profile for writing style while code-owned link/disclosure rules remain authoritative.

Checkpoint after completion.

### R13A-4

Prompt UI/API scope note + full regression.

Goal:

Operator sees that prompt settings apply to:

- direct AI writing
- auto posting
- product review

No heavy UI redesign.

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

**COMPLETED / MERGED TO MAIN**

Task:

**UI-02 — Products UI/UX Cleanup — COMPLETED / MERGED TO MAIN**

Merged commit:

`393940ae2b3f9aee8b701428ad9c9b147833c72b`

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

R11D merged first in commit:

`5ca5511fe4d12beae988f01c42826ec115674bec`

Codex A must fetch/pull and incorporate the latest `origin/main` before continuing R13A.

Before R13A commit approval, rerun relevant regression tests after incorporating this checkpoint.

At minimum verify:

- latest `origin/main` incorporated;
- no unexpected conflict;
- relevant regression still passes.

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
git fetch origin
git status
git log -5 --oneline
```

Read:

- `PROJECT_STATUS.md`
- `WORKSTREAMS.md`

Then continue only the workstream assigned to that account.

---

## 18. Current Shared Checkpoint

Latest confirmed main:

`393940ae2b3f9aee8b701428ad9c9b147833c72b`

Before relying on this hash, verify `origin/main`.

Update this section after each approved merged checkpoint.

---

## 19. Next Handoff

Current intended parallel execution:

### Codex A

Fetch/pull latest `origin/main`, incorporate the UI-02 checkpoint, then continue R13A.

Prefer small checkpoints.

### Codex B

AWAITING PM ASSIGNMENT.

The PM account should review both completion reports and decide merge order.

---

## 20. Pending PM Action Items

- **UI-01 — `/app/prompts` UI/UX cleanup**
  - fix broken/awkward alignment
  - clean up page hierarchy/layout and responsive behavior
  - preserve functional prompt semantics
- **PRODUCT-01 — Product ↔ Product Media relationship decision**
  - product media currently uses `sourceType: product`
  - media is not directly tied to an individual Product record
  - decide whether direct per-product association is needed before implementation

These are pending PM decisions and are not assigned to Codex B.
