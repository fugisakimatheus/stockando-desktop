/**
 * IntegrationService — CRUD and connection testing for external service integrations.
 *
 * Provides:
 * - `list(companyId)` — returns all integration configs for the company (never exposes credentialsRef)
 * - `create(companyId, input)` — creates a new integration config with optional secure credential storage
 * - `update(companyId, id, input)` — updates an existing integration config
 * - `toggle(companyId, id, active)` — enables or disables an integration config
 * - `testConnection(companyId, id)` — performs a lightweight health-check to the configured endpoint
 *
 * Credential Storage:
 * - Raw credentials are stored as separate JSON files on disk at {userData}/credentials/{companyId}/{uuid}.json
 * - Only the filename reference (credentialsRef) is stored in the database
 * - API responses NEVER include raw credential values
 *
 * Connection Testing:
 * - Uses Node.js native fetch with AbortController for timeout (default 10s)
 * - Returns success/failure with response time, updates lastTestedAt and lastTestResult in DB
 * - Isolates errors: network timeouts, auth failures, connection refused — all wrapped cleanly
 *
 * All operations are company-scoped. Throws typed errors from the application error hierarchy.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { and, eq } from 'drizzle-orm'
import { app } from 'electron'

import { NotFoundError, ValidationError } from '../api/errors'
import { integrationConfigs } from '../db/schema'
import { getDb } from '../server'
import type {
  ConnectionTestResult,
  CreateIntegrationInput,
  IntegrationConfigDetail,
  IntegrationConfigListItem,
  IntegrationProviderType,
  UpdateIntegrationInput
} from '../types/phase4-types'
import { INTEGRATION_PROVIDER_TYPES, INTEGRATION_TEST_RESULTS } from '../types/phase4-types'
import { logAudit } from './audit-service'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default timeout for connection health-checks in milliseconds. */
const CONNECTION_TEST_TIMEOUT_MS = 10_000

/** Valid provider types for validation. */
const VALID_PROVIDER_TYPES = new Set<string>(Object.values(INTEGRATION_PROVIDER_TYPES))

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns all integration configs for the given company.
 *
 * Never exposes the credentialsRef field in the response.
 */
export async function list(companyId: number): Promise<IntegrationConfigListItem[]> {
  const db = getDb()

  const rows = await db.select().from(integrationConfigs).where(eq(integrationConfigs.companyId, companyId))

  return rows.map(mapToListItem)
}

/**
 * Creates a new integration config for the given company.
 *
 * Validates provider type and endpoint URL. If credentials are provided,
 * stores them as a secure JSON file on disk and saves only the filename
 * reference in the database.
 */
export async function create(companyId: number, input: CreateIntegrationInput): Promise<IntegrationConfigDetail> {
  const db = getDb()

  validateProviderType(input.providerType)
  validateEndpointUrl(input.endpointUrl)

  let credentialsRef: string | null = null

  if (input.credentials) {
    credentialsRef = storeCredentials(companyId, input.credentials)
  }

  const now = new Date().toISOString()

  const [row] = await db
    .insert(integrationConfigs)
    .values({
      companyId,
      providerType: input.providerType,
      endpointUrl: input.endpointUrl,
      credentialsRef,
      description: input.description ?? null,
      active: true,
      lastTestedAt: null,
      lastTestResult: null,
      createdAt: now,
      updatedAt: now
    })
    .returning()

  await logAudit({
    companyId,
    entityType: 'integration_config',
    entityId: String(row.id),
    action: 'create',
    details: JSON.stringify({
      providerType: input.providerType,
      endpointUrl: input.endpointUrl
    })
  })

  return mapToDetail(row)
}

/**
 * Updates an existing integration config.
 *
 * Supports updating endpoint URL, description, and credentials.
 * If credentials are provided, overwrites the existing credential file.
 * Never returns raw credentials in the response.
 */
