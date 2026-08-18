---
inclusion: fileMatch
fileMatchPattern: "**/*.{ts,tsx}"
---

# ts-pattern Usage

Guidelines for using `ts-pattern` for pattern matching in the codebase. Prefer `match` over chains of `if/else` or `switch` statements when dealing with discriminated unions, complex conditionals, or state transitions.

## Import Convention

Always import `match` and `P` from `ts-pattern`:

```ts
import { match, P } from 'ts-pattern'
```

Use `P` (not `Pattern`) as the namespace for wildcards and matchers.

## When to Use ts-pattern

Use pattern matching when:

- Branching on discriminated unions (e.g., state machines, event handlers, API responses).
- Handling multiple variants of a type in a single expression.
- You need exhaustiveness checking to ensure all cases are covered.
- Deep matching on nested objects would require verbose destructuring.
- Replacing complex `if/else` chains or `switch` statements with more readable code.

Do not use pattern matching when:

- A simple ternary or single `if` statement is sufficient.
- The branching logic has only 1-2 trivial cases.
- Performance-critical hot paths where the overhead is unjustified (rare in practice).

## Exhaustiveness

Prefer `.exhaustive()` to guarantee all cases of a union are handled at compile time. This prevents silent bugs when new variants are added.

```ts
type Status = 'idle' | 'loading' | 'success' | 'error'

const label = match(status)
  .with('idle', () => 'Ready')
  .with('loading', () => 'Loading...')
  .with('success', () => 'Done')
  .with('error', () => 'Failed')
  .exhaustive()
```

Use `.otherwise(handler)` only when there is a genuine default/fallback case:

```ts
const label = match(status)
  .with('error', () => 'Something went wrong')
  .otherwise(() => 'OK')
```

Avoid `.run()` as it skips exhaustiveness checking.

## Return Type

Use `.returnType<T>()` when the inferred return type is too wide or when you want to enforce a specific output type across all branches:

```ts
const result = match(event)
  .returnType<State>()
  .with({ type: 'fetch' }, () => ({ status: 'loading' as const, startTime: Date.now() }))
  .with({ type: 'cancel' }, () => ({ status: 'idle' as const }))
  .exhaustive()
```

## Pattern Styles

### Discriminated Unions

Match on the discriminant property directly:

```ts
type Action =
  | { type: 'increment'; amount: number }
  | { type: 'decrement'; amount: number }
  | { type: 'reset' }

const next = match(action)
  .with({ type: 'increment' }, ({ amount }) => count + amount)
  .with({ type: 'decrement' }, ({ amount }) => count - amount)
  .with({ type: 'reset' }, () => 0)
  .exhaustive()
```

### Nested Objects

Match deeply nested structures without verbose destructuring:

```ts
const message = match(response)
  .with({ status: 'ok', data: { type: 'text' } }, (res) => res.data.content)
  .with({ status: 'ok', data: { type: 'img' } }, (res) => res.data.src)
  .with({ status: 'error' }, (res) => res.error.message)
  .exhaustive()
```

### Tuples

Use tuple patterns for matching on multiple values simultaneously (state + event, coordinates, etc.):

```ts
const next = match([state, event] as const)
  .with([{ status: 'idle' }, { type: 'fetch' }], () => ({ status: 'loading' as const }))
  .with([{ status: 'loading' }, { type: 'success' }], ([, e]) => ({ status: 'success' as const, data: e.data }))
  .with([{ status: 'loading' }, { type: 'error' }], ([, e]) => ({ status: 'error' as const, error: e.error }))
  .otherwise(() => state)
```

## Wildcards and Matchers

Use typed wildcards to match by type:

```ts
match(value)
  .with(P.string, (s) => s.toUpperCase())
  .with(P.number, (n) => n.toFixed(2))
  .with(P.nullish, () => 'N/A')
  .otherwise(() => 'unknown')
```

Common wildcards:
- `P._` or `P.any` — matches anything.
- `P.string`, `P.number`, `P.boolean`, `P.bigint`, `P.symbol` — type-specific.
- `P.nullish` — matches `null | undefined`.
- `P.nonNullable` — matches everything except `null` and `undefined`.

## P.select

Use `P.select()` to extract deeply nested values without manual destructuring:

```ts
// Anonymous selection (single value)
match(input)
  .with({ type: 'post', user: { name: P.select() } }, (name) => `Author: ${name}`)
  .otherwise(() => 'unknown')

// Named selections (multiple values)
match(input)
  .with(
    { user: { name: P.select('name') }, content: P.select('body') },
    ({ name, body }) => `${name}: ${body}`
  )
  .otherwise(() => '')
```

