# ADR-0004: Renderer DX Patterns v2 — QueryState, useListPage, Hook Consolidation, and API Result

**Date**: 2026-08-21
**Status**: accepted
**Deciders**: Development team

## Context

Building on ADR-0003 (Hook Factory, Pagination, Error Codes, Branded Types), further analysis of the renderer revealed additional patterns of duplication and inconsistency:

1. **Async state rendering repetition**: Every list page repeats the same `if (isLoading)` → `if (isError)` → `if (data.length === 0)` → render chain. This is 12-20 lines of identical branching per page across 20+ pages.

2. **List page boilerplate**: Each paginated page repeats ~30 lines of setup: `useState` for filters, `usePaginationControlled` with offset change callback, query hook call, `useMutationHandlers`, and field error state. The pattern is identical across 10+ pages.

3. **Cross-page hook imports violating FSD**: Hooks for `products`, `warehouses`, `categories`, and `units-of-measure` lived in their owning page folder but were consumed by 3-5 other pages via `@pages/X/hooks/...` imports. This violates the FSD import direction rule (pages cannot import from other pages).

4. **Status transition boilerplate**: Orders, quotes, purchase orders, and fiscal documents all need a typed status transition mutation with identical cache invalidation. Each was hand-written alongside the factory output.

5. **No Result-based API wrapper**: For non-query contexts (form submissions, conditional logic), developers had to use try/catch with `apiClient`. A Result-pattern wrapper was missing for ergonomic inline error handling.

## Decision

Introduce five improvements to the renderer's shared layer:

### 1. QueryState Compound Component (`shared/ui/query-state.tsx`)

A compound component that declaratively renders async states from any `UseQueryResult`:

```tsx
<QueryState query={productsQuery} empty={(d) => d.data.length === 0}>
  <QueryState.Loading message="Carregando produtos..." />
  <QueryState.Error title="Erro ao carregar produtos" />
  <QueryState.Empty icon={<Package />} title="Nenhum produto" />
  <QueryState.Success>
    {(data) => <ProductsTable data={data} />}
  </QueryState.Success>
</QueryState>
```

Follows the compound component pattern (context + guard hook + namespaced parts). Also supports a simplified render-prop mode for quick usage.

### 2. useListPage Composite Hook (`shared/hooks/use-list-page.ts`)

Encapsulates the repeated filter + pagination + query + mutation-error pattern:

```tsx
const { filters, setFilter, pagination, query, fieldErrors, handleMutationError } =
  useListPage({
    companyId,
    defaultFilters: { search: '', categoryId: undefined },
    pageSize: 20,
    queryHook: useProducts,
  })
```

### 3. Hook Placement Consolidation

Moved multi-page hooks from `pages/X/hooks/` to `shared/hooks/`:
- `use-products` → used by products, sales-orders, purchase-orders, quotes
- `use-warehouses` → used by warehouses, stock, purchase-orders, stock-movements, stock-adjustments
- `use-categories` → used by categories, products
- `use-units-of-measure` → used by units-of-measure, products

Original page-level files now re-export from the shared source for backward compatibility.

### 4. Status Transition Factory (`useTransition` in `create-query-hooks.ts`)

Added a `transition` config option and `useTransition` hook to `createPaginatedQueryHooks`:

```ts
const { useTransition } = createPaginatedQueryHooks({
  domain: 'sales-orders',
  transition: (companyId, id, status) => transitionStatus(companyId, id, status),
  // ...
})
```

The `TStatus` generic provides compile-time safety for status values.

### 5. Result-Based API Wrapper (`shared/lib/api-result.ts`)

`tryFetch` wraps any async API call and returns `Result<T, ApiError>` instead of throwing:

```ts
const result = await tryFetch(() => createProduct(companyId, input))
if (!result.ok) {
  toast.error(getUserErrorMessage(result.error.code))
  return
}
```

Also provides `isApiErrorWithCode` type guard for narrowing error codes inline.

### 6. MutationCallbacks Type

All factory-generated mutation hooks now accept an optional `callbacks` parameter for per-call `onSuccess`/`onError` handlers that fire after the built-in invalidation logic.

## Alternatives Considered

### Alternative 1: Higher-order component for async state instead of compound component
- **Pros**: Familiar pattern, wraps components cleanly
- **Cons**: Props become opaque, harder to customize individual states, no JSX composition
- **Why not**: The compound pattern gives consumers full control over which states to render and how, while keeping defaults minimal.

### Alternative 2: A single "usePageState" hook that combines everything (filters, pagination, query, mutations, form state)
- **Pros**: Maximum reduction in page boilerplate
- **Cons**: Too opaque, hard to extend for pages with custom needs, couples too many concerns
- **Why not**: `useListPage` focuses only on the filter/pagination/query triangle. Mutation execution and form state remain at the page level where they vary.

### Alternative 3: Keep cross-page hooks in page folders and accept the import violations
- **Pros**: No file moves, no changes to existing imports
- **Cons**: Violates FSD import direction, confuses ownership, makes grep-based dependency analysis unreliable
- **Why not**: The violation was already causing confusion — 4 hooks were consumed by 3-5 other pages. Moving to shared with re-exports is backward-compatible and architecturally correct.

### Alternative 4: neverthrow library for Result pattern
- **Pros**: Richer API (map, mapErr, andThen), community standard
- **Cons**: New dependency for a narrow use case, most call sites only need the basic ok/err check
- **Why not**: The existing `Result` type in `shared/lib/result.ts` is sufficient. The `tryFetch` wrapper adds the async integration without a new dependency.

## Consequences

### Positive
- List pages can drop 12-30 lines of boilerplate each
- QueryState provides a consistent, tested pattern for all async UI states
- Hook placement now follows FSD import direction cleanly
- Status transitions are standardized — no more hand-written mutation hooks for each domain
- `tryFetch` enables Result-style error handling for non-query contexts
- MutationCallbacks allow pages to react to mutation success/error without overriding factory invalidation

### Negative
- Developers must learn the QueryState compound API (minor — it mirrors EmptyState/ErrorState/LoadingState already in use)
- useListPage is opinionated about filter structure (must extend `{ limit, offset }`) — pages with non-offset pagination (cursor-based) would still use manual setup
- Re-export files in page folders add indirection; new contributors might be confused initially

### Risks
- **QueryState becomes too rigid**: If pages need completely custom loading/error UX (animations, skeletons), QueryState may not fit. Mitigation: QueryState is opt-in; raw query state checks remain valid.
- **useListPage scope creep**: Temptation to add more features (sorting, column visibility, table state). Mitigation: keep the hook focused on filter/pagination/query; table-specific state belongs at the component level.
- **Re-export churn**: If the shared hook API changes, both the shared file and the re-export file need updating. Mitigation: re-exports are thin pass-through files with no logic.
