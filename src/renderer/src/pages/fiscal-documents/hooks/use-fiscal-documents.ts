import {
  listFiscalDocuments,
  getFiscalDocumentDetail,
  createFiscalDocument,
  authorizeFiscalDocument,
  cancelFiscalDocument,
  generateDanfe,
  getFiscalDocumentXml,
  searchFiscalByAccessKey
} from '@shared/api'
import type {
  FiscalDocumentListFilters,
  FiscalDocumentListItem,
  FiscalDocumentDetail,
  FiscalPaginatedResult,
  CreateFiscalDocumentInput,
  AuthorizeFiscalInput,
  CancelFiscalInput,
  AttachmentRecord
} from '@shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const fiscalDocumentKeys = {
  all: (companyId: number) => [companyId, 'fiscal-documents'] as const,
  lists: (companyId: number) => [...fiscalDocumentKeys.all(companyId), 'list'] as const,
  list: (companyId: number, filters: FiscalDocumentListFilters) =>
    [...fiscalDocumentKeys.lists(companyId), filters] as const,
  details: (companyId: number) => [...fiscalDocumentKeys.all(companyId), 'detail'] as const,
  detail: (companyId: number, id: number) => [...fiscalDocumentKeys.details(companyId), id] as const,
  xml: (companyId: number, id: number) => [...fiscalDocumentKeys.all(companyId), 'xml', id] as const,
  search: (companyId: number, accessKey: string) => [...fiscalDocumentKeys.all(companyId), 'search', accessKey] as const
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches a paginated list of fiscal documents for the given company,
 * supporting filtering by type, status, date range, customer, and search.
 */
function useFiscalDocuments(companyId: number, filters: FiscalDocumentListFilters) {
  return useQuery({
    queryKey: fiscalDocumentKeys.list(companyId, filters),
    queryFn: () => listFiscalDocuments(companyId, filters)
  })
}

/**
 * Fetches a single fiscal document detail with items, events, and metadata.
 * Only enabled when documentId is defined.
 */
function useFiscalDocumentDetail(companyId: number, documentId: number | undefined) {
  return useQuery({
    queryKey: fiscalDocumentKeys.detail(companyId, documentId ?? 0),
    queryFn: () => getFiscalDocumentDetail(companyId, documentId as number),
    enabled: documentId !== undefined
  })
}

/**
 * Mutation to create a new fiscal document from a Sales_Order.
 * Invalidates the fiscal documents list cache on success.
 */
function useCreateFiscalDocument(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateFiscalDocumentInput) => createFiscalDocument(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fiscalDocumentKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to authorize a fiscal document (record access key, protocol, XML).
 * Invalidates fiscal documents cache on success.
 */
function useAuthorizeFiscalDocument(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...input }: AuthorizeFiscalInput & { id: number }) =>
      authorizeFiscalDocument(companyId, id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fiscalDocumentKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to cancel an authorized fiscal document.
 * Invalidates fiscal documents cache on success.
 */
function useCancelFiscalDocument(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...input }: CancelFiscalInput & { id: number }) => cancelFiscalDocument(companyId, id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fiscalDocumentKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to generate a DANFE PDF for an authorized fiscal document.
 * Invalidates fiscal documents cache on success.
 */
function useGenerateDanfe(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => generateDanfe(companyId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fiscalDocumentKeys.all(companyId) })
    }
  })
}

/**
 * Fetches the stored XML content of a fiscal document.
 * Only enabled when documentId is defined.
 */
function useFiscalDocumentXml(companyId: number, documentId: number | undefined) {
  return useQuery({
    queryKey: fiscalDocumentKeys.xml(companyId, documentId ?? 0),
    queryFn: () => getFiscalDocumentXml(companyId, documentId as number),
    enabled: documentId !== undefined
  })
}

/**
 * Searches for a fiscal document by its 44-digit access key.
 * Only enabled when accessKey is a non-empty string.
 */
function useSearchFiscalByAccessKey(companyId: number, accessKey: string) {
  return useQuery({
    queryKey: fiscalDocumentKeys.search(companyId, accessKey),
    queryFn: () => searchFiscalByAccessKey(companyId, accessKey),
    enabled: accessKey.length > 0
  })
}

export {
  fiscalDocumentKeys,
  useFiscalDocuments,
  useFiscalDocumentDetail,
  useCreateFiscalDocument,
  useAuthorizeFiscalDocument,
  useCancelFiscalDocument,
  useGenerateDanfe,
  useFiscalDocumentXml,
  useSearchFiscalByAccessKey
}
export type {
  FiscalDocumentListFilters,
  FiscalDocumentListItem,
  FiscalDocumentDetail,
  FiscalPaginatedResult,
  CreateFiscalDocumentInput,
  AuthorizeFiscalInput,
  CancelFiscalInput,
  AttachmentRecord
}
