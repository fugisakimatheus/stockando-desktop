/**
 * Fiscal file path generation utilities.
 *
 * Generates structured file paths for fiscal document storage (XML and DANFE)
 * following the pattern: {companyId}/fiscal/{year}/{month}/{typeDir}/{documentNumber}/{fileName}
 *
 * This layout aligns with the backup feature archive structure.
 *
 * Requirements: 6.5
 */

import { match } from 'ts-pattern'

import type { FiscalDocumentType } from '../types/finance'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FiscalFilePathParams {
  companyId: number
  year: number
  month: number // 1-12
  documentType: FiscalDocumentType
  documentNumber: string
  fileName: string
}

export interface FiscalFilePathFromDateParams {
  companyId: number
  issueDate: string // ISO date string
  documentType: FiscalDocumentType
  documentNumber: string
  fileName: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps a FiscalDocumentType to its directory name.
 */
function getTypeDir(documentType: FiscalDocumentType): string {
  return match(documentType)
    .with('NF-e', () => 'nfe')
    .with('NFC-e', () => 'nfce')
    .exhaustive()
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates the structured file path for a fiscal document file.
 *
 * @param params - Path generation parameters with explicit year and month
 * @returns The relative path: `{companyId}/fiscal/{year}/{paddedMonth}/{typeDir}/{documentNumber}/{fileName}`
 */
export function getFiscalFilePath(params: FiscalFilePathParams): string {
  const { companyId, year, month, documentType, documentNumber, fileName } = params
  const typeDir = getTypeDir(documentType)
  const paddedMonth = String(month).padStart(2, '0')

  return `${companyId}/fiscal/${year}/${paddedMonth}/${typeDir}/${documentNumber}/${fileName}`
}

/**
 * Convenience wrapper that extracts year and month from an ISO date string
 * and delegates to `getFiscalFilePath`.
 *
 * @param params - Path generation parameters with an ISO date string
 * @returns The relative path: `{companyId}/fiscal/{year}/{paddedMonth}/{typeDir}/{documentNumber}/{fileName}`
 */
export function getFiscalFilePathFromDate(params: FiscalFilePathFromDateParams): string {
  const { companyId, issueDate, documentType, documentNumber, fileName } = params
  const date = new Date(issueDate)

  return getFiscalFilePath({
    companyId,
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    documentType,
    documentNumber,
    fileName
  })
}
