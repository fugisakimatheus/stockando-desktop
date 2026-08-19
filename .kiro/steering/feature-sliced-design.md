---
inclusion: fileMatch
fileMatchPattern: "**/*.{ts,tsx,js}"
---

# Feature-Sliced Design (FSD-lite)

Organize the Electron + React renderer using a simplified FSD structure with clear placement rules for pages, shared UI, and the Electron boundary.

## Layer Map

| Concern | Location | Role |
|---------|----------|------|
| Electron bootstrap | `src/main` | Process-level bootstrap, DB, server setup |
| Service layer | `src/main/services` | Domain logic, CRUD, stock operations |
| API routes | `src/main/routes` | Fastify route handlers with Zod validation |
| Preload scripts | `src/preload` | Bridge between main and renderer |
| Renderer entry | `src/renderer/src/app` | Router, providers, global shell |
| Pages | `src/renderer/src/pages` | Route-level screen containers with colocated hooks |
| Shared UI | `src/renderer/src/shared/ui` | Reusable primitives and composites |
| Shared API | `src/renderer/src/shared/api` | Typed fetch functions and query client |
| Shared logic | `src/renderer/src/shared/lib` | Utilities, helpers, cross-cutting logic |

## Placement Rules

- Keep page-level UI in its corresponding folder under `src/renderer/src/pages`
- Keep page-specific TanStack Query hooks in `src/renderer/src/pages/<name>/hooks/`
- Keep reusable UI primitives in `src/renderer/src/shared/ui`
- Keep shared helpers in `src/renderer/src/shared/lib`
- Keep app-wide providers and routing in `src/renderer/src/app`
- Colocate feature-specific UI near its page; move to shared only when multiple pages need it

## Page Module Structure

Each page module follows a consistent structure:

```text
src/renderer/src/pages/<name>/
├── hooks/
│   └── use-<name>.ts        # TanStack Query hooks (queries + mutations)
├── ui/
│   └── <name>-page.tsx      # Main page component
└── index.ts                  # Barrel export
```

Additional UI components (forms, dialogs) live in the `ui/` folder when page-specific.

## Import Direction

- `app` → `pages` → `shared`
- Pages may import from shared
- Shared must not import from pages
- No circular imports between page-level modules and shared modules

## Electron Boundary Preservation

- Do not rename, move, or restructure `src/main`, `src/preload`, or `src/renderer`
- These are the foundational architecture boundaries of the app

## Slice Growth Strategy

- Start with the page folder under `src/renderer/src/pages`
- Extract to `src/renderer/src/shared/ui` only when reuse across pages is proven
- Keep domain-specific logic close to the page until reuse is clearly justified

## Do

- Keep page screens as thin containers; move repeated UI into shared primitives
- Use named exports and keep modules focused on one responsibility
- Prefer compound/composer patterns for multi-part UI with shared state — see `docs/ui/compound-components.md`
- Keep the renderer architecture consistent with the existing folder layout

## Do Not

- Put reusable UI directly inside the page file if more than one page may need it
- Create deep imports from pages into unrelated shared modules
- Mix app shell concerns with page UI
- Introduce a large new FSD structure unless the app clearly outgrows the current layout
