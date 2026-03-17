/**
 * Request validation helper for API routes
 * Phase D4: Input validation utilities
 */

import { NextResponse } from 'next/server'
import type { ValidationResult } from './schemas'

/**
 * Validate request body against a validation function
 * Returns parsed data or error response
 */
export function validateBody<T>(
  validator: (body: any) => ValidationResult<T>,
  body: unknown
): { success: true; data: T } | { success: false; error: NextResponse } {
  const result = validator(body)

  if (result.success && result.data) {
    return { success: true, data: result.data }
  }

  return {
    success: false,
    error: NextResponse.json(
      {
        error: 'Validation failed',
        details: result.errors || [{ field: 'unknown', message: 'Invalid input' }]
      },
      { status: 400 }
    )
  }
}

/**
 * Validate URL search params against a validation function
 */
export function validateQueryParams<T>(
  validator: (params: URLSearchParams) => ValidationResult<T>,
  params: URLSearchParams
): { success: true; data: T } | { success: false; error: NextResponse } {
  const result = validator(params)

  if (result.success && result.data) {
    return { success: true, data: result.data }
  }

  return {
    success: false,
    error: NextResponse.json(
      {
        error: 'Validation failed',
        details: result.errors || [{ field: 'unknown', message: 'Invalid query parameters' }]
      },
      { status: 400 }
    )
  }
}
