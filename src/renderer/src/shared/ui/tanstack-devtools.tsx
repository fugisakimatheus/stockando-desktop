import { TanStackDevtools } from '@tanstack/react-devtools'
import { hotkeysDevtoolsPlugin } from '@tanstack/react-hotkeys-devtools'
import { pacerDevtoolsPlugin } from '@tanstack/react-pacer-devtools'
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'
import type { RouterProps } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'

type TanstackDevtoolsProps = {
  router?: RouterProps['router']
}

export function TanstackDevtools({ router }: TanstackDevtoolsProps) {
  return (
    <TanStackDevtools
      config={{ position: 'bottom-right', hideUntilHover: false }}
      plugins={[
        {
          name: 'TanStack Query',
          render: <ReactQueryDevtoolsPanel />,
          defaultOpen: true
        },
        {
          name: 'TanStack Router',
          render: <TanStackRouterDevtoolsPanel router={router} />,
          defaultOpen: false
        },
        hotkeysDevtoolsPlugin(),
        pacerDevtoolsPlugin()
      ]}
    />
  )
}
