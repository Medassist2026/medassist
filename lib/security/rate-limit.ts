import type { NextRequest } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_RATE_LIMIT_SECRET = 'medassist-rate-limit'

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
  remaining: number
}

function getClientIp(request: Request | NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for') || ''
  const first = forwarded.split(',')[0]?.trim()
  if (first) return first

  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp

  return 'unknown'
}

export async function enforceRateLimit(
  request: Request | NextRequest,
  scope: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  const admin = createAdminClient('rate-limit')
  const ip = getClientIp(request)
  const secret =
    process.env.RATE_LIMIT_KEY_SECRET ||
    process.env.NATIONAL_ID_SALT ||
    DEFAULT_RATE_LIMIT_SECRET
  const keyHash = crypto
    .createHash('sha256')
    .update(`${scope}:${ip}:${secret}`)
    .digest('hex')

  const { data, error } = await (admin as any).rpc('consume_rate_limit', {
    p_scope: scope,
    p_key_hash: keyHash,
    p_window_ms: windowMs,
    p_max_requests: maxRequests
  })

  if (error) {
    throw new Error(`Rate limit check failed: ${error.message}`)
  }

  const row = Array.isArray(data) ? data[0] : data
  return {
    allowed: !!row?.allowed,
    retryAfterSeconds: Number(row?.retry_after_seconds || 1),
    remaining: Number(row?.remaining || 0)
  }
}
