---
description: Keep the current Electron + React renderer organized with clear placement rules for pages, shared UI, and future feature slices.
applyTo: '**/*.{ts,tsx,js}'
---

# Feature-Sliced Design (FSD)

This project does not currently use the full Gengar-style Next.js FSD tree. The renderer is organized around a simpler structure that is already reflected in the workspace:

- Pages live under [src/renderer/src/pages](../../src/renderer/src/pages)
- Shared UI lives under [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui)
- Shared utilities live under [src/renderer/src/shared/lib](../../src/renderer/src/shared/lib)
- The main Electron entry points live under [src/main](../../src/main) and [src/preload](../../src/preload)

The goal of this instruction is to preserve a clean placement model as the app grows, while staying consistent with the structure that exists today.

## Current layer map

| Concern | Current location | Role |
|---------|------------------|------|
| App shell / Electron bootstrap | [src/main](../../src/main) | Process-level bootstrap, DB, server setup |
| Renderer entry | [src/renderer/src/app](../../src/renderer/src/app) | Router, providers, global shell |
| Pages | [src/renderer/src/pages](../../src/renderer/src/pages) | Route-level screen containers |
| Shared UI | [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui) | Reusable primitives and small composites |
| Shared logic | [src/renderer/src/shared/lib](../../src/renderer/src/shared/lib) | Utilities, helpers, cross-cutting logic |

## Placement rules

- Keep page-level UI in the corresponding page folder under [src/renderer/src/pages](../../src/renderer/src/pages).
- Keep reusable UI primitives in [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui).
- Keep shared helpers in [src/renderer/src/shared/lib](../../src/renderer/src/shared/lib).
- Keep app-wide providers and routing setup in [src/renderer/src/app](../../src/renderer/src/app).
- Do not rename, move, or restructure the base Electron folders [src/main](../../src/main), [src/preload](../../src/preload), or [src/renderer](../../src/renderer). Those are the foundational architecture boundaries of the app.
- Avoid scattering feature-specific UI across unrelated folders; prefer colocating it near the page or moving it into shared UI only when multiple pages need it.

## Import direction

Use a simple, predictable direction:

- app → pages → shared
- pages may import from shared
- shared should not import from pages
- avoid circular imports between page-level modules and shared modules

## Slice-style guidance for this repo

When a screen grows beyond a single component, introduce structure in a lightweight way:

- Start with the page folder under [src/renderer/src/pages](../../src/renderer/src/pages)
- If the UI is reused across pages, move it to [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui)
- If the logic becomes domain-specific, keep it close to the page until reuse is clearly justified

This keeps the project simple while still preventing UI from becoming a flat pile of one-off components.

## Do

- ✅ Keep page screens as thin containers and move repeated UI into shared primitives
- ✅ Use named exports and keep modules focused on one responsibility
- ✅ Prefer compound/composer patterns for multi-part UI when parts need shared state or flexible composition — [docs/ui/COMPOUND_COMPONENTS.md](../../docs/ui/COMPOUND_COMPONENTS.md)
- ✅ Keep the renderer architecture consistent with the existing folder layout

## Do not

- ❌ Put reusable UI directly inside the page file if more than one page may need it
- ❌ Create deep imports from pages into unrelated shared modules
- ❌ Mix app shell concerns with page UI
- ❌ Introduce a large new FSD structure unless the app clearly outgrows the current layout

## Practical examples

- A simple page like [src/renderer/src/pages/home/ui/home-page.tsx](../../src/renderer/src/pages/home/ui/home-page.tsx) should stay small and focused.
- A reusable card or panel that is needed by multiple pages should move to [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui).
- A utility used by several UI pieces should live in [src/renderer/src/shared/lib](../../src/renderer/src/shared/lib).
