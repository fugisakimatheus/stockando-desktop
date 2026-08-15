---
inclusion: manual
---

# Architecture Decision Records

Keep ADRs in sync whenever a change is large, architectural, or records a technical trade-off.

## When This Applies

Create or update an ADR when:

- Changing responsibility boundaries between `src/main`, `src/preload`, and `src/renderer`
- Introducing or changing IPC, Electron lifecycle behavior, or local server integration
- Moving or renaming core architecture folders or creating a new top-level layer
- Changing placement rules for renderer code under `src/renderer/src/app`, `src/renderer/src/pages`, or `src/renderer/src/shared`
- Introducing a shared abstraction that affects multiple pages (API helpers, query client conventions, reusable UI patterns)
- Changing conventions already described in `docs/architecture/feature-sliced-design.md` or `docs/ui/compound-components.md`
- Explicit signals: "we decided…", "use X instead of Y", "record as ADR", "trade-off is…"

## When to Skip

No ADR scan/update required when the work only:

- Applies a convention already documented in repo docs, skills, or existing ADRs
- Is a trivial edit (small UI tweak, copy change, formatting cleanup, one-off bugfix without cross-cutting impact)
- Refactors code locally without changing ownership, boundaries, or public structure

Re-enter the ADR workflow only if the task changes, supersedes, or introduces an exception to current conventions.

## Required Workflow

1. **Scan** — Read `docs/adr/README.md` and related architecture docs before changing a structural decision
2. **Review** — Understand the current shape: `src/main` (Electron bootstrap, server lifecycle), `src/preload` (bridge), `src/renderer/src` (React shell, route modules, shared UI/helpers)
3. **Decide**:
   - **Update** an existing ADR if the same decision evolved
   - **Draft** a new ADR if no record covers the choice (use the next number in sequence, follow `docs/adr/template.md`, write in English)
   - **No ADR** only if the change is truly local with no lasting architectural alternative
4. **Confirm** — Ask the user before creating a new ADR file when the decision is still under discussion
5. **Index** — Append or adjust the row in `docs/adr/README.md` whenever an ADR is added or changed
6. **Status** — Use `proposed` while under discussion, `accepted` when in effect, `deprecated` or `superseded by ADR-NNNN` when replaced

## Project-Specific Guidance

- Keep Electron boundaries intact: main-process concerns in `src/main`, IPC exposure in `src/preload`, UI in `src/renderer`
- Keep page-level UI close to the owning page under `src/renderer/src/pages`
- Move reusable UI and helpers to `src/renderer/src/shared/ui`, `src/renderer/src/shared/lib`, or `src/renderer/src/shared/api` when multiple screens need them
- Prefer a simple and predictable structure over large new abstraction layers
- Prefer compound or composer components when a UI surface has coordinated parts and shared state

## Do / Don't

- ✅ Record trade-offs about architecture boundaries, ownership, IPC, routing, shared abstractions, and renderer organization
- ✅ Prefer updating an existing ADR over creating overlapping records
- ❌ Do not invent ADRs for style-only changes, single-file refactors, or minor bug fixes
- ❌ Do not move logic across main, preload, and renderer just to follow a personal pattern
- ❌ Do not introduce a large new folder structure unless the app clearly outgrows the current layout

## Quick Checklist

```
[ ] Scanned docs/adr/README.md and the relevant architecture docs
[ ] Updated an existing ADR or drafted/confirmed a new one when needed
[ ] Index row updated if an ADR file changed
```
