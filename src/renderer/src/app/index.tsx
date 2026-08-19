import './styles/globals.css'
import { TanstackDevtools } from '@renderer/shared/ui'
import { Toaster } from '@shared/ui/sonner'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { QueryProvider } from './providers/query-provider'
import { ThemeProvider } from './providers/theme-provider'
import { router } from './router'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <QueryProvider>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" richColors closeButton />
        <TanstackDevtools router={router} />
      </QueryProvider>
    </ThemeProvider>
  </StrictMode>
)
