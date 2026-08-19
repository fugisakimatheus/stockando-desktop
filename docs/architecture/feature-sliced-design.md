# Feature-Sliced Design in this project

This repository is not structured as a large multi-slice frontend monorepo. It is an Electron desktop app with a small renderer architecture that still benefits from clear placement rules. The current approach follows a minimal FSD-inspired shape:

- [src/main](../../src/main) for Electron main-process bootstrap and app lifecycle
- [src/preload](../../src/preload) for the preload bridge
- [src/renderer](../../src/renderer) for the React UI shell, pages, and shared UI

The main principle is simple: start with app, pages, and shared; extract more structure only when the same logic is clearly reused in multiple places.

## Current architecture snapshot

```text
src/
├── main/                # Electron main process, app lifecycle, local server
├── preload/             # narrow IPC bridge for the renderer
└── renderer/
    ├── app/             # router, providers, app-level shell
    ├── pages/           # route-level screen modules
    └── shared/          # ui/, hooks/, lib/, api/
```

## Base folders that should not be renamed or restructured

These folders are the architecture boundary of the app and should remain intact:

- [src/main](../../src/main)
- [src/preload](../../src/preload)
- [src/renderer](../../src/renderer)

Keep the Electron boundaries intact and grow the app inside them rather than reshaping the project around a different framework convention.

## Current layer map

| Concern | Current location | Role |
|---------|------------------|------|
| Electron bootstrap | [src/main](../../src/main) | Window creation, app lifecycle, local server startup |
| Preload bridge | [src/preload](../../src/preload) | Exposes safe APIs to the renderer |
| Renderer shell | [src/renderer/src/app](../../src/renderer/src/app) | Router, providers, global UI shell |
| Pages | [src/renderer/src/pages](../../src/renderer/src/pages) | Route-level page modules |
| Shared UI | [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui) | Reusable components and small composites (44+ component files) |
| Shared hooks | [src/renderer/src/shared/hooks](../../src/renderer/src/shared/hooks) | Shared React hooks |
| Shared logic | [src/renderer/src/shared/lib](../../src/renderer/src/shared/lib) | Utilities and helpers |
| Shared API helpers | [src/renderer/src/shared/api](../../src/renderer/src/shared/api) | Query client and API-facing helpers |

## Placement rules

Use the following rules when adding code:

- keep page-level UI in the matching folder under [src/renderer/src/pages](../../src/renderer/src/pages)
- keep app-wide shell concerns in [src/renderer/src/app](../../src/renderer/src/app)
- keep reusable UI primitives in [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui)
- keep shared hooks in [src/renderer/src/shared/hooks](../../src/renderer/src/shared/hooks)
- keep shared helpers in [src/renderer/src/shared/lib](../../src/renderer/src/shared/lib)
- keep API-facing helpers in [src/renderer/src/shared/api](../../src/renderer/src/shared/api)
- avoid mixing Electron main-process concerns with renderer page code

## Import direction

Use a simple direction that matches the current codebase:

- app → pages → shared
- pages may import from shared
- shared should not import from pages
- avoid circular imports between page modules and shared modules

## Path aliases

The project uses 6 TypeScript path aliases to simplify imports:

| Alias | Maps to |
|-------|---------|
| `@main/*` | `./src/main/*` |
| `@preload/*` | `./src/preload/*` |
| `@renderer/*` | `./src/renderer/src/*` |
| `@app/*` | `./src/renderer/src/app/*` |
| `@pages/*` | `./src/renderer/src/pages/*` |
| `@shared/*` | `./src/renderer/src/shared/*` |

Use these aliases in import statements rather than long relative paths.

## How to place new code

When adding new UI or logic, follow this decision flow:

1. If it belongs to a single screen, keep it near that page under [src/renderer/src/pages](../../src/renderer/src/pages).
2. If it is reused by multiple pages, move it to [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui), [src/renderer/src/shared/hooks](../../src/renderer/src/shared/hooks), or [src/renderer/src/shared/lib](../../src/renderer/src/shared/lib).
3. If it is app-wide shell logic, place it in [src/renderer/src/app](../../src/renderer/src/app).
4. If it touches Electron lifecycle, window creation, or IPC, place it in [src/main](../../src/main) or [src/preload](../../src/preload).

## Project-specific guidance

The current pages include fully functional route modules for home, products (list, detail, create/edit), categories, units of measure, warehouses, stock overview (with reconciliation), stock movements, stock adjustments, settings, companies, and a 404 not-found screen.

Each page module follows the pattern `pages/<name>/hooks/` for TanStack Query hooks and `pages/<name>/ui/` for React components.

The renderer router is defined in [src/renderer/src/app/router.tsx](../../src/renderer/src/app/router.tsx), and the Electron bootstrap is centered in [src/main/index.ts](../../src/main/index.ts).

The project is still small enough that the default should be:
- keep it in the page if only one screen uses it
- keep it in shared if it is reused by more than one screen
- avoid creating widgets, features, or entities until the boundaries are clearly proven by repeated use

## Do and do not

### Do

- ✅ keep the base Electron folders intact
- ✅ keep page UI close to the page that owns it
- ✅ move reusable UI into shared UI when more than one page needs it
- ✅ keep the renderer architecture simple and predictable

### Do not

- ❌ rename or restructure [src/main](../../src/main), [src/preload](../../src/preload), or [src/renderer](../../src/renderer)
- ❌ move page-level UI into the app shell just because it is convenient
- ❌ introduce a large new folder structure unless the app clearly outgrows the current one
- ❌ create extra architectural layers before the app has a repeated need for them
