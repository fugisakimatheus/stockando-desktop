---
inclusion: fileMatch
fileMatchPattern: "**/*.{ts,tsx}"
---

# TanStack Ecosystem Conventions

Guidelines for TanStack Router, React Query, and React Table usage in this project.

## TanStack Router

- The router is file-based at `src/renderer/src/app/router.tsx` using `createRouter` / `createRoute` / `createRootRoute`.
- The root route renders the `AppShell` with an `<Outlet />`.
- Register the router type via the `declare module '@tanstack/react-router'` augmentation.
- Use `useRouterState` to read route state (e.g., current pathname for active nav).
- Keep route definitions colocated in the router file unless the app grows large enough to warrant route splitting.

## TanStack React Query

- The `QueryClient` is configured in `src/renderer/src/shared/api/query-client.ts`.
- The `QueryClientProvider` wraps the app in `src/renderer/src/app/providers/query-provider.tsx`.
- Defaults: `staleTime: 5min`, `gcTime: 5min`, `retry: 1`, `refetchOnWindowFocus: true`.

### Query Key Conventions

- Use arrays with a domain prefix: `['products', 'list']`, `['products', 'detail', id]`.
- Keep keys stable and serializable.
- Colocate query keys with their hook or API helper.

### Custom Hooks

- Wrap `useQuery` and `useMutation` in domain-specific hooks (e.g., `useProducts`, `useCreateProduct`).
- Keep hooks in the page folder when used by a single page; move to `@shared/hooks` when reused.
- Return typed data — avoid `any` in query function returns.

### Mutations

- Use `useMutation` with `onSuccess` to invalidate related queries.
- Prefer optimistic updates for UI-critical fast feedback paths.
- Handle error and loading states explicitly in the UI.

## TanStack React Table

- Use `@tanstack/react-table` for data tables with sorting, filtering, and pagination.
- Define column definitions with explicit types using `ColumnDef<TData>`.
- Keep column definitions near the page or component that owns the table.
- Prefer controlled state for pagination when the data comes from the server.

## Devtools

- TanStack devtools (Router, Query, Hotkeys, Pacer) are rendered by the `TanstackDevtools` component in the app root.
- Devtools are dev-only dependencies — they are tree-shaken in production builds.

## Do

- Use query hooks for all server-state in the renderer.
- Invalidate queries after mutations to keep UI fresh.
- Use `enabled` option to conditionally fetch data.
- Use `select` to transform data at the query level when only a subset is needed.

## Do Not

- Do not call `fetch` directly in components — use React Query hooks.
- Do not store server data in `useState` — let React Query manage the cache.
- Do not use `queryClient` directly in components — use hooks instead.
- Do not mix React Query state with local form state unnecessarily.
