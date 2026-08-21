import { listAttachments, uploadAttachment, deleteAttachment } from '@shared/api'
import type { AttachmentRecord, UploadAttachmentInput } from '@shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const attachmentKeys = {
  all: (companyId: number) => [companyId, 'attachments'] as const,
  lists: (companyId: number) => [...attachmentKeys.all(companyId), 'list'] as const,
  list: (companyId: number, entityType: string, entityId: string) =>
    [...attachmentKeys.lists(companyId), entityType, entityId] as const
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches the list of attachments for a given entity (order, fiscal document, etc.).
 * Only enabled when entityId is defined and non-empty.
 */
function useAttachments(companyId: number, entityType: string, entityId: string) {
  return useQuery({
    queryKey: attachmentKeys.list(companyId, entityType, entityId),
    queryFn: () => listAttachments(companyId, entityType, entityId),
    enabled: entityId !== ''
  })
}

/**
 * Mutation to upload a new attachment for a given entity.
 * Invalidates the attachments list cache on success.
 */
function useUploadAttachment(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      entityType,
      entityId,
      ...input
    }: UploadAttachmentInput & { entityType: string; entityId: string }) =>
      uploadAttachment(companyId, entityType, entityId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: attachmentKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to delete an attachment.
 * Invalidates the attachments list cache on success.
 */
function useDeleteAttachment(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => deleteAttachment(companyId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: attachmentKeys.all(companyId) })
    }
  })
}

export { attachmentKeys, useAttachments, useUploadAttachment, useDeleteAttachment }
export type { AttachmentRecord, UploadAttachmentInput }
