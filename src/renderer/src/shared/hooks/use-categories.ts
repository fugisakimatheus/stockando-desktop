import { createCategory, deleteCategory, listCategories, updateCategory } from '@shared/api'
import type { Category, CreateCategoryInput, UpdateCategoryInput } from '@shared/api'
import { createSimpleQueryHooks } from '@shared/lib'

// ---------------------------------------------------------------------------
// Generated hooks via factory
// ---------------------------------------------------------------------------

const {
  keys: categoryKeys,
  useList: useCategories,
  useCreate: useCreateCategory,
  useUpdate: useUpdateCategory,
  useDelete: useDeleteCategory
} = createSimpleQueryHooks<Category, CreateCategoryInput, UpdateCategoryInput>({
  domain: 'categories',
  list: (companyId) => listCategories(companyId),
  create: (companyId, input) => createCategory(companyId, input),
  update: (companyId, id, data) => updateCategory(companyId, id, data),
  delete: (companyId, id) => deleteCategory(companyId, id)
})

export { categoryKeys, useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory }
export type { Category, CreateCategoryInput, UpdateCategoryInput }
