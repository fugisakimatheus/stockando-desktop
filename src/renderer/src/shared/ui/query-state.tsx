/**
 * QueryState — Compound component for declarative async state rendering.
 *
 * Eliminates the repeated if/else chain across 20+ pages:
 *   if (isLoading) → <LoadingState />
 *   if (isError) → <ErrorState />
 *   if (!data.length) → <EmptyState />
 *   else → render data
 *
 * @example Basic usage with TanStack Query
 * ```tsx
 * const productsQuery = useProducts(companyId, filters)
 *
 * <QueryState query={productsQuery} empty={(data) => data.data.length === 0}>
 *   <QueryState.Loading message="Carregando produtos..." />
 *   <QueryState.Error title="Erro ao carregar produtos" />
 *   <QueryState.Empty
 *     icon={<Package />}
 *     title="Nenhum produto encontrado"
 *     description="Crie seu primeiro produto para começar."
 *     action={<Button>Novo Produto</Button>}
 *   />
 *   <QueryState.Success>
 *     {(data) => <ProductsTable data={data} />}
 *   </QueryState.Success>
 * </QueryState>
 * ```
 *
 * @example Simplified usage (render prop on root)
 * ```tsx
 * <QueryState query={productsQuery} empty={(d) => d.data.length === 0}>
 *   {(data) => <ProductsTable data={data} />}
 * </QueryState>
 * ```
 */

import type { UseQueryResult } from '@tanstack/react-query'
import { createContext, useContext, type ReactNode } from 'react'

import { EmptyState } from './empty-state'
import { ErrorState } from './error-state'
import { LoadingState } from './loading-state'

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface QueryStateContextValue<TData = unknown> {
  query: UseQueryResult<TData>
  isEmpty: boolean
}

const QueryStateContext = createContext<QueryStateContextValue | null>(null)

function useQueryState<TData = unknown>(): QueryStateContextValue<TData> {
  const context = useContext(QueryStateContext)

  if (context === null) {
    throw new Error('QueryState.* components must be rendered inside <QueryState>')
  }

  return context as QueryStateContextValue<TData>
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

interface QueryStateRootProps<TData> {
  /** The TanStack Query result object. */
  query: UseQueryResult<TData>
  /** Predicate to determine if the data should be considered "empty". */
  empty?: (data: TData) => boolean
  /** Children can be compound sub-components or a render function for the success case. */
  children: ReactNode | ((data: TData) => ReactNode)
}

function QueryStateRoot<TData>({ query, empty, children }: QueryStateRootProps<TData>): React.JSX.Element {
  const isEmpty = query.isSuccess && empty ? empty(query.data) : false

  const contextValue: QueryStateContextValue<TData> = { query, isEmpty }

  // If children is a render function, use simplified mode
  if (typeof children === 'function') {
    if (query.isLoading) {
      return <LoadingState />
    }

    if (query.isError) {
      return <ErrorState onRetry={() => query.refetch()} />
    }

    if (isEmpty) {
      return <EmptyState title="Nenhum registro encontrado" />
    }

    return <>{children(query.data as TData)}</>
  }

  return (
    <QueryStateContext.Provider value={contextValue as QueryStateContextValue}>{children}</QueryStateContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Loading sub-component
// ---------------------------------------------------------------------------

interface QueryStateLoadingProps {
  /** Optional message to show alongside the spinner. */
  message?: string
  className?: string
}

function QueryStateLoading({ message, className }: QueryStateLoadingProps): React.JSX.Element | null {
  const { query } = useQueryState()

  if (!query.isLoading) return null

  return <LoadingState message={message} className={className} />
}

// ---------------------------------------------------------------------------
// Error sub-component
// ---------------------------------------------------------------------------

interface QueryStateErrorProps {
  title?: string
  description?: string
  className?: string
}

function QueryStateError({ title, description, className }: QueryStateErrorProps): React.JSX.Element | null {
  const { query } = useQueryState()

  if (!query.isError) return null

  return (
    <ErrorState
      title={title}
      description={description ?? query.error?.message}
      onRetry={() => query.refetch()}
      className={className}
    />
  )
}

// ---------------------------------------------------------------------------
// Empty sub-component
// ---------------------------------------------------------------------------

interface QueryStateEmptyProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

function QueryStateEmpty({
  icon,
  title,
  description,
  action,
  className
}: QueryStateEmptyProps): React.JSX.Element | null {
  const { query, isEmpty } = useQueryState()

  if (!query.isSuccess || !isEmpty) return null

  return <EmptyState icon={icon} title={title} description={description} action={action} className={className} />
}

// ---------------------------------------------------------------------------
// Success sub-component (render when data is available and not empty)
// ---------------------------------------------------------------------------

interface QueryStateSuccessProps<TData> {
  children: ((data: TData) => ReactNode) | ReactNode
}

function QueryStateSuccess<TData>({ children }: QueryStateSuccessProps<TData>): React.JSX.Element | null {
  const { query, isEmpty } = useQueryState<TData>()

  if (!query.isSuccess || isEmpty) return null

  if (typeof children === 'function') {
    return <>{children(query.data)}</>
  }

  return <>{children}</>
}

// ---------------------------------------------------------------------------
// Compound export
// ---------------------------------------------------------------------------

const QueryState = Object.assign(QueryStateRoot, {
  Loading: QueryStateLoading,
  Error: QueryStateError,
  Empty: QueryStateEmpty,
  Success: QueryStateSuccess
})

export { QueryState }
export type {
  QueryStateRootProps,
  QueryStateLoadingProps,
  QueryStateErrorProps,
  QueryStateEmptyProps,
  QueryStateSuccessProps
}
