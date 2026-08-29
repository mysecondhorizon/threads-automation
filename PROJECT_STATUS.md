# Second Horizon Project Status

> This file is the shared project checkpoint between ChatGPT/Codex accounts.
> GitHub `main` is the source of truth.
> Update this file whenever a workstream is merged to `main`.

---

## 1. Repository

Repository:

`mysecondhorizon/threads-automation`

Production branch:

`main`

Production deployment:

`GitHub main -> Cloudflare Workers Builds`

Local production deployment is prohibited unless explicitly approved.

Do not run:

`wrangler deploy`

---

## 2. Repository and Application Checkpoints

Latest shared repository checkpoint before this documentation commit:

`d3282b085cfca1a7221cc7c0dc0b31d820c1d247`

Latest application implementation checkpoint:

`d3282b085cfca1a7221cc7c0dc0b31d820c1d247`

**ARCH-01-I2B — Workspace-Aware Products Storage Foundation complete**

Historical milestone reference:

**R11D — Target App Selection UI Foundation**

Default local switch check:

```bash
git status
git log -3 --oneline
```

Fetch/pull only when another machine or clone may have pushed, GitHub changed directly, `origin/main` may be ahead, or the PM explicitly requests remote synchronization.

---

## 3. Current Production State

### Scheduler ownership

Current real production owner:

`LEGACY_ACTIVE_RUNTIME_PREPARING`

Runtime Scheduler business execution:

`false`

Runtime Scheduler remains in preparation / suppressed mode.

Do not perform R10C2 or switch scheduler ownership without explicit PM approval.

### Current production schedules — Asia/Seoul

General AUTO:

- 08:10
- 11:30
- 14:30
- 18:40

Product Review candidate generation:

- 20:30

Existing Cloudflare Cron expressions:

- `10 23 * * *`
- `30 2 * * *`
- `30 5 * * *`
- `40 9 * * *`
- `30 11 * * *`

`wrangler.jsonc` must remain unchanged unless a specifically approved scheduler migration task requires otherwise.

---

## 4. Production Verification

### General AUTO format incident

Previous production failures:

`post_format_validation_failed`

Stage:

`similarity_validation`

Reason:

`recent_signature_repeated`

Root cause:

- format feasibility selection considered a shorter recent-pattern window;
- final exact-signature validation considered a longer recent-signature window;
- exact-repeat failure did not force target reselection;
- regeneration could retry the same effective target/pattern.

Fix now protected:

- `recent_signature_repeated` remains strict;
- exact repeat triggers target reselection;
- failed target/pattern is excluded where possible;
- exact-window constraints are considered during selection;
- Product Review uses the shared safe format-diversity policy;
- exhausted format space fails closed rather than publishing repetitive content.

### Confirmed production success

On 2026-08-29 at 11:30 KST:

**General AUTO — SUCCESS / 게시 완료**

This is the first confirmed successful production General AUTO run after the format-diversity fix.

Do not weaken or remove the current diversity safeguards without explicit PM approval.

### AUTO-PV1 — Additional General AUTO Production Verification

- Read-only verification was attempted after the confirmed 2026-08-29 11:30 KST success.
- 14:30 KST / later run evidence could not be retrieved.
- Result: **NOT VERIFIABLE**.
- No production write or manual trigger was performed.
- Code-level scheduler owner remains `LEGACY_ACTIVE_RUNTIME_PREPARING` and runtime execution remains disabled by the current ownership mode.
- Do not claim runtime diversity safeguards were re-verified.

---

## 5. Major Completed Milestones

### R1 — App Shell
Complete.

### R2 — Post Storage Model
Complete.

### R3 — `/app/write`
Complete first version.

### R4 — Topic + AI Draft
Complete.

### R5 — `/app/media`
Complete first version.

### R6 — `/app/products`
Complete first version.

### R7 — `/app/prompts`
Complete.

Prompt Profile scope is complete across Manual AI generation, General AUTO, General AUTO preview, and Product Review candidate generation.

### ARCH-01-I2A — Workspace-Aware Prompt Profile Storage
**COMPLETE / MERGED**

