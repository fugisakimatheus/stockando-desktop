/**
 * Typed API client helpers for integration configuration endpoints.
 *
 * All functions require a `companyId` to enforce company-scoped data isolation
 * via the `x-company-id` header. Types are self-contained — no imports from
 * the main process.
 */

import { apiClient } from './client'

// ---------------------------------------------------------------------------
// Types (renderer-side mirror of service types)
// ---------------------------------------------------------------------------

type IntegrationProviderType = 'fiscal_provider' | 'payment_gateway' | 'custom_webhook'

type IntegrationTestResult = 'success' | 'failure'

interface IntegrationConfigListItem {
  id: number
  providerType: IntegrationProviderType
  endpointUrl: string
  description: string | null
  active: boolean
  lastTestedAt: string | null
  lastTestResult: IntegrationTestResult | null
}

interface IntegrationConfigDetail extends IntegrationConfigListItem {
  credentialsRef: string | null
  createdAt: string
  updatedAt: string
}

interface CreateIntegrationInput {
  providerType: IntegrationProviderType
  endpointUrl: string
  credentials?: string
  description?: string
}

interface UpdateIntegrationInput {
  endpointUrl?: string
  credentials?: string
  description?: string
}

interface ConnectionTestResult {
  success: boolean
  responseTimeMs: number | null
  error: string | null
  testedAt: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function companyHeaders(companyId: number): Record<string, string> {
  return { 'x-company-id': String(companyId) }
}

// ---------------------------------------------------------------------------
// Integrations API
// ---------------------------------------------------------------------------

/**
 * Lists all integration configs for the active company.
 */
function listIntegrationConfigs(companyId: number): Promise<IntegrationConfigListItem[]> {
  return apiClient<IntegrationConfigListItem[]>('/integrations', {
    headers: companyHeaders(companyId)
  })
}

/**
 * Creates a new integration config.
 */
function createIntegration(companyId: number, input: CreateIntegrationInput): Promise<IntegrationConfigDetail> {
  return apiClient<IntegrationConfigDetail>('/integrations', {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

/**
 * Updates an existing integration config.
 */
function updateIntegration(
  companyId: number,
  id: number,
  input: UpdateIntegrationInput
): Promise<IntegrationConfigDetail> {
  return apiClient<IntegrationConfigDetail>(`/integrations/${id}`, {
    method: 'PUT',
    body: input,
    headers: companyHeaders(companyId)
  })
}

/**
 * Toggles the active/inactive status of an integration config.
 */
function toggleIntegration(companyId: number, id: number, active: boolean): Promise<IntegrationConfigDetail> {
  return apiClient<IntegrationConfigDetail>(`/integrations/${id}/toggle`, {
    method: 'POST',
    body: { active },
    headers: companyHeaders(companyId)
  })
}

/**
 * Tests the connection to the configured endpoint and returns the result.
 */
function testIntegrationConnection(companyId: number, id: number): Promise<ConnectionTestResult> {
  return apiClient<ConnectionTestResult>(`/integrations/${id}/test`, {
    method: 'POST',
    headers: companyHeaders(companyId)
  })
}

export { listIntegrationConfigs, createIntegration, updateIntegration, toggleIntegration, testIntegrationConnection }
export type {
  IntegrationProviderType,
  IntegrationTestResult,
  IntegrationConfigListItem,
  IntegrationConfigDetail,
  CreateIntegrationInput,
  UpdateIntegrationInput,
  ConnectionTestResult
}
