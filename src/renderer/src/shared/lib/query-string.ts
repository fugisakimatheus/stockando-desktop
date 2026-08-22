/**
 * Builds a URL query string from an object of params.
 *
 * - Skips null, undefined, and empty-string values.
 * - URL-encodes both keys and values.
 * - Returns an empty string when no params are serializable.
 *
 * Extracted from catalog-api.ts to be reused across all API modules.
 */
function buildQueryString<T extends Record<string, unknown>>(params: T): string {
  const parts: string[] = []

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    }
  }

  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

export { buildQueryString }