- Omitted or null `workspaceId` resolves to `DEFAULT_WORKSPACE_ID`.
- The Default Workspace retains the legacy `operator_prompt_profile:v1` profile.
- Non-default Workspaces use deterministic isolated prompt-profile storage.
- A missing non-default profile receives built-in R7 defaults and never inherits customized Default Workspace data.
- No bulk migration was performed.

### ARCH-01-I2B — Workspace-Aware Products Storage Foundation
**COMPLETE / MERGED**

- The physical KV store remains `content_products`.
- Product records now support service-owned `workspaceId`; omitted/null scope resolves to `DEFAULT_WORKSPACE_ID`.
- Legacy records without `workspaceId` remain Default Workspace compatible and are lazily normalized only when mutated.
- Reads, CRUD, product-key resolution, and batch upserts are Workspace-scoped.
- The same `productKey` may exist in different Workspaces; cross-Workspace ID mutation is blocked.
- Mutations preserve raw records belonging to other Workspaces, and the capacity remains 50 per Workspace.
- No bulk migration and no route, UI, or runtime Workspace propagation were introduced.

### R13A — Shared Operator Prompt Scope
**COMPLETE / MERGED**

Prompt Profile now applies to:

- `/app/write` Manual AI generation
- General AUTO
- General AUTO preview
- Product Review candidate generation

Code-owned validation, safety/factual constraints, output/schema rules, post-format diversity/repetition protection, and Product Review disclosure/link rules remain protected. Legacy `/admin/ai/draft` remains outside R13A scope.

### ADMIN-01-D — Legacy `/admin` Retirement Inventory
**ANALYSIS COMPLETE**

- Auth/OAuth/token lifecycle remains required.
- `/app` does not yet replace Product Review, Content Pool, AUTO preview/review-publish, or logs/dashboard/insights.
- Low-risk future retirement candidates were identified; no legacy route was removed.
- Actual retirement is deferred for a separately approved follow-up after prompt-scope completion.

### R8 — Controlled Threads Publish
Complete.

### R9 — Product Media
Complete.

### R10 — Scheduler Program

Completed:

- Runtime Schedule Coordinator
- Durable Object production hotfix
- Schedule operations view
- Runtime ownership attempt
- rollback to legacy ownership
- alarm observability
- alarm reconcile
- stale receipt recovery
- safe failure display
- real production next-run display
- production schedule overview

Current status:

Runtime infrastructure is healthy but not production owner.

### R11A — App Connection Registry
Complete.

### R11B — Publisher Adapter Foundation
Complete.

### R11C — General AUTO Publisher Adapter Migration
Complete.

### R11D — Target App Selection UI Foundation
Complete.

- Added target-app selection to `/app/write`.
- Uses the App Registry through `GET /api/apps`.
- `threads-primary` is the only currently proven selectable publish destination.
- WordPress and Custom API remain preparing/nonfunctional.
- `targetApp = null` remains backward compatible.
- Explicit invalid targets do not silently fall back to Threads.
- Published post targets are read-only.
- No Workspace implementation was added.

### R11D-V — Target App Selection Integration Verification
Complete.

- Verified `targetApp` save, edit, and publish boundaries.
- Verified null compatibility and explicit invalid-target no-fallback behavior.
- Verified built-in fallback when the app registry is unavailable or empty.
- No code changes were required.

### UI-02 — Products UI/UX Cleanup
Complete.

- Improved `/app/products` operator layout and information hierarchy.
- Reorganized product create/edit and product media areas for clearer operation.
- Added clearer state badges, feedback, responsive layout, and product-media presentation.
- Product API/storage semantics were not changed.
- Product Media remains `sourceType: product` and is not directly associated with an individual Product record.

### PRODUCT-01 — Product ↔ Product Media Relationship Decision
Decision complete / DEFERRED.

- Current Product Review is text-only.
- Direct per-product image association is not required now.
- Existing nullable `productId` capability reduces future migration risk.
- Revisit only when an actual Product Review/image publishing consumer exists.

### MEDIA-02-D — User Experience Media Hints Design Verification
Complete.

- Inspected existing tags/description provenance.
- Decision: do not reuse legacy/vision tags as user-experience provenance.
- Selected a small model/API extension.

### MEDIA-02-I — User Experience Media Hints
Complete.

