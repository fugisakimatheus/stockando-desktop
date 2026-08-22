# ADR-0003: Renderer DX Abstractions — Hook Factory, Pagination, Error Codes, and Branded Types

**Date**: 2026-08-21
**Status**: accepted
**Deciders**: Development team

## Context

Analysis of the renderer codebase revealed four categories of recurring boilerplate and type safety gaps:

1. **Query hook repetition**: 15+ hook files each define the same structure — query key factory, useList, useDetail, useCreate, useUpdate, useDelete — differing only in domain name and API function references. Each file is 80–100 lines of near-identical code.

2. **Pagination logic duplication**: 10+ list pages repeat the same offset/limit math (currentPage, totalPages, hasPrevious, hasNext) and handler functions (goToNextPage, goToPreviousPage, resetPage). This accounts for ~10–15 duplicated lines per page.

3. **Untyped error codes**: Error codes from the server (CONFLICT, ENTITY_REFERENCED, etc.) are compared as raw string literals across pages. Adding a new error code requires manually hunting for all comparison sites. User-facing messages are inline and inconsistent.

4. **Weak numeric IDs**: All domain IDs (companyId, productId, customerId) are plain `number`. Nothing prevents accidentally passing a productId where a companyId is expected.

## Decision

Introduce four new shared abstractions in `src/renderer/src/shared/lib/`:

| Module | Exports | Purpose |
|--------|---------|---------|
| `create-query-hooks.ts` | `createSimpleQueryHooks`, `createPaginatedQueryHooks` | Factory functions that generate typed query/mutation hooks from a declarative config |
| `use-pagination.ts` (in shared/hooks) | `usePagination`, `usePaginationControlled` | Encapsulates offset-based pagination math in standalone or controlled mode |
| `error-codes.ts` (in shared/api) | `API_ERROR_CODES`, `ApiErrorCode`, `getUserErrorMessage`, `isKnownErrorCode` | Typed error code registry with ts-pattern based pt-BR message resolver |
| `branded-types.ts` | `CompanyId`, `ProductId`, `BrandedId<B>`, `brandId()`, etc. | Nominal types for domain IDs with zero runtime cost |

### Hook Factory

Two factory variants cover the existing hook patterns:
- **Simple** (flat list, no filters): categories, units-of-measure, warehouses
- **Paginated** (filtered list + detail): products, customers, suppliers, sales-orders

Each factory generates hooks with standardized cache invalidation on mutations. Domain-specific hooks (e.g., status transitions) remain alongside the factory-generated ones.

### Pagination Hook

Two modes for different integration patterns:
- **Standalone**: hook manages its own offset state — ideal when pagination is the only filter
- **Controlled**: hook computes state from external offset — ideal when pagination is part of a larger filter state object

### Error Code Map

Uses `ts-pattern` match for exhaustive error-to-message resolution. Falls back to server message for unknown codes. Integrated into `useMutationHandlers` so all mutation error toasts use consistent, user-friendly messages.

### Branded Types

Opt-in adoption strategy:
1. `useCompanyId()` returns `CompanyId` (branded number) as the first boundary
2. `BrandedId` extends `number`, so existing untyped consumers continue to work
3. The compile-time guard activates when a function explicitly accepts `CompanyId`

## Alternatives Considered

### Alternative 1: Code generation for hooks (e.g., a CLI script)
- **Pros**: Zero runtime overhead, full customization per domain
- **Cons**: Requires running a generator step, harder to refactor, generated code is noisy in diffs
- **Why not**: A runtime factory with TypeScript generics achieves the same DRY benefit without build tooling, and the overhead of a function call is negligible in this context.

### Alternative 2: A single global pagination context
- **Pros**: One place to manage all pagination state
- **Cons**: Couples unrelated pages, complex state management, breaks code-splitting
- **Why not**: Each page owns its own filters and pagination. A hook that encapsulates the math without owning global state is simpler and more composable.

### Alternative 3: i18n library for error messages (e.g., react-intl)
- **Pros**: Supports multiple languages, standard approach
- **Cons**: Over-engineering for a single-locale app (pt-BR only), adds dependency and complexity
- **Why not**: The app targets Brazilian users exclusively. A simple ts-pattern match is sufficient and keeps messages colocated with error code definitions.

### Alternative 4: Opaque types via `unique symbol` instead of branded intersection
- **Pros**: Slightly stricter (no structural compatibility)
- **Cons**: Requires explicit casting at every boundary, more disruptive to adopt incrementally
- **Why not**: The `Brand<T, B>` intersection pattern allows gradual adoption since `BrandedId` is still assignable to `number` — existing code doesn't break.

## Consequences

### Positive
- Hook files shrink from ~90 lines to ~25 lines (72% reduction per domain)
- New domains can be onboarded in 5 minutes by calling the factory
- Pagination logic is tested once, reused in 10+ pages
- Error messages are consistent and easy to update from one location
- Branded types catch ID-mixing bugs at compile time as adoption spreads

### Negative
- Developers must learn the factory API (minor learning curve, well-documented)
- Domain-specific hooks that don't fit the factory (status transitions, custom invalidations) still require manual implementation alongside the factory output
- Branded types add a small conceptual overhead; the cast at system boundaries is slightly more verbose than plain `number`

### Risks
- **Factory becomes too rigid**: If future domains need significantly different patterns (e.g., infinite scroll, cursor-based pagination), the factory may not cover them. Mitigation: the factory is opt-in — manual hooks remain a valid choice.
- **Over-branding**: Applying branded types everywhere prematurely could slow development. Mitigation: adopt only at `useCompanyId` initially, extend to other IDs organically as pages are touched.
