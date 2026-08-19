const API_BASE = 'http://127.0.0.1:3000/api'

interface ApiSuccessResponse<T> {
  success: true
  data: T
}

interface ApiErrorResponseBody {
  success: false
  error: {
    code: string
    message: string
    fields?: Record<string, string>
  }
}

type ApiEnvelope<T> = ApiSuccessResponse<T> | ApiErrorResponseBody

/**
 * Structured error thrown by `apiClient` when the server returns a failure envelope
 * or a network error occurs.
 */
class ApiError extends Error {
  readonly code: string
  readonly fields?: Record<string, string>

  constructor(code: string, message: string, fields?: Record<string, string>) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.fields = fields
  }
}

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
}

/**
 * Typed fetch wrapper that communicates with the local Fastify API.
 *
 * - Constructs the full URL from the base and the given endpoint (must start with `/`).
 * - Automatically sets JSON headers when a body is provided.
 * - Unwraps the standard API envelope: returns `data` on success, throws `ApiError` on failure.
 * - Wraps network-level errors into a consistent `ApiError` with code `NETWORK_ERROR`.
 */
async function apiClient<T>(endpoint: string, options?: FetchOptions): Promise<T> {
  const { method = 'GET', body } = options ?? {}

  const headers: Record<string, string> = {}
  let serializedBody: string | undefined

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    serializedBody = JSON.stringify(body)
  }

  let response: Response

  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers,
      body: serializedBody
    })
  } catch (error) {
    throw new ApiError('NETWORK_ERROR', error instanceof Error ? error.message : 'Network request failed')
  }

  let json: ApiEnvelope<T>

  try {
    json = (await response.json()) as ApiEnvelope<T>
  } catch {
    throw new ApiError('PARSE_ERROR', 'Failed to parse server response')
  }

  if (json.success) {
    return json.data
  }

  throw new ApiError(json.error.code, json.error.message, json.error.fields)
}

export { ApiError, apiClient }
export type { FetchOptions }
