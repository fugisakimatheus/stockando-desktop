# ADR-0002: Shared Lib Utility Patterns

- **Status:** accepted
- **Date:** 2026-08-21

## Context

Analysis of the renderer codebase revealed significant code duplication across 20+ page modules:

1. **Formatting**: `formatCurrency` was duplicated verbatim in 18 files. `formatDate` appeared in 12 files with minor variants. Each page redefined its own `Intl.NumberFormat` / `Intl.DateTimeFormat` instance.

2. **Company ID**: Every page hardcoded `const COMPANY_ID = 1` instead of reading the active company from the bootstrap context. This pattern would silently break with multi-company support.

3. **Mutation error handling**: All pages repeated the same `onError` boilerplate: check `ApiError.fields`, check specific codes, fall back to toast. This was 10-15 lines duplicated per mutation.

4. **Query string building**: The `buildQueryString` utility was defined inside `catalog-api.ts` but is generic infrastructure used by multiple API modules.

## Decision

Extract four new modules into `src/renderer/src/shared/lib/`:

| Module | Exports | Replaces |
|--------|---------|----------|
| `format.ts` | `formatCurrency`, `formatDate`, `formatDateTime`, `formatShortDate`, `formatDecimal`, `formatQuantity` | Per-file `formatCurrency`/`formatDate` definitions |
| `result.ts` | `Result<T,E>`, `ok()`, `err()` | Ad-hoc success/error object patterns |
| `query-string.ts` | `buildQueryString()` | Inline helper in `catalog-api.ts` |
| `mutation-handlers.ts` | `useMutationHandlers()` | Repeated `onError` callbacks in mutations |

Additionally, create `src/renderer/src/shared/hooks/use-company-id.ts`:

| Hook | Returns | Replaces |
|------|---------|----------|
| `useCompanyId()` | `number` (throws if no active company) | `const COMPANY_ID = 1` hardcode |

All exports are re-exported through `shared/lib/index.ts`.

## Consequences

- **Positive**: Eliminates ~300 lines of duplicated code across 20+ files. Future formatting changes (locale, precision) require one edit. The `useCompanyId` hook prevents silent multi-company bugs. Mutation error handling becomes consistent and testable.

- **Positive**: The `Result` type provides a foundation for future error handling in form validation and complex operations without relying solely on try/catch.

- **Negative**: Pages now depend on `@shared/lib` for formatting. This is an acceptable coupling since formatting is infrastructure with no business logic (per FSD rules).

- **Migration**: Existing pages can be migrated incrementally. The old inline helpers continue to work until replaced. No breaking changes.

## Alternatives Considered

1. **Keep formatting inline per page** — rejected due to 18-file duplication and maintenance burden.
2. **Use a third-party formatting library (dayjs, date-fns)** — rejected; `Intl` APIs are sufficient for our locale needs and add no dependency.
3. **Put formatters in `shared/ui`** — rejected; formatting is logic, not UI.
4. **Create an `entities/` layer for company context** — rejected; the app doesn't yet justify an entities layer per FSD-lite. A shared hook suffices.
