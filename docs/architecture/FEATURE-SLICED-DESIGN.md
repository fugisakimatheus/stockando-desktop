# Feature-Sliced Design in this project

This repository is not structured as the large Gengar Next.js monorepo described in the older FSD guide. It is an Electron desktop app with a simple renderer architecture centered around three foundational folders:

- [src/main](../../src/main) for Electron main-process bootstrap and app lifecycle
- [src/preload](../../src/preload) for the preload bridge
- [src/renderer](../../src/renderer) for the React UI shell, router, pages, and shared UI

The current goal is to keep that structure stable and place new UI in a predictable way as the app grows.

## Current architecture snapshot

```text
src/
├── main/                # Electron main process, app lifecycle, local server
├── preload/             # IPC bridge for the renderer
└── renderer/
    ├── index.html
    └── src/
        ├── app/         # router, providers, global shell
        ├── pages/       # route-level screen modules
        └── shared/      # ui/, lib/, api/
```

## Base folders that should not be renamed or restructured

These folders are the architecture boundary of the app and should remain intact:

- [src/main](../../src/main)
- [src/preload](../../src/preload)
- [src/renderer](../../src/renderer)

Do not move business logic out of the renderer just to mimic a different framework layout. Keep the Electron boundaries intact and grow the app inside them.

## Current layer map

| Concern | Current location | Role |
|---------|------------------|------|
| Electron bootstrap | [src/main](../../src/main) | Window creation, app lifecycle, local server startup |
| Preload bridge | [src/preload](../../src/preload) | Exposes safe APIs to the renderer |
| Renderer shell | [src/renderer/src/app](../../src/renderer/src/app) | Router, providers, global UI shell |
| Pages | [src/renderer/src/pages](../../src/renderer/src/pages) | Route-level page modules |
| Shared UI | [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui) | Reusable components and small composites |
| Shared logic | [src/renderer/src/shared/lib](../../src/renderer/src/shared/lib) | Utilities and helpers |
| Shared API helpers | [src/renderer/src/shared/api](../../src/renderer/src/shared/api) | Query client and API-facing helpers |

## Placement rules

- Keep page-level UI in the matching folder under [src/renderer/src/pages](../../src/renderer/src/pages).
- Keep app-wide shell concerns in [src/renderer/src/app](../../src/renderer/src/app).
- Keep reusable UI primitives in [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui).
- Keep shared helpers in [src/renderer/src/shared/lib](../../src/renderer/src/shared/lib).
- Keep API-facing helpers in [src/renderer/src/shared/api](../../src/renderer/src/shared/api).
- Avoid mixing Electron main-process concerns with renderer page code.

## Import direction

Use a simple direction that matches the current codebase:

- app → pages → shared
- pages may import from shared
- shared should not import from pages
- avoid circular imports between page modules and shared modules

## How to place new code

When adding new UI or logic, follow this decision flow:

1. If it belongs to a single screen, keep it near that page under [src/renderer/src/pages](../../src/renderer/src/pages).
2. If it is reused by multiple pages, move it to [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui) or [src/renderer/src/shared/lib](../../src/renderer/src/shared/lib).
3. If it is app-wide shell logic, place it in [src/renderer/src/app](../../src/renderer/src/app).
4. If it touches Electron lifecycle, window creation, or IPC, place it in [src/main](../../src/main) or [src/preload](../../src/preload).

## Project-specific guidance

- The current pages are simple route modules such as [src/renderer/src/pages/home/ui/home-page.tsx](../../src/renderer/src/pages/home/ui/home-page.tsx), [src/renderer/src/pages/products/ui/products-page.tsx](../../src/renderer/src/pages/products/ui/products-page.tsx), [src/renderer/src/pages/categories/ui/categories-page.tsx](../../src/renderer/src/pages/categories/ui/categories-page.tsx), and [src/renderer/src/pages/settings/ui/settings-page.tsx](../../src/renderer/src/pages/settings/ui/settings-page.tsx).
- The renderer router is currently defined in [src/renderer/src/app/router.tsx](../../src/renderer/src/app/router.tsx).
- The Electron main process bootstrap is in [src/main/index.ts](../../src/main/index.ts), and the local API server is in [src/main/server.ts](../../src/main/server.ts).
- Prefer compound or composer components for multi-part UI when the surface needs coordinated sections — see [docs/ui/COMPOUND_COMPONENTS.md](../ui/COMPOUND_COMPONENTS.md).

## Do and do not

### Do

- ✅ Keep the base Electron folders intact
- ✅ Keep page UI close to the page that owns it
- ✅ Move reusable UI into shared UI when more than one page needs it
- ✅ Keep the renderer architecture simple and predictable

### Do not

- ❌ Rename or restructure [src/main](../../src/main), [src/preload](../../src/preload), or [src/renderer](../../src/renderer)
- ❌ Put page-level UI into the app shell just because it is convenient
- ❌ Spread shared UI across unrelated folders when a shared location would be clearer
- ❌ Introduce a large new folder structure unless the app clearly outgrows the current one
