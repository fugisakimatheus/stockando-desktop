---
name: tdd-workflow
description: Use this skill when writing new features, fixing bugs, or refactoring code. Enforces test-driven development with 80%+ coverage including unit, integration, and E2E tests.
---

# Test-Driven Development Workflow

This skill ensures all code development follows TDD principles with comprehensive test coverage in the Gengar monorepo.

**Shared test utilities:** import from `@gengar/tests` (`renderWithProviders`, `setupUserEvent`, `runStoreAction`, `mockFetch`, …). Full catalog: [`packages/tests/README.md`](../../packages/tests/README.md). Conventions: [`.cursor/rules/testing.mdc`](../../.cursor/rules/testing.mdc).

## When to Activate

- Writing new features or functionality
- Fixing bugs or issues
- Refactoring existing code
- Adding API integrations or store actions
- Creating new components

## Core Principles

### 1. Tests BEFORE Code

ALWAYS write tests first, then implement code to make tests pass.

### 2. Coverage Requirements

- Minimum 80% coverage (unit + integration)
- All edge cases covered
- Error scenarios tested (especially SDK tuple errors)
- Boundary conditions verified

### 3. Test Types

#### Unit Tests (`*.spec.ts` / `*.spec.tsx`)

- Individual functions and utilities
- Component rendering and interactions
- Zustand store actions
- Schema validations

#### Integration Tests (`*.spec.integration.ts` / `*.spec.integration.tsx`)

- Store + SDK interactions
- Component + store integration
- Multi-component flows

## TDD Workflow Steps

### Step 1: Identify Business Rules

Map scenarios before writing any code:
- Happy path
- Edge cases (empty data, null values, boundary limits)
- Error scenarios (API failures, validation errors, permission denied)
- Permission-gated behavior

### Step 2: Write Failing Tests (RED)

```typescript
import { renderWithProviders } from '@gengar/tests'
import { createAccountMock } from '@gengar/sdk/mocks'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('AccountCard', () => {
  it('displays account name', () => {
    const account = createAccountMock({ name: 'Empresa Teste' })

    renderWithProviders(<AccountCard account={account} />)

    expect(screen.getByText('Empresa Teste')).toBeInTheDocument()
    expect(screen.getByText(/ativo/i)).toBeInTheDocument()
  })

  it('calls onEdit when edit button is clicked', async () => {
    const account = createAccountMock()
    const onEdit = vi.fn()

    renderWithProviders(<AccountCard account={account} onEdit={onEdit} />)

    await userEvent.click(screen.getByRole('button', { name: /edit/i }))

    expect(onEdit).toHaveBeenCalledWith(account)
  })

  it('hides edit button when onEdit is not provided', () => {
    const account = createAccountMock()

    renderWithProviders(<AccountCard account={account} />)

    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
  })
})
```

### Step 3: Run Tests — Verify RED

```bash
npx vitest run src/components/account-card.spec.tsx
```

Tests MUST fail because the implementation does not exist yet. This confirms the test is actually testing something meaningful.

**This step is mandatory.** Do not write production code until RED is confirmed.

If the repository is under Git, create a checkpoint commit:
```bash
git commit -m "test: add failing tests for AccountCard"
```

### Step 4: Implement Minimal Code (GREEN)

Write the minimum code to make tests pass. No premature optimization.

```typescript
interface AccountCardProps {
  account: Account
  onEdit?: (account: Account) => void
}

export const AccountCard = ({ account, onEdit }: AccountCardProps) => {
  const t = useTranslations('common')

  const handleEditClick = () => onEdit?.(account)

  return (
    <Card className="p-4">
      <h3>{account.name}</h3>
      {onEdit && (
        <Button onClick={handleEditClick}>{t('edit')}</Button>
      )}
    </Card>
  )
}
```

### Step 5: Run Tests — Verify GREEN

```bash
npx vitest run src/components/account-card.spec.tsx
```

All tests must pass. If not, fix the implementation (not the tests).

Commit:
```bash
git commit -m "feat: implement AccountCard component"
```

### Step 6: Refactor

Improve code quality while keeping tests green:
- Extract reusable logic
- Improve naming
- Optimize performance
- Enhance readability

Commit:
```bash
git commit -m "refactor: clean up AccountCard implementation"
```

### Step 7: Verify Coverage

```bash
pnpm test:coverage
```

---

## Testing Patterns

### Zustand Store Tests

