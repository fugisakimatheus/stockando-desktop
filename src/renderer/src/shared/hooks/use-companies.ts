import { apiClient } from '@shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Types (matching server response shape from Drizzle `companies` table)
// ---------------------------------------------------------------------------

interface Company {
  id: number
  name: string
  documentNumber: string
  tradeName: string | null
  status: string
  createdAt: string
  updatedAt: string
}

interface CreateCompanyInput {
  name: string
  documentNumber: string
  tradeName?: string | null
}

interface UpdateCompanyInput {
  id: number
  name?: string
  tradeName?: string | null
}

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const companyKeys = {
  all: ['companies'] as const,
  lists: () => [...companyKeys.all, 'list'] as const,
  detail: (id: number) => [...companyKeys.all, 'detail', id] as const
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches all companies from the API.
 */
function useCompanies() {
  return useQuery({
    queryKey: companyKeys.lists(),
    queryFn: () => apiClient<Company[]>('/companies')
  })
}

/**
 * Mutation to create a new company.
 * Invalidates the companies list cache on success.
 */
function useCreateCompany() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateCompanyInput) => apiClient<Company>('/companies', { method: 'POST', body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyKeys.all })
    }
  })
}

/**
 * Mutation to update an existing company.
 * Invalidates the companies list cache on success.
 */
function useUpdateCompany() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...data }: UpdateCompanyInput) =>
      apiClient<Company>(`/companies/${id}`, { method: 'PUT', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyKeys.all })
    }
  })
}

export { companyKeys, useCompanies, useCreateCompany, useUpdateCompany }
export type { Company, CreateCompanyInput, UpdateCompanyInput }
