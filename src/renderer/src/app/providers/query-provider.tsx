import { queryClient } from '@shared/api'
import { QueryClientProvider } from '@tanstack/react-query'
import { type PropsWithChildren } from 'react'

function QueryProvider({ children }: PropsWithChildren): React.JSX.Element {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

export { QueryProvider }