```typescript
import { api } from '@gengar/sdk/runtime/api'
import { createAccountMock } from '@gengar/sdk/mocks'
import { useAccountStore } from './account.store'

vi.mock('@gengar/sdk/runtime/api')

describe('useAccountStore', () => {
  beforeEach(() => {
    useAccountStore.getState().resetStore()
    vi.clearAllMocks()
  })

  it('fetches accounts and updates state', async () => {
    const mockAccounts = [createAccountMock(), createAccountMock()]
    vi.mocked(api.accounts.list).mockResolvedValue([
      null,
      { data: mockAccounts, meta: { total: 2 } }
    ])

    await useAccountStore.getState().fetchAccounts({ page: 1, limit: 12 })

    expect(useAccountStore.getState().accounts).toEqual(mockAccounts)
    expect(useAccountStore.getState().isLoading).toBe(false)
  })

  it('handles API errors via ApiErrors.throw', async () => {
    const mockError = { status: 500, message: 'Internal Server Error' }
    vi.mocked(api.accounts.list).mockResolvedValue([mockError, null])

    await useAccountStore.getState().fetchAccounts({ page: 1, limit: 12 })

    expect(useAccountStore.getState().accounts).toEqual([])
    expect(useAccountStore.getState().isLoading).toBe(false)
  })

  it('prevents concurrent fetches (loading guard)', async () => {
    vi.mocked(api.accounts.list).mockResolvedValue([
      null,
      { data: [], meta: { total: 0 } }
    ])

    useAccountStore.setState({ isLoading: true })
    await useAccountStore.getState().fetchAccounts({ page: 1, limit: 12 })

    expect(api.accounts.list).not.toHaveBeenCalled()
  })
})
```

### Component with Store Integration

```typescript
import { renderWithProviders } from '@gengar/tests'
import { createAccountMock } from '@gengar/sdk/mocks'
import { useAccountStore } from '@/store/account.store'
import { screen, waitFor } from '@testing-library/react'

describe('AccountList', () => {
  beforeEach(() => {
    useAccountStore.getState().resetStore()
  })

  it('shows loading skeleton while fetching', () => {
    useAccountStore.setState({ isLoading: true })

    renderWithProviders(<AccountList />)

    expect(screen.getByLabelText(/loading/i)).toBeInTheDocument()
  })

  it('shows empty state when no accounts exist', () => {
    useAccountStore.setState({ accounts: [], isLoading: false })

    renderWithProviders(<AccountList />)

    expect(screen.getByText(/nenhuma conta/i)).toBeInTheDocument()
  })

  it('renders account cards when data is available', () => {
    const accounts = [
      createAccountMock({ name: 'Empresa A' }),
      createAccountMock({ name: 'Empresa B' })
    ]
    useAccountStore.setState({ accounts, isLoading: false })

    renderWithProviders(<AccountList />)

    expect(screen.getByText('Empresa A')).toBeInTheDocument()
    expect(screen.getByText('Empresa B')).toBeInTheDocument()
  })
})
```

### Form Validation Tests

```typescript
import { renderWithProviders } from '@gengar/tests'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('AccountForm', () => {
  it('shows validation errors for empty required fields', async () => {
    renderWithProviders(<AccountForm onSubmit={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.getByText(/nome é obrigatório/i)).toBeInTheDocument()
    })
  })

  it('submits form with valid data', async () => {
    const onSubmit = vi.fn()
    renderWithProviders(<AccountForm onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText(/nome/i), 'Empresa Teste')
    await userEvent.type(screen.getByLabelText(/documento/i), '12.345.678/0001-90')
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Empresa Teste' })
      )
    })
  })
})
```

### SDK Service Tests (Server Components)

```typescript
import { api } from '@gengar/sdk/runtime/api'
import { createAccountMock } from '@gengar/sdk/mocks'

vi.mock('@gengar/sdk/runtime/api')

describe('fetchAccountData', () => {
  it('returns account data on success', async () => {
    const mockAccount = createAccountMock({ id: '123', name: 'Test' })
    vi.mocked(api.accounts.retrieve).mockResolvedValue([null, mockAccount])

    const result = await fetchAccountData('123')

    expect(result).toEqual(mockAccount)
  })

  it('throws when API returns error', async () => {
    vi.mocked(api.accounts.retrieve).mockResolvedValue([
      { status: 404, message: 'Not found' },
      null
    ])

    await expect(fetchAccountData('invalid')).rejects.toThrow()
  })
})
```

---

## Test File Organization

Tests are **co-located** with source files:

