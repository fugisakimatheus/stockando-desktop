import {
  listIntegrationConfigs,
  createIntegration,
  updateIntegration,
  toggleIntegration,
  testIntegrationConnection
} from '@shared/api'
import type {
  IntegrationConfigListItem,
  IntegrationConfigDetail,
  CreateIntegrationInput,
  UpdateIntegrationInput,
  ConnectionTestResult
} from '@shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const integrationKeys = {
  all: (companyId: number) => [companyId, 'integrations'] as const,
  list: (companyId: number) => [...integrationKeys.all(companyId), 'list'] as const
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches all integration configs for the given company.
 */
function useIntegrationConfigs(companyId: number) {
  return useQuery({
    queryKey: integrationKeys.list(companyId),
    queryFn: () => listIntegrationConfigs(companyId)
  })
}

/**
 * Mutation to create a new integration config.
 * Invalidates the integrations list on success.
 */
function useCreateIntegration(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateIntegrationInput) => createIntegration(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: integrationKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to update an existing integration config.
 * Invalidates the integrations list on success.
 */
function useUpdateIntegration(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...input }: UpdateIntegrationInput & { id: number }) => updateIntegration(companyId, id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: integrationKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to toggle an integration active/inactive.
 * Invalidates the integrations list on success.
 */
function useToggleIntegration(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => toggleIntegration(companyId, id, active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: integrationKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to test the connection of an integration config.
 * Invalidates the integrations list on success (last_tested_at is updated server-side).
 */
function useTestConnection(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => testIntegrationConnection(companyId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: integrationKeys.all(companyId) })
    }
  })
}

export {
  integrationKeys,
  useIntegrationConfigs,
  useCreateIntegration,
  useUpdateIntegration,
  useToggleIntegration,
  useTestConnection
}
export type {
  IntegrationConfigListItem,
  IntegrationConfigDetail,
  CreateIntegrationInput,
  UpdateIntegrationInput,
  ConnectionTestResult
}