## P.not

Use `P.not(pattern)` to match everything except a specific value or shape:

```ts
match(state)
  .with({ status: P.not('loading') }, () => startFetch())
  .otherwise(() => /* already loading */)
```

## P.when (Guards)

Use `P.when(predicate)` inside patterns for conditions that can't be expressed structurally:

```ts
match(input)
  .with({ age: P.when((age) => age >= 18) }, () => 'adult')
  .with({ age: P.number }, () => 'minor')
  .exhaustive()
```

You can also pass a guard as the second argument to `.with()`:

```ts
match(request)
  .with(
    { status: 'loading' },
    (req) => req.startTime + 5000 < Date.now(),
    () => ({ status: 'timeout' as const })
  )
  .otherwise(() => state)
```

## P.union and P.intersection

Use `P.union` to handle multiple variants in a single branch:

```ts
match(input)
  .with({ type: P.union('img', 'video') }, (media) => renderMedia(media))
  .with({ type: 'text' }, (text) => renderText(text))
  .exhaustive()
```

Use `P.intersection` when a value must satisfy multiple patterns simultaneously:

```ts
match(input)
  .with({ value: P.intersection(P.instanceOf(Base), { active: true }) }, ({ value }) => value)
  .otherwise(() => null)
```

## P.optional

Use `P.optional(subpattern)` for object keys that may or may not be present:

```ts
match(config)
  .with({ timeout: P.optional(P.number) }, ({ timeout }) => timeout ?? 3000)
  .otherwise(() => 3000)
```

## P.array and P.record

Use `P.array(subpattern)` for arrays of unknown length:

```ts
match(input)
  .with(P.array({ type: 'post', title: P.string }), (posts) => posts.map(renderPost))
  .otherwise(() => [])
```

Use `P.record(keyPattern, valuePattern)` for record/dictionary types:

```ts
match(scores)
  .with(P.record(P.string, P.number), (s) => Object.values(s).reduce((a, b) => a + b, 0))
  .otherwise(() => 0)
```

## String and Number Predicates

Use built-in predicate chains for refined matching:

```ts
// String predicates
match(input)
  .with(P.string.startsWith('http'), (url) => fetch(url))
  .with(P.string.includes('@'), (email) => sendEmail(email))
  .with(P.string.minLength(1), (s) => s)
  .otherwise(() => '')

// Number predicates
match(input)
  .with(P.number.between(1, 5), (n) => `Rating: ${n}`)
  .with(P.number.positive(), (n) => `+${n}`)
  .with(P.number.int(), (n) => `Integer: ${n}`)
  .otherwise(() => 'invalid')
```

## isMatching (Type Guards)

Use `isMatching` as a standalone type guard for runtime validation:

```ts
import { isMatching, P } from 'ts-pattern'

const isProduct = isMatching({
  id: P.string,
  name: P.string,
  price: P.number,
})

if (isProduct(data)) {
  // data is narrowed to { id: string; name: string; price: number }
}
```

Use the curried form for reusable guards and array filtering:

```ts
const isActive = isMatching({ status: 'active' as const })
const activeItems = items.filter(isActive)
```

## P.infer for Type Extraction

Use `P.infer` to derive types from patterns — useful for API response validation:

```ts
const productPattern = {
  id: P.string,
  name: P.string,
  price: P.number,
  category: P.optional(P.string),
} as const

type Product = P.infer<typeof productPattern>
```

## Anti-patterns

- Do not nest `match` inside another `match` handler — extract to a separate function instead.
- Do not use `P._` as the first clause — it would swallow all cases and make subsequent clauses dead code.
- Do not mix `.exhaustive()` and `.otherwise()` — pick one.
- Do not use `.run()` when exhaustiveness is possible.
- Do not use `match` for trivial boolean checks — a simple `if` is clearer.
- Avoid overly complex patterns that reduce readability — break them into smaller helper functions.

## Formatting

Keep match expressions readable:

- One `.with()` per line.
- Align patterns and handlers consistently.
- For long patterns, break the pattern onto its own line.
- Keep handler functions concise — extract complex logic to named functions.

```ts
// Preferred formatting
const result = match(input)
  .with({ type: 'a' }, handleA)
  .with({ type: 'b' }, handleB)
  .with({ type: 'c' }, handleC)
  .exhaustive()
```