export async function update(
  companyId: number,
  id: number,
  input: UpdateIntegrationInput
): Promise<IntegrationConfigDetail> {
  const db = getDb()

  const [existing] = await db
    .select()
    .from(integrationConfigs)
    .where(and(eq(integrationConfigs.id, id), eq(integrationConfigs.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError('Integration config not found')
  }

  if (input.endpointUrl !== undefined) {
    validateEndpointUrl(input.endpointUrl)
  }

  let credentialsRef = existing.credentialsRef

  if (input.credentials) {
    credentialsRef = storeCredentials(companyId, input.credentials)
  }

  const now = new Date().toISOString()

  const [updated] = await db
    .update(integrationConfigs)
    .set({
      endpointUrl: input.endpointUrl ?? existing.endpointUrl,
      description: input.description !== undefined ? (input.description ?? null) : existing.description,
      credentialsRef,
      updatedAt: now
    })
    .where(and(eq(integrationConfigs.id, id), eq(integrationConfigs.companyId, companyId)))
    .returning()

  await logAudit({
    companyId,
    entityType: 'integration_config',
    entityId: String(id),
    action: 'update',
    details: JSON.stringify({
      endpointUrl: updated.endpointUrl,
      credentialsUpdated: !!input.credentials
    })
  })

  return mapToDetail(updated)
}

/**
 * Enables or disables an integration config.
 */
export async function toggle(companyId: number, id: number, active: boolean): Promise<IntegrationConfigDetail> {
  const db = getDb()

  const [existing] = await db
    .select()
    .from(integrationConfigs)
    .where(and(eq(integrationConfigs.id, id), eq(integrationConfigs.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError('Integration config not found')
  }

  const now = new Date().toISOString()

  const [updated] = await db
    .update(integrationConfigs)
    .set({ active, updatedAt: now })
    .where(and(eq(integrationConfigs.id, id), eq(integrationConfigs.companyId, companyId)))
    .returning()

  await logAudit({
    companyId,
    entityType: 'integration_config',
    entityId: String(id),
    action: active ? 'activate' : 'deactivate'
  })

  return mapToDetail(updated)
}

/**
 * Performs a lightweight health-check call to the configured endpoint.
 *
 * Uses native fetch with an AbortController for timeout enforcement (10s default).
 * Returns the connection test result and updates the database record with
 * lastTestedAt and lastTestResult.
 *
 * Error categories handled:
 * - Network timeout (AbortError)
 * - Authentication failures (HTTP 401/403)
 * - Connection refused / DNS resolution failures
 * - Any other HTTP error
 */
export async function testConnection(companyId: number, id: number): Promise<ConnectionTestResult> {
  const db = getDb()

  const [existing] = await db
    .select()
    .from(integrationConfigs)
    .where(and(eq(integrationConfigs.id, id), eq(integrationConfigs.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError('Integration config not found')
  }

  const testedAt = new Date().toISOString()
  const startTime = performance.now()

  let result: ConnectionTestResult

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TEST_TIMEOUT_MS)

    const response = await fetch(existing.endpointUrl, {
      method: 'GET',
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    const responseTimeMs = Math.round(performance.now() - startTime)

    if (response.status === 401 || response.status === 403) {
      result = {
        success: false,
        responseTimeMs,
        error: `Authentication failed (HTTP ${response.status}). Please verify credentials.`,
        testedAt
      }
    } else if (response.ok) {
      result = {
        success: true,
        responseTimeMs,
        error: null,
        testedAt
      }
    } else {
      result = {
        success: false,
        responseTimeMs,
        error: `HTTP ${response.status}: ${response.statusText}`,
        testedAt
      }
    }
  } catch (error: unknown) {
    const responseTimeMs = Math.round(performance.now() - startTime)

    if (error instanceof Error && error.name === 'AbortError') {
      result = {
        success: false,
        responseTimeMs,
        error: `Connection timeout after ${CONNECTION_TEST_TIMEOUT_MS}ms for endpoint: ${existing.endpointUrl}`,
        testedAt
      }
    } else if (error instanceof TypeError && String(error.message).includes('fetch')) {
      result = {
        success: false,
        responseTimeMs,
        error: `Connection refused or DNS resolution failed for endpoint: ${existing.endpointUrl}`,
        testedAt
      }
    } else {
      const message = error instanceof Error ? error.message : 'Unknown connection error'
      result = {
        success: false,
        responseTimeMs,
        error: message,
        testedAt
      }
    }
  }

  // Update DB with test result
  const testResultValue = result.success ? INTEGRATION_TEST_RESULTS.success : INTEGRATION_TEST_RESULTS.failure

  await db
    .update(integrationConfigs)
    .set({
      lastTestedAt: testedAt,
      lastTestResult: testResultValue,
      updatedAt: testedAt
    })
    .where(and(eq(integrationConfigs.id, id), eq(integrationConfigs.companyId, companyId)))

  return result
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Validates that the provider type is one of the allowed values.
 */
function validateProviderType(providerType: string): asserts providerType is IntegrationProviderType {
  if (!VALID_PROVIDER_TYPES.has(providerType)) {
    throw new ValidationError('Invalid provider type', {
      providerType: `Must be one of: ${[...VALID_PROVIDER_TYPES].join(', ')}`
    })
  }
}

/**
 * Validates that the endpoint URL is well-formed.
 */
function validateEndpointUrl(endpointUrl: string): void {
  if (!endpointUrl || endpointUrl.trim().length === 0) {
    throw new ValidationError('Endpoint URL is required', {
      endpointUrl: 'Endpoint URL cannot be empty'
    })
  }

  try {
    const url = new URL(endpointUrl)
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new ValidationError('Invalid endpoint URL protocol', {
        endpointUrl: 'Endpoint URL must use http or https protocol'
      })
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error
    throw new ValidationError('Invalid endpoint URL format', {
      endpointUrl: 'Endpoint URL must be a valid URL (e.g., https://api.example.com)'
    })
  }
}

/**
 * Stores credential content as a JSON file on disk and returns the filename reference.
 *
 * Path: {userData}/credentials/{companyId}/{uuid}.json
 */
function storeCredentials(companyId: number, credentials: string): string {
  const credentialsDir = join(app.getPath('userData'), 'credentials', String(companyId))
  mkdirSync(credentialsDir, { recursive: true })

  const fileName = `${randomUUID()}.json`
  const filePath = join(credentialsDir, fileName)

  writeFileSync(filePath, credentials, 'utf-8')

  return fileName
}

/**
 * Maps a database row to IntegrationConfigListItem.
 * Never exposes credentialsRef.
 */
function mapToListItem(row: typeof integrationConfigs.$inferSelect): IntegrationConfigListItem {
  return {
    id: row.id,
    providerType: row.providerType as IntegrationProviderType,
    endpointUrl: row.endpointUrl,
    description: row.description,
    active: row.active,
    lastTestedAt: row.lastTestedAt,
    lastTestResult: row.lastTestResult as IntegrationConfigListItem['lastTestResult']
  }
}

/**
 * Maps a database row to IntegrationConfigDetail.
 * Exposes credentialsRef (filename only, not raw content) for internal tracking.
 */
function mapToDetail(row: typeof integrationConfigs.$inferSelect): IntegrationConfigDetail {
  return {
    id: row.id,
    providerType: row.providerType as IntegrationProviderType,
    endpointUrl: row.endpointUrl,
    credentialsRef: row.credentialsRef,
    description: row.description,
    active: row.active,
    lastTestedAt: row.lastTestedAt,
    lastTestResult: row.lastTestResult as IntegrationConfigDetail['lastTestResult'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}
