import { BootstrapGate } from '@app/ui/bootstrap-gate'
import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from '@tanstack/react-router'

const rootRoute = createRootRoute({
  component: BootstrapGate,
  notFoundComponent: lazyRouteComponent(() => import('@pages/not-found/ui/not-found-page'), 'NotFoundPage')
})

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: lazyRouteComponent(() => import('@pages/home/ui/home-page'), 'HomePage')
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: lazyRouteComponent(() => import('@pages/settings/ui/settings-page'), 'SettingsPage')
})

const productsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/products',
  component: lazyRouteComponent(() => import('@pages/products/ui/products-page'), 'ProductsPage')
})

const categoriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/categories',
  component: lazyRouteComponent(() => import('@pages/categories/ui/categories-page'), 'CategoriesPage')
})

const routeTree = rootRoute.addChildren([homeRoute, settingsRoute, productsRoute, categoriesRoute])

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export { router }