```
src/
├── components/
│   ├── account-card.tsx
│   └── account-card.spec.tsx          # Unit test
├── store/
│   ├── account.store.ts
│   └── account.store.spec.ts          # Store unit test
├── data/
│   └── schemas/
│       ├── account.schema.ts
│       └── account.schema.spec.ts     # Schema validation test
└── modules/
    └── os/
        └── account/
            ├── account-list.tsx
            └── account-list.spec.tsx   # Component test
```

---

## Mocking Patterns

### SDK API Mock

```typescript
vi.mock('@gengar/sdk/runtime/api')

// Return success tuple
vi.mocked(api.accounts.list).mockResolvedValue([
  null,
  { data: [createAccountMock()], meta: { total: 1 } }
])

// Return error tuple
vi.mocked(api.accounts.list).mockResolvedValue([
  { status: 500, message: 'Server Error' },
  null
])
```

### i18n Mock (when needed)

```typescript
vi.mock('@gengar/i18n', () => ({
  useTranslations: () => (key: string) => key,
  getTranslator: () => (key: string) => key
}))
```

### Event Emitter Mock

```typescript
import { eventEmitter } from '@/shared/lib/event-emitter.utils' // Customer FSD — ID uses `@/features/invitations` helpers

vi.mock('@/utils/event-emitter', () => ({
  eventEmitter: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  }
}))

// Verify event was emitted
expect(eventEmitter.emit).toHaveBeenCalledWith('account:created', { accountId: '123' })
```

### Analytics Mock

```typescript
vi.mock('@gengar/analytics', () => ({
  Analytics: { capture: vi.fn() },
  EventsKey: { ACCOUNT_CREATED: 'account_created' }
}))
```

---

## Running Tests

```bash
pnpm test:affected                # Changed packages + dependents (default local workflow)
pnpm test                         # Full suite — all packages (pre-push / CI baseline)
pnpm test:unit                    # Unit only
pnpm test:integration             # Integration only
pnpm test:coverage                # With v8 coverage report
npx vitest run [FILE_PATH]        # Single file
npx vitest run --watch [FILE]     # Watch mode for single file
```

---

## Common Mistakes to Avoid

### ❌ Testing Implementation Details

```typescript
// Wrong: testing internal state
expect(useAccountStore.getState().isLoading).toBe(true)
// after calling fetchAccounts synchronously
```

### ✅ Test User-Visible Behavior

```typescript
// Right: test what the user sees
renderWithProviders(<AccountList />)
expect(screen.getByLabelText(/loading/i)).toBeInTheDocument()
```

### ❌ Using try/catch Around SDK Tuples

```typescript
// Wrong: SDK already returns tuples
try {
  const response = await api.accounts.list()
} catch (e) { ... }
```

### ✅ Test Tuple Error Path

```typescript
// Right: mock the error tuple
vi.mocked(api.accounts.list).mockResolvedValue([
  { status: 500, message: 'Error' }, null
])
await store.fetchAccounts()
expect(store.accounts).toEqual([])
```

### ❌ Hand-Rolling Mock Objects

```typescript
// Wrong: manual mock that drifts from API spec
const account = { id: '1', name: 'Test' }
```

### ✅ Use Generated Mock Factories

```typescript
// Right: stays in sync with OpenAPI spec
const account = createAccountMock({ name: 'Test' })
```

### ❌ Tests That Depend on Each Other

```typescript
// Wrong: second test depends on first
it('creates account', () => { ... })
it('updates the created account', () => { /* uses account from above */ })
```

### ✅ Independent Tests with Own Setup

```typescript
// Right: each test is self-contained
it('creates account', () => {
  const account = createAccountMock()
  // ...
})
it('updates account', () => {
  const account = createAccountMock()
  // ...
})
```

---

## Git Checkpoint Strategy

The preferred compact workflow:
1. One commit for failing test added and RED validated
2. One commit for minimal fix applied and GREEN validated
3. One optional commit for refactor complete

```bash
git commit -m "test: add failing tests for <feature>"
git commit -m "feat: implement <feature>"
git commit -m "refactor: clean up <feature> implementation"
```

---

## Best Practices Summary

1. **Write tests first** — always TDD
2. **One behavior per `it()`** — focused assertions
3. **Descriptive test names** — describe expected behavior, not implementation
4. **Arrange → Act → Assert** — clear structure
5. **Use `@gengar/sdk/mocks`** — never hand-roll API shapes
6. **Use `renderWithProviders`** — includes all necessary providers
7. **Prefer `userEvent` over `fireEvent`** — realistic interactions
8. **Reset stores in `beforeEach`** — `store.getState().resetStore()`
9. **Mock SDK at module level** — `vi.mock('@gengar/sdk/runtime/api')`
10. **Test error tuples** — not just happy paths
