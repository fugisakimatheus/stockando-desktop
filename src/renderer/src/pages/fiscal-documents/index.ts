export { FiscalDocumentsPage } from './ui/fiscal-documents-page'
export { FiscalDocumentDetailPage } from './ui/fiscal-document-detail-page'

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
} from './hooks/use-fiscal-documents'
export type {
  FiscalDocumentListFilters,
  FiscalDocumentListItem,
  FiscalDocumentDetail,
  FiscalPaginatedResult,
  CreateFiscalDocumentInput,
  AuthorizeFiscalInput,
  CancelFiscalInput,
  AttachmentRecord
} from './hooks/use-fiscal-documents'
