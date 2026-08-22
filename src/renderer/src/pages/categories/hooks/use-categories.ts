/**
 * Re-exports from shared hooks.
 *
 * Categories hooks live in @shared/hooks because they are consumed by multiple
 * pages (categories, products).
 */
export {
  categoryKeys,
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory
} from '@shared/hooks/use-categories'
export type { Category, CreateCategoryInput, UpdateCategoryInput } from '@shared/hooks/use-categories'