- Media records now support optional `experienceTags` and `experienceNote`.
- These fields represent `USER_EXPERIENCE` context.
- General Media and Product Media uploads support batch-level optional hints.
- Image/video media model compatibility is preserved and existing records require no migration.
- Existing `tags`, `description`, and `altText` semantics remain unchanged.
- AI generation/research consumption is **not** implemented yet.

---

## 6. Current Publishing Architecture

### Operator Post

`Stored Post`
→ `Publish Service`
→ `App Registry`
→ `Publisher Resolver`
→ `Threads Publisher Adapter`
→ existing Threads domain services

### General AUTO

General AUTO uses the same shared Publisher Service / Adapter architecture.

Supported:

- TEXT
- IMAGE

General AUTO VIDEO remains intentionally disabled.

### Product Review

Product Review remains candidate-only.

It must not automatically publish externally.

---

## 7. App Registry

KV:

`operator_apps:v1`

Built-in Threads app:

- id: `threads-primary`
- name: `Second Horizon Threads`
- type: `THREADS`

Registry contains metadata/configuration only.

Do not store credentials in `operator_apps:v1`.

Existing Threads authentication remains in the existing `threads_auth` storage.

Current functional publisher:

- THREADS

Future only / not functional:

- WORDPRESS
- CUSTOM_API

Do not present WordPress or Custom API as working integrations until explicitly implemented.

---

## 8. Prompt Profile

KV:

`operator_prompt_profile:v1`

Workspace storage compatibility:

- Omitted/null workspace ID and `DEFAULT_WORKSPACE_ID` use the legacy key above.
- Non-default Workspaces use isolated deterministic scoped keys.
- Existing Default Workspace customization remains readable without migration.

Operator-editable sections:

- `identityWriting`
- `generalWritingPolicy`
- `contentAndFormatPreferences`
- `productWritingGuidance`
- `analyticsWritingGuidance`

Code-owned and not operator-editable:

- validation rules
- output rules
- post-format enforcement
- exact-repeat protection
- verified-facts constraints
- forbidden-claims constraints
- Current Topic factual safety
- Product Review disclosure/link placement rules
- provider/schema constraints

Operator prompt preferences must not override code-owned safety/validation rules.

---

## 9. Current Parallel Work

See `WORKSTREAMS.md` for live ownership.

Current workstream status:

### Codex A

**WAITING FOR NEXT TASK**

R13A is complete and merged in `84509f055ef4e49549c163e762cbcb5819ca3836`.

### Codex B

**WAITING FOR NEXT TASK**

ARCH-01-I2B is complete and merged in `d3282b085cfca1a7221cc7c0dc0b31d820c1d247`.

---

## 10. Existing Post Target Compatibility

Post model already includes:

`targetApp`

Backward compatibility:

`targetApp = null`

resolves to:

`threads-primary`

Explicit invalid targets must not silently fall back to Threads.

Existing posts do not require bulk migration.

---

## 11. Protected Behavior

Unless a task explicitly changes them, preserve:

- General AUTO daily posting limit
- 90-minute spacing guard
- TEXT/IMAGE AUTO publishing
- VIDEO AUTO exclusion
- media tracking
- Content Pool usage tracking
- first-comment behavior
- Threads authentication storage
- Publisher Adapter architecture
- `recent_signature_repeated` strict validation
- failed target/pattern exclusion
- Product Review candidate-only behavior
- Product Review valid-link/disclosure behavior
- legacy scheduler production ownership
- Runtime Scheduler business execution disabled

---

## 12. Known Remaining Product Gaps

Major remaining work includes:

- UI-01 `/app/prompts` UI/UX cleanup
  - broken/awkward alignment
  - page hierarchy/layout cleanup
  - responsive cleanup
  - functional prompt semantics must remain unchanged
- additional General AUTO production verification when evidence access becomes available
- MEDIA-02-AI — consume user experience hints as provenance-labeled AI generation context
- MEDIA-02-R — optional future external research use, preserving `USER_EXPERIENCE` vs `EXTERNAL_FACT` distinction
- Runtime Scheduler final production ownership cutover
- WordPress publisher
- Custom API publisher
- real external HTML publishing
- legacy `/admin` retirement/migration
- whole-collection KV scalability
- stronger global exactly-once guarantees
- optional future General AUTO video support only if explicitly approved

### ARCH-01 — Multi-Account / Multi-Platform Workspace Architecture

