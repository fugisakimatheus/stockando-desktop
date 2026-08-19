import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { match, P } from 'ts-pattern'

import { AppError, ERROR_CODES, ValidationError } from './errors'
import type { ApiErrorResponse } from './types'

/**
 * Detects SQLite constraint violation from better-sqlite3 error messages.
 * better-sqlite3 throws `SqliteError` with a `code` property like
 * 'SQLITE_CONSTRAINT_UNIQUE' or a message containing 'UNIQUE constraint failed'.
 */
function isSqliteUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false

  const err = error as Record<string, unknown>

  // better-sqlite3 SqliteError has a `code` field
  if (typeof err.code === 'string' && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return true
  }

  // Fallback: check the message for the constraint pattern
  if (typeof err.message === 'string' && err.message.includes('UNIQUE constraint failed')) {
    return true
  }

  return false
}

function isSqliteConstraintError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false

  const err = error as Record<string, unknown>

  if (typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) {
    return true
  }

  return false
}

/**
 * Builds the error response body from an AppError instance.
 */
function buildAppErrorResponse(error: AppError): ApiErrorResponse {
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code: error.code,
      message: error.message
    }
  }

  if (error instanceof ValidationError && error.fields) {
    response.error.fields = error.fields
  }

  return response
}

/**
 * Maps an unknown error to a structured API error response.
 * - AppError subclasses → their respective HTTP status and structured response
 * - SQLite unique constraint → 409 CONFLICT
 * - SQLite other constraint → 400 VALIDATION_ERROR
 * - Everything else → 500 SYSTEM_ERROR (details logged, never exposed)
 */
function mapErrorToResponse(error: unknown): { statusCode: number; body: ApiErrorResponse } {
  return match(error)
    .when(
      (e): e is AppError => e instanceof AppError,
      (e) => ({
        statusCode: e.statusCode,
        body: buildAppErrorResponse(e)
      })
    )
    .when(isSqliteUniqueConstraintError, () => ({
      statusCode: 409,
      body: {
        success: false as const,
        error: {
          code: ERROR_CODES.CONFLICT,
          message: 'A record with the same unique identifier already exists'
        }
      }
    }))
    .when(isSqliteConstraintError, () => ({
      statusCode: 400,
      body: {
        success: false as const,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'The operation violates a data constraint'
        }
      }
    }))
    .with(P.instanceOf(Error), () => ({
      statusCode: 500,
      body: {
        success: false as const,
        error: {
          code: ERROR_CODES.SYSTEM_ERROR,
          message: 'An unexpected error occurred'
        }
      }
    }))
    .otherwise(() => ({
      statusCode: 500,
      body: {
        success: false as const,
        error: {
          code: ERROR_CODES.SYSTEM_ERROR,
          message: 'An unexpected error occurred'
        }
      }
    }))
}

/**
 * Registers the global error handler on the Fastify instance.
 * This should be called during server setup, before routes are registered.
 *
 * Behavior:
 * - Maps AppError subclasses to the appropriate HTTP status and structured JSON
 * - Maps SQLite constraint violations to CONFLICT or VALIDATION_ERROR
 * - Catches all other errors and returns a safe 500 SYSTEM_ERROR
 * - Logs full error details server-side for diagnostics
 * - Never exposes raw SQLite or internal errors to the renderer
 */
export function registerErrorHandler(fastify: FastifyInstance): void {
  fastify.setErrorHandler((error: Error, request: FastifyRequest, reply: FastifyReply) => {
    // Log full error details for debugging (server-side only)
    fastify.log.error({ err: error, url: request.url, method: request.method }, 'Request error')

    const { statusCode, body } = mapErrorToResponse(error)

    return reply.status(statusCode).send(body)
  })
}
