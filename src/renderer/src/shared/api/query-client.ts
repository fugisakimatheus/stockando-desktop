import { QueryClient } from '@tanstack/react-query'

const ONE_MINUTE = 60 * 1000

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      retryDelay: 600,
      gcTime: ONE_MINUTE * 5, // 5 minutes
      staleTime: ONE_MINUTE * 5, // 5 minutes
      refetchOnWindowFocus: true
    }
  }
})

export { queryClient }