Priority: **HIGH**

Status: **FOUNDATION IN PROGRESS**

Architecture direction:

`User → Workspace → Connected Account`

- **User** is login identity only for small personal/family usage.
- **Workspace** has `ownerUserId` and is the brand, system, and business-data isolation unit.
- **Connected Account** represents an actual platform, account, or channel destination.

The current design does **not** require a Tenant abstraction, Membership, RBAC, invitations, an organization/team model, or shared Workspace infrastructure.

Principles:

- One User may access multiple Workspaces.
- One Workspace may contain multiple Connected Accounts.
- Same-platform multiple accounts must be supported.
- Future platforms include Threads, TikTok, YouTube Shorts, and future publisher platforms.

Data scope direction:

**SYSTEM**

- code-owned safety
- validation
- platform capability / shared runtime behavior

**WORKSPACE**

- Products
- Media
- base Prompt / Brand context
- user experience media hints
- other shared brand context

**CONNECTED_ACCOUNT**

- platform credentials
- account-specific publishing history
- account-specific schedules where applicable
- analytics
- account-specific preferences/context

Long-term AI context composition:

`SYSTEM → WORKSPACE → CONNECTED_ACCOUNT → CONTENT-SPECIFIC CONTEXT`

Architecture evolution direction:

- Keep and extend the existing `targetApp` concept where possible.
- Keep and extend the existing Publisher Resolver / Adapter architecture.
- Do not replace the publisher architecture wholesale.

Completed ARCH-01 checkpoints:

- ARCH-01-D
- ARCH-01-I1
- ARCH-01-I2-D
- ARCH-01-I2A
- ARCH-01-I2B-D
- ARCH-01-I2B

ARCH-01 now has compatibility and storage foundations only. User login, Workspace selection, and Connected Account activation are not current functionality.

#### ARCH-01-D — Multi-Account / Multi-Platform Storage & Scope Design Verification

Status: **COMPLETE / DESIGN VERIFIED**

Completed design verification determined the appropriate `SYSTEM`, `WORKSPACE`, and `CONNECTED_ACCOUNT` scopes without a migration or schema rollout in that tranche.

Review examples:

- Posts, Products, Media Library, Content Pool, Prompt Profile, App Registry
- `threads_auth`, schedules, execution/history records, analytics/context, diversity/recent-post history

Next direction:

- Media and Content Pool Workspace scope
- account-scoped credentials, history, and diversity
- simple User login and Workspace selection
- actual second Threads account activation

---

## 13. Files Never Included in Commits

Do not stage or commit:

- `.gitignore`
- `.wrangler/`
- `diagnostic-reply-container.js`
- `maintenance-mark-log-deleted.js`

Their presence as untracked files is expected.

---

## 14. Shared Account Handoff Protocol

ChatGPT account A and account B do not share conversation memory.

Therefore:

**GitHub `main` + this file + `WORKSTREAMS.md` are the synchronization layer.**

After a workstream is approved and merged:

1. push the code commit to `origin/main`;
2. update `PROJECT_STATUS.md`;
3. update `WORKSTREAMS.md`;
4. commit those status updates with the implementation or as a small follow-up checkpoint;
5. use the Shared Local Repository Rule below before switching workstreams.

Do not rely on copied chat history as the canonical project state.

---

## 15. Shared Local Repository Rule

Codex A and Codex B currently use the same local repository:

`C:\Users\cmy11\projects\threads-automation`

Account switching does not automatically require `git fetch` or `git pull`.
The default switch check is:

```bash
git status
git log -3 --oneline
```

This confirms the current HEAD, reveals another Codex's uncommitted work, and prevents file collisions. Use fetch/pull only when another machine or clone may have pushed, GitHub changed directly, `origin/main` may be ahead, or the PM explicitly requests remote synchronization.

Because both workers share one working tree, uncommitted changes are immediately visible. Never edit the same file concurrently, and never reset, restore, clean, pull, rebase, or checkout unknown work while another Codex has uncommitted changes.

---

## 16. Status Update Rules

When a milestone is merged, update at least:

- `Current Main`
- `Major Completed Milestones`
- `Current Parallel Work`
- `Known Remaining Product Gaps`
- production verification if relevant

Keep this file concise enough that a new PM conversation can recover project state quickly.
