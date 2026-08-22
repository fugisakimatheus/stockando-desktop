import { createUnit, deleteUnit, listUnitsOfMeasure, updateUnit } from '@shared/api'
import type { CreateUnitInput, UnitOfMeasure, UpdateUnitInput } from '@shared/api'
import { createSimpleQueryHooks } from '@shared/lib'

// ---------------------------------------------------------------------------
// Generated hooks via factory
// ---------------------------------------------------------------------------

const {
  keys: unitOfMeasureKeys,
  useList: useUnitsOfMeasure,
  useCreate: useCreateUnit,
  useUpdate: useUpdateUnit,
  useDelete: useDeleteUnit
} = createSimpleQueryHooks<UnitOfMeasure, CreateUnitInput, UpdateUnitInput>({
  domain: 'units-of-measure',
  list: (companyId) => listUnitsOfMeasure(companyId),
  create: (companyId, input) => createUnit(companyId, input),
  update: (companyId, id, data) => updateUnit(companyId, id, data),
  delete: (companyId, id) => deleteUnit(companyId, id)
})

export { unitOfMeasureKeys, useCreateUnit, useDeleteUnit, useUnitsOfMeasure, useUpdateUnit }
export type { CreateUnitInput, UnitOfMeasure, UpdateUnitInput }
