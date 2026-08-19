import { apiClient } from '@shared/api'
import { useQuery } from '@tanstack/react-query'

interface BootstrapCompany {
  id: number
  name: string
  documentNumber: string
  status: string
}

interface BootstrapData {
  status: 'ready'
  lastActiveCompanyId: number | null
  companies: BootstrapCompany[]
}

const bootstrapKeys = {
  all: ['bootstrap'] as const
}

function useBootstrap() {
  return useQuery({
    queryKey: bootstrapKeys.all,
    queryFn: () => apiClient<BootstrapData>('/bootstrap'),
    staleTime: Infinity,
    retry: 1,
    refetchOnWindowFocus: false
  })
}

export { bootstrapKeys, useBootstrap }
export type { BootstrapData, BootstrapCompany }
