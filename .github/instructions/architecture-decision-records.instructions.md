---
description: When making large, architectural, or technical trade-off decisions, scan docs/adr and update or propose a new ADR before considering the work done.
applyTo: '**/*'
---

# Architecture Decision Records — keep in sync

When a change is **large**, **architectural**, or records a **technical trade-off** (why X instead of Y), treat ADRs as part of the deliverable — not an optional follow-up.

In this repository, that means preserving the current Electron architecture while documenting choices that affect the boundaries between main, preload, and renderer, or that change how UI and shared logic are organized.

Canonical skill: [architecture-decision-records](../../.agents/skills/architecture-decision-records/SKILL.md) · Index: [docs/adr/README.md](../../docs/adr/README.md) · Template: [docs/adr/template.md](../../docs/adr/template.md)

## When this applies

Trigger on any of:

- Changing the responsibility boundaries between [src/main](../../src/main), [src/preload](../../src/preload), and [src/renderer](../../src/renderer)
- Introducing or changing IPC, Electron lifecycle behavior, or local server integration
- Moving or renaming the core architecture folders or creating a new top-level layer that changes the app structure
- Changing the placement rules for renderer code under [src/renderer/src/app](../../src/renderer/src/app), [src/renderer/src/pages](../../src/renderer/src/pages), and [src/renderer/src/shared](../../src/renderer/src/shared)
- Introducing a shared abstraction that affects multiple pages, such as API helpers, query client conventions, or reusable UI patterns
- Changing conventions already described in [docs/architecture/FEATURE-SLICED-DESIGN.md](../../docs/architecture/FEATURE-SLICED-DESIGN.md) or [docs/ui/COMPOUND_COMPONENTS.md](../../docs/ui/COMPOUND_COMPONENTS.md)
- Explicit signals such as “we decided…”, “use X instead of Y”, “record as ADR”, or “trade-off is…”

**Skip** (no ADR scan/update required) when the work only:

- Applies a convention already documented in the repo docs, skills, or existing ADRs
- Is a trivial edit such as a small UI tweak, copy change, formatting cleanup, or one-off bugfix without a cross-cutting architectural impact
- Refactors code locally without changing ownership, boundaries, or the public structure of the app

Re-enter this workflow only if the task **changes**, **supersedes**, or **introduces an exception** to the current architecture conventions.

## Required workflow

1. **Scan** [docs/adr/README.md](../../docs/adr/README.md) and the related architecture docs before changing a structural decision.
2. **Review** the current architecture shape: [src/main](../../src/main) for Electron bootstrap and server lifecycle, [src/preload](../../src/preload) for the bridge, and [src/renderer/src](../../src/renderer/src) for the React shell, route modules, and shared UI/helpers.
3. **Decide**:
   - **Update** an existing ADR if the same decision evolved.
   - **Draft** a new ADR if no record covers the choice (use the next number in the sequence and follow the template in English).
   - **No ADR** only if the change is truly local and does not introduce a lasting architectural alternative.
4. **Confirm with the user** before creating a new ADR file when the decision is still under discussion.
5. **Index** — append or adjust the row in [docs/adr/README.md](../../docs/adr/README.md) whenever an ADR is added or changed.
6. **Status** — use `proposed` while under discussion, `accepted` when in effect, and `deprecated` or `superseded by ADR-NNNN` when replaced.

## Project-specific guidance

- Keep the base Electron boundaries intact: main-process concerns stay in [src/main](../../src/main), IPC exposure stays in [src/preload](../../src/preload), and UI stays in [src/renderer](../../src/renderer).
- Keep page-level UI close to the owning page under [src/renderer/src/pages](../../src/renderer/src/pages).
- Move reusable UI and helpers to [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui), [src/renderer/src/shared/lib](../../src/renderer/src/shared/lib), or [src/renderer/src/shared/api](../../src/renderer/src/shared/api) when multiple screens need them.
- Prefer a simple and predictable structure over introducing a large new abstraction layer.
- Prefer compound or composer components when a UI surface has coordinated parts and shared state.

## Do / don’t

- ✅ Record trade-offs about architecture boundaries, ownership, IPC, routing, shared abstractions, and renderer organization.
- ✅ Prefer updating an existing ADR over creating overlapping records.
- ❌ Do not invent ADRs for style-only changes, single-file refactors, or minor bug fixes.
- ❌ Do not move logic across main, preload, and renderer just to follow a personal pattern.
- ❌ Do not introduce a large new folder structure unless the app clearly outgrows the current layout.

## Quick check before finishing the task

```
[ ] Scanned docs/adr/README.md and the relevant architecture docs
[ ] Updated an existing ADR or drafted/confirmed a new one when needed
[ ] Index row updated if an ADR file changed
```
