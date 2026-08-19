import { listCategories, createCategory, updateCategory, deleteCategory } from '@shared/api'
import type { Category, CreateCategoryInput, UpdateCategoryInput } from '@shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const categoryKeys = {
  all: (companyId: number) => [companyId, 'categories'] as const,
  list: (companyId: number) => [...categoryKeys.all(companyId), 'list'] as const
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches all categories for the given company.
 */
function useCategories(companyId: number) {
  return useQuery({
    queryKey: categoryKeys.list(companyId),
    queryFn: () => listCategories(companyId)
  })
}

/**
 * Mutation to create a new category.
 * Invalidates the categories list cache on success.
 */
function useCreateCategory(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateCategoryInput) => createCategory(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to update an existing category.
 * Invalidates the categories list cache on success.
 */
function useUpdateCategory(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...data }: UpdateCategoryInput & { id: number }) => updateCategory(companyId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to delete a category.
 * Invalidates the categories list cache on success.
 */
function useDeleteCategory(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => deleteCategory(companyId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all(companyId) })
    }
  })
}

export { categoryKeys, useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory }
export type { Category, CreateCategoryInput, UpdateCategoryInput }
