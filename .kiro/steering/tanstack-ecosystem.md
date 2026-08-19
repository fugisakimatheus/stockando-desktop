---
inclusion: fileMatch
fileMatchPattern: "**/*.{ts,tsx}"
---

# TanStack Ecosystem Conventions

Guidelines for TanStack Router, React Query, and React Table usage in this project.

## TanStack Router

- The router is defined at `src/renderer/src/app/router.tsx` using `createRouter` / `createRoute` / `createRootRoute`.
- The root route renders the `BootstrapGate` which handles app initialization before showing the shell.
- Register the router type via the `declare module '@tanstack/react-router'` augmentation.
- Use `useRouterState` to read route state (e.g., current pathname for active nav).
- Use `lazyRouteComponent(() => import('...'), 'ExportName')` for code-split route components.
- For routes with params (e.g., `/products/$id`), use `useParams` to extract and parse them.
- Keep all route definitions in the router file — the current app size does not warrant route splitting.

## TanStack React Query

- The `QueryClient` is configured in `src/renderer/src/shared/api/query-client.ts`.
- The `QueryClientProvider` wraps the app in `src/renderer/src/app/providers/query-provider.tsx`.
- Defaults: `staleTime: 5min`, `gcTime: 5min`, `retry: 1`, `refetchOnWindowFocus: true`.

### Query Key Conventions

- Use arrays with a company ID prefix followed by domain: `[companyId, 'products', 'list']`, `[companyId, 'products', 'detail', id]`.
- The company ID prefix ensures cache isolation between companies.
- Use a query key factory object per domain for consistency:

```ts
const productKeys = {
  all: (companyId: number) => [companyId, 'products'] as const,
  lists: (companyId: number) => [...productKeys.all(companyId), 'list'] as const,
  list: (companyId: number, filters: Filters) => [...productKeys.lists(companyId), filters] as const,
  details: (companyId: number) => [...productKeys.all(companyId), 'detail'] as const,
  detail: (companyId: number, id: number) => [...productKeys.details(companyId), id] as const,
}
```

- Keep keys stable and serializable.
- Colocate query keys with their hook file.

### Custom Hooks

- Wrap `useQuery` and `useMutation` in domain-specific hooks (e.g., `useProducts`, `useCreateProduct`).
- Keep hooks colocated with the page that owns them: `pages/<name>/hooks/use-<name>.ts`.
- Move to `@shared/hooks` only when multiple pages consume the same hook.
- Accept `companyId` as the first parameter to all hooks.
- Return typed data — avoid `any` in query function returns.

### Mutations

- Use `useMutation` with `onSuccess` to invalidate related queries via `queryClient.invalidateQueries({ queryKey: keys.all(companyId) })`.
- Invalidate broadly (the `all` prefix) to catch both list and detail queries.
- For stock mutations, invalidate both `[companyId, 'stock']` and `[companyId, 'stock-movements']` prefixes.
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
