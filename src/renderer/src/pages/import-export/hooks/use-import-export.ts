import { validateImport, confirmImport, exportEntities } from '@shared/api'
import type {
  ImportableEntityType,
  ImportDelimiter,
  ValidateImportInput,
  ImportRowError,
  ImportRowValidation,
  ImportValidationResult,
  ConfirmImportInput,
  ImportCommitResult,
  ExportableEntityType,
  EntityExportFilters,
  ExportEntitiesInput,
  EntityExportFileResult
} from '@shared/api'
import { useMutation } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Mutation to validate a CSV file for import.
 * Returns an ImportValidationResult with row-level statuses
 * and expected changes (creates/updates).
 */
function useValidateImport(companyId: number) {
  return useMutation({
    mutationFn: (input: ValidateImportInput) => validateImport(companyId, input)
  })
}

/**
 * Mutation to confirm a previously validated import.
 * Commits valid rows transactionally and returns a summary.
 */
function useConfirmImport(companyId: number) {
  return useMutation({
    mutationFn: (input: ConfirmImportInput) => confirmImport(companyId, input)
  })
}

/**
 * Mutation to export entity data to CSV.
 * Returns the file path, file size, and record count.
 */
function useExportEntities(companyId: number) {
  return useMutation({
    mutationFn: (input: ExportEntitiesInput) => exportEntities(companyId, input)
  })
}

export { useValidateImport, useConfirmImport, useExportEntities }
export type {
  ImportableEntityType,
  ImportDelimiter,
  ValidateImportInput,
  ImportRowError,
  ImportRowValidation,
  ImportValidationResult,
  ConfirmImportInput,
  ImportCommitResult,
  ExportableEntityType,
  EntityExportFilters,
  ExportEntitiesInput,
  EntityExportFileResult
}
