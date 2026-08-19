import { BootstrapGate } from '@app/ui/bootstrap-gate'
import { createRootRoute, createRoute, createRouter, lazyRouteComponent, useParams } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'

const LazyProductDetailPage = lazy(() =>
  import('@pages/products/ui/product-detail-page').then((m) => ({
    default: m.ProductDetailPage
  }))
)

function ProductDetailRouteComponent(): React.JSX.Element {
  const { id } = useParams({ strict: false })
  const productId = Number(id)

  return (
    <Suspense fallback={null}>
      <LazyProductDetailPage productId={productId} />
    </Suspense>
  )
}

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

const productDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/products/$id',
  component: ProductDetailRouteComponent
})

const categoriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/categories',
  component: lazyRouteComponent(() => import('@pages/categories/ui/categories-page'), 'CategoriesPage')
})

const unitsOfMeasureRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/units-of-measure',
  component: lazyRouteComponent(() => import('@pages/units-of-measure/ui/units-of-measure-page'), 'UnitsOfMeasurePage')
})

const warehousesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/warehouses',
  component: lazyRouteComponent(() => import('@pages/warehouses/ui/warehouses-page'), 'WarehousesPage')
})

const stockRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/stock',
  component: lazyRouteComponent(() => import('@pages/stock/ui/stock-overview-page'), 'StockOverviewPage')
})

const stockMovementsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/stock-movements',
  component: lazyRouteComponent(() => import('@pages/stock-movements/ui/stock-movements-page'), 'StockMovementsPage')
})

const stockAdjustmentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/stock-adjustments',
  component: lazyRouteComponent(
    () => import('@pages/stock-adjustments/ui/stock-adjustment-page'),
    'StockAdjustmentPage'
  )
})

const routeTree = rootRoute.addChildren([
  homeRoute,
  settingsRoute,
  productsRoute,
  productDetailRoute,
  categoriesRoute,
  unitsOfMeasureRoute,
  warehousesRoute,
  stockRoute,
  stockMovementsRoute,
  stockAdjustmentsRoute
])

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export { router }
