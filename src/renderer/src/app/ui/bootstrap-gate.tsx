import { AppShell } from '@app/app-shell'
import { ApiError } from '@shared/api'
import { useBootstrap } from '@shared/hooks/use-bootstrap'
import { Spinner } from '@shared/ui/spinner'
import { Outlet } from '@tanstack/react-router'
import { useCallback } from 'react'
import { match } from 'ts-pattern'

import { BootstrapErrorScreen } from './bootstrap-error-screen'
import { NoCompaniesScreen } from './no-companies-screen'

/**
 * Gate component that wraps the app shell with bootstrap state handling.
 *
 * Renders one of:
 * - Loading spinner while bootstrap is in progress
 * - Full-screen error when bootstrap fails (database/migration issues)
 * - No-companies screen when bootstrap succeeds but no companies exist
 * - Normal AppShell + Outlet when everything is ready
 *
 * Requirements: 1.3, 1.4, 2.5, 11.3
 */
function BootstrapGate() {
  const { data, isLoading, error, refetch } = useBootstrap()

  const handleRetry = useCallback(() => {
    refetch()
  }, [refetch])

  return match({ isLoading, error, data })
    .with({ isLoading: true }, () => (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="size-6" />
          <p className="text-sm text-muted-foreground">Inicializando...</p>
        </div>
      </div>
    ))
    .when(
      ({ error }) => error != null,
      ({ error: err }) => {
        const apiErr = err instanceof ApiError ? err : null
        const message =
          apiErr?.code === 'NETWORK_ERROR'
            ? 'Não foi possível conectar ao servidor local. O aplicativo pode não ter iniciado corretamente.'
            : (apiErr?.message ?? 'Ocorreu um erro inesperado durante a inicialização.')
        return <BootstrapErrorScreen message={message} code={apiErr?.code} onRetry={handleRetry} />
      }
    )
    .when(
      ({ data }) => data != null && data.companies.length === 0,
      () => <NoCompaniesScreen />
    )
    .otherwise(() => (
      <AppShell>
        <Outlet />
      </AppShell>
    ))
}

export { BootstrapGate }
