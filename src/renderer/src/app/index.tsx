import './styles/globals.css'
import { TanstackDevtools } from '@renderer/shared/ui'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { QueryProvider } from './providers/query-provider'
import { router } from './router'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryProvider>
      <RouterProvider router={router} />
      <TanstackDevtools router={router} />
    </QueryProvider>
  </StrictMode>
)
