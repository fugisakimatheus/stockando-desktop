import { apiClient } from '@shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

/**
 * Minimal company shape returned by the bootstrap endpoint.
 */
interface BootstrapCompany {
  id: number
  name: string
  documentNumber: string
  status: string
}

/**
 * Response shape from `GET /api/bootstrap`.
 */
interface BootstrapData {
  status: 'ready'
  lastActiveCompanyId: number | null
  companies: BootstrapCompany[]
}

/**
 * Response shape from `PUT /api/settings/active-company`.
 */
interface SetActiveCompanyResponse {
  lastActiveCompanyId: number
}

/**
 * Query key factory for the active company domain.
 */
const activeCompanyKeys = {
  bootstrap: ['bootstrap'] as const,
  companies: ['companies'] as const
}

/**
 * Return type of the `useActiveCompany` hook.
 */
interface UseActiveCompanyResult {
  /** The full active company object, or null if none is selected or still loading. */
  company: BootstrapCompany | null
  /** All available companies. */
  companies: BootstrapCompany[]
  /** Whether bootstrap data is still loading. */
  isLoading: boolean
  /** Switches the active company context. */
  setActive: (companyId: number) => void
  /** Whether a company switch is currently in progress. */
  isSettingActive: boolean
}

/**
 * Hook that manages the globally active company context.
 *
 * - Fetches bootstrap data to resolve the initial active company
 * - Provides `setActive` to switch companies via `PUT /api/settings/active-company`
 * - On switch, invalidates all company-scoped queries so views refetch with new context
 * - Returns loading state for bootstrap resolution
 *
 * Requirements: 2.1, 2.2, 2.3, 2.6
 */
function useActiveCompany(): UseActiveCompanyResult {
  const queryClient = useQueryClient()

  const { data: bootstrapData, isLoading } = useQuery({
    queryKey: activeCompanyKeys.bootstrap,
    queryFn: () => apiClient<BootstrapData>('/bootstrap')
  })

  const activeCompanyId = bootstrapData?.lastActiveCompanyId ?? null
  const companiesList = bootstrapData?.companies ?? []

  const company = activeCompanyId ? (companiesList.find((c) => c.id === activeCompanyId) ?? null) : null

  const { mutate: setActive, isPending: isSettingActive } = useMutation({
    mutationFn: (companyId: number) =>
      apiClient<SetActiveCompanyResponse>('/settings/active-company', {
        method: 'PUT',
        body: { companyId }
      }),
    onSuccess: (_data, companyId) => {
      // Update the cached bootstrap data with the new active company ID
      queryClient.setQueryData<BootstrapData>(activeCompanyKeys.bootstrap, (prev) => {
        if (!prev) return prev
        return { ...prev, lastActiveCompanyId: companyId }
      })

      // Invalidate all company-scoped queries so views refetch with the new context.
      // We invalidate broadly — any query that isn't the bootstrap query itself.
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey
          // Keep the bootstrap query cache (we already updated it optimistically)
          if (key[0] === 'bootstrap') return false
          return true
        }
      })
    }
  })

  return {
    company,
    companies: companiesList,
    isLoading,
    setActive,
    isSettingActive
  }
}

export { useActiveCompany, activeCompanyKeys }
export type { BootstrapCompany, UseActiveCompanyResult }
