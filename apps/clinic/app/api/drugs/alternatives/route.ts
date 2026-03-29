export const dynamic = 'force-dynamic'

/**
 * GET /api/drugs/alternatives
 *
 * Returns cheaper alternative brands that share the same generic INN.
 * Results are sorted cheapest-first.
 *
 * Query params:
 *   generic    — required, e.g. "amoxicillin"
 *   excludeId  — optional, drug ID to exclude (the currently selected brand)
 *   limit      — optional, max results (default 10, max 20)
 *
 * Prices are sourced from the Egypt drugs database (GitHub 2024 + DrugEye 2026)
 * and are ESTIMATES. Actual pharmacy prices may differ.
 */

import { NextResponse } from 'next/server'
import { getDrugAlternativesByGeneric } from '@shared/lib/data/extended-drug-search'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const generic   = searchParams.get('generic')?.trim() || ''
    const excludeId = searchParams.get('excludeId') || undefined
    const limit     = Math.min(parseInt(searchParams.get('limit') || '10', 10), 20)

    if (!generic || generic.length < 3) {
      return NextResponse.json(
        { error: 'generic param must be at least 3 characters' },
        { status: 400 }
      )
    }

    const alternatives = getDrugAlternativesByGeneric(generic, excludeId, limit)

    return NextResponse.json({
      generic,
      count:        alternatives.length,
      priceNote:    'الأسعار تقريبية بناءً على بيانات السوق المصري (2024-2026) وقد تختلف عن الأسعار الفعلية في الصيدليات',
      alternatives,
    })

  } catch (error: any) {
    console.error('Drug alternatives error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch alternatives' },
      { status: 500 }
    )
  }
}
