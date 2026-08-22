/**
 * Centralized formatting utilities for the renderer layer.
 *
 * All formatters target the pt-BR locale and BRL currency by default.
 * This eliminates the duplicated `formatCurrency` / `formatDate` helper
 * pattern found across 15+ page modules.
 */

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
})

const decimalFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

/**
 * Formats a numeric value as BRL currency.
 * Returns '—' for null/undefined values (common in optional price fields).
 */
function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  return currencyFormatter.format(value)
}

/**
 * Formats a number with exactly 2 decimal places (no currency symbol).
 * Useful for line totals in document item editors.
 */
function formatDecimal(value: number): string {
  return decimalFormatter.format(value)
}

// ---------------------------------------------------------------------------
// Date / Time
// ---------------------------------------------------------------------------

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
})

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})

const shortDateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })

/**
 * Formats an ISO date string as dd/mm/yyyy.
 * Returns '—' for null/undefined values.
 */
function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return dateFormatter.format(new Date(value))
}

/**
 * Formats an ISO date string as dd/mm/yyyy HH:mm.
 * Returns '—' for null/undefined values.
 */
function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  return dateTimeFormatter.format(new Date(value))
}

/**
 * Formats an ISO date string using the short locale format.
 * Returns '—' for null/undefined values.
 */
function formatShortDate(value: string | null | undefined): string {
  if (!value) return '—'
  return shortDateFormatter.format(new Date(value))
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/**
 * Formats a quantity number using the pt-BR locale with up to 4 decimal places.
 */
function formatQuantity(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4
  }).format(value)
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { formatCurrency, formatDate, formatDateTime, formatDecimal, formatQuantity, formatShortDate }
