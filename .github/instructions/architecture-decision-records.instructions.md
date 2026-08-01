---
description: When making large, architectural, or technical trade-off decisions, scan docs/adr and update or propose a new ADR before considering the work done.
applyTo: '**/*'
---

# Architecture Decision Records — keep in sync

When a change is **large**, **architectural**, or records a **technical trade-off** (why X instead of Y), treat ADRs as part of the deliverable — not an optional follow-up.

Canonical skill: [architecture-decision-records](../../.agents/skills/architecture-decision-records/SKILL.md) · Index: [docs/adr/README.md](../../docs/adr/README.md) · Template: [docs/adr/template.md](../../docs/adr/template.md)

## When this applies

Trigger on any of:

- Choosing or changing framework, library, package boundary, API shape, auth/data strategy, FSD placement, or shared UI/runtime pattern
- Introducing a documented exception (e.g. non-Kubb BFF) or superseding an existing convention
- Planning / PR work that alters “how we build” across apps or packages
- Explicit signals: “we decided…”, “use X instead of Y”, “record as ADR”, “trade-off is…”

**Skip** (no ADR scan/update required) when the work only:

- Applies a convention **already specified** in `.cursor/rules/`, skills, or how-tos — e.g. “use `RecordEditor` / `FormEngine` / `DynamicFilters` / `ConfirmDialog`”, compound over prop monoliths, tuple SDK errors, infinite scroll lists, overlay-glass tokens, i18n catalogs, named exports
- Is a trivial edit: renames, formatting, one-off bugfixes, copy tweaks, version pins without a new trade-off

Re-enter this workflow only if the task **changes**, **supersedes**, or **exceptions** that existing convention (new alternative rejected, new package boundary, documented exception).

## Required workflow

1. **Scan** [docs/adr/README.md](../../docs/adr/README.md) for related ADRs (topic keywords + nearby numbers).
2. **Read** matching ADR files — Context + Decision must still match reality.
3. **Decide**:
   - **Update** an existing ADR if the same decision evolved (status, consequences, links, superseded-by).
   - **Draft a new ADR** if no record covers the choice (next `NNNN`, English, Nygard sections from the template).
   - **No ADR** only if the change is truly how-to / local and introduces no lasting alternative rejection.
4. **Confirm with the user** before writing a **new** ADR file (skill workflow). Updates to an existing ADR that you already own in-session may proceed when the user asked for the architectural change; still mention what you changed.
5. **Index** — append/adjust the row in `docs/adr/README.md`. Link from related how-tos/rules when the decision is widely enforced (same pattern as existing ADR cross-links).
6. **Status** — `proposed` while under discussion; `accepted` when in effect; `deprecated` / `superseded by ADR-NNNN` when replaced (always link the successor).

## Do / don’t

- ✅ Language of ADR bodies: **English** (repo convention)
- ✅ Record **why** + rejected alternatives; keep readable in ~2 minutes
- ✅ Prefer updating an ADR over duplicating overlapping decisions
- ❌ Do not invent ADRs for style-only or file-naming choices
- ❌ Do not leave a new platform convention only in chat/PR without checking `docs/adr/`
- ❌ Do not auto-create `docs/adr/` from scratch without consent (already exists)

## Quick check before finishing the task

```
[ ] Scanned docs/adr/README.md for related decisions
[ ] Updated existing ADR(s) OR drafted/confirmed new ADR OR justified “no ADR”
[ ] Index row accurate if files changed
```
