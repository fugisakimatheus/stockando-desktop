import { listUnitsOfMeasure, createUnit, updateUnit, deleteUnit } from '@shared/api'
import type { UnitOfMeasure, CreateUnitInput, UpdateUnitInput } from '@shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const unitOfMeasureKeys = {
  all: (companyId: number) => [companyId, 'units-of-measure'] as const,
  list: (companyId: number) => [...unitOfMeasureKeys.all(companyId), 'list'] as const
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches all units of measure for the given company.
 */
function useUnitsOfMeasure(companyId: number) {
  return useQuery({
    queryKey: unitOfMeasureKeys.list(companyId),
    queryFn: () => listUnitsOfMeasure(companyId)
  })
}

/**
 * Mutation to create a new unit of measure.
 * Invalidates the units of measure list cache on success.
 */
function useCreateUnit(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateUnitInput) => createUnit(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: unitOfMeasureKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to update an existing unit of measure.
 * Invalidates the units of measure list cache on success.
 */
function useUpdateUnit(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...data }: UpdateUnitInput & { id: number }) => updateUnit(companyId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: unitOfMeasureKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to delete a unit of measure.
 * Invalidates the units of measure list cache on success.
 */
function useDeleteUnit(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => deleteUnit(companyId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: unitOfMeasureKeys.all(companyId) })
    }
  })
}

export { unitOfMeasureKeys, useUnitsOfMeasure, useCreateUnit, useUpdateUnit, useDeleteUnit }
export type { UnitOfMeasure, CreateUnitInput, UpdateUnitInput }
