import { apiClient } from '@shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppSettings {
  theme: string
  lastActiveCompanyId: string
  [key: string]: string
}

interface CompanySettings {
  id: number
  companyId: number
  companyName: string
  taxRegime: string | null
  currencyCode: string
  fiscalEnvironment: string
  invoiceSeries: string | null
  createdAt: string
  updatedAt: string
}

interface UpdateCompanySettingsInput {
  companyId: number
  taxRegime?: string | null
  currencyCode?: string
  fiscalEnvironment?: string
  invoiceSeries?: string | null
}

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const settingsKeys = {
  app: ['settings', 'app'] as const,
  company: (companyId: number) => ['settings', 'company', companyId] as const
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches app-level settings (theme, lastActiveCompanyId, etc.).
 */
function useAppSettings() {
  return useQuery({
    queryKey: settingsKeys.app,
    queryFn: () => apiClient<AppSettings>('/settings')
  })
}

/**
 * Fetches company-scoped settings for the given company ID.
 * The query is disabled when companyId is 0 or negative.
 */
function useCompanySettings(companyId: number) {
  return useQuery({
    queryKey: settingsKeys.company(companyId),
    queryFn: () => apiClient<CompanySettings>(`/companies/${companyId}/settings`),
    enabled: companyId > 0
  })
}

/**
 * Mutation to update app-level settings.
 * Invalidates the app settings cache on success.
 */
function useUpdateAppSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (settings: Record<string, string>) =>
      apiClient<AppSettings>('/settings', { method: 'PUT', body: settings }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.app })
    }
  })
}

/**
 * Mutation to update company-level settings.
 * Invalidates the corresponding company settings cache on success.
 */
function useUpdateCompanySettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateCompanySettingsInput) => {
      const { companyId, ...body } = input
      return apiClient<CompanySettings>(`/companies/${companyId}/settings`, {
        method: 'PUT',
        body
      })
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: settingsKeys.company(variables.companyId)
      })
    }
  })
}

export { settingsKeys, useAppSettings, useCompanySettings, useUpdateAppSettings, useUpdateCompanySettings }
export type { AppSettings, CompanySettings, UpdateCompanySettingsInput }
