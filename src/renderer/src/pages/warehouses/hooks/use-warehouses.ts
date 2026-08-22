/**
 * Re-exports from shared hooks.
 *
 * Warehouses hooks live in @shared/hooks because they are consumed by multiple
 * pages (warehouses, stock, purchase-orders, stock-movements, stock-adjustments).
 */
export {
  useCreateWarehouse,
  useDeleteWarehouse,
  useUpdateWarehouse,
  useWarehouses,
  warehouseKeys
} from '@shared/hooks/use-warehouses'
export type { CreateWarehouseInput, UpdateWarehouseInput, Warehouse } from '@shared/hooks/use-warehouses'
