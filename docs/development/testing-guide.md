# Testing Guide

The project uses Vitest as its test runner for the main process service layer. Tests cover unit logic, property-based invariants (via fast-check), and integration workflows.

## Testing stack

| Layer | Tool | Purpose |
|-------|------|---------|
| Unit | Vitest | Service CRUD operations, validation, error handling |
| Property-based | Vitest + fast-check | Invariant enforcement (uniqueness, non-negativity, atomicity) |
| Integration | Vitest | Multi-step stock workflows end-to-end within the service layer |
| Component | Vitest + React Testing Library | Shared UI primitives (not yet introduced) |
| End-to-end | Playwright (Electron support) | Full user flows (not yet introduced) |

## Running tests

```bash
pnpm test --run    # single execution (no watch)
pnpm test          # watch mode during development
```

## Current coverage

The test suite includes 154 tests across 28 test files covering:

- **Service unit tests** — CategoryService, UnitOfMeasureService, WarehouseService, AuditService
- **Property-based tests** — uniqueness constraints, referential integrity, stock balance correctness, non-negative enforcement, transfer conservation, movement immutability, transactional atomicity, trackInventory gate, reconciliation correctness, company data isolation
- **Integration tests** — complete stock workflow (inbound → outbound → transfer → adjustment → reconcile)

## Test patterns

### In-memory SQLite

All tests use an in-memory SQLite database (`new Database(':memory:')`) with the full schema created via SQL statements. This ensures tests run fast and in complete isolation.

### Mocking `getDb()`

Service functions call `getDb()` to get the Drizzle instance. Tests mock this via:

```ts
vi.mock('../../server', () => ({ getDb: vi.fn() }))
import { getDb } from '../../server'
const mockedGetDb = vi.mocked(getDb)
```

### Patching transactions for async compatibility

The `better-sqlite3` driver rejects async callbacks in `db.transaction()`. Stock tests patch this with a helper that manually manages `BEGIN`/`COMMIT`/`ROLLBACK`:

```ts
function patchDbTransaction(db, sqlite) {
  ;(db as any).transaction = async function <T>(fn) {
    sqlite.exec('BEGIN')
    try {
      const result = await fn(db)
      sqlite.exec('COMMIT')
      return result
    } catch (e) {
      sqlite.exec('ROLLBACK')
      throw e
    }
  }
}
```

### Property-based tests with fast-check

Property tests use `fc.assert(fc.asyncProperty(...))` with 50–100 runs per property. Each iteration creates a fresh in-memory database to ensure complete isolation.

## Test file locations

Tests live next to the service code they cover:

```text
src/main/services/__tests__/
├── audit-service.test.ts
├── category-service.test.ts
├── category-uniqueness.property.test.ts
├── category-referential-integrity.property.test.ts
├── company-isolation.property.test.ts
├── product-uniqueness.property.test.ts
├── stock-adjustment-movement.property.test.ts
├── stock-balance-net-sum.property.test.ts
├── stock-movement-immutability.property.test.ts
├── stock-non-negative.property.test.ts
├── stock-reconciliation.property.test.ts
├── stock-track-inventory-gate.property.test.ts
├── stock-transactional-atomicity.property.test.ts
├── stock-transfer-conservation.property.test.ts
├── stock-workflow.integration.test.ts
└── warehouse-service.test.ts
```

## Path alias support

Vitest resolves the same aliases used in production code:

```ts
resolve: {
  alias: {
    '@renderer': resolve('src/renderer/src'),
    '@app': resolve('src/renderer/src/app'),
    '@pages': resolve('src/renderer/src/pages'),
    '@shared': resolve('src/renderer/src/shared'),
  }
}
```

## Next steps

1. Add component tests for shared UI primitives using React Testing Library.
2. Add end-to-end tests for critical user flows once the UI stabilizes.
3. Add CI checks so pull requests fail fast when regressions are introduced.
