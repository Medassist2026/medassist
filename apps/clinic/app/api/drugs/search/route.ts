export const dynamic = 'force-dynamic'

import { searchEgyptianDrugs, getDrugsByCategory, type EgyptianDrug } from '@shared/lib/data/egyptian-drugs'
import { searchExtendedDrugs, formatExtendedDrugResult } from '@shared/lib/data/extended-drug-search'
import { NextResponse } from 'next/server'
// Price map built by matching curated drugs to extended DB brand names (83% coverage)
import CURATED_PRICE_MAP from '@shared/lib/data/curated-price-map.json'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query    = searchParams.get('q')
    const category = searchParams.get('category')
    const limit    = parseInt(searchParams.get('limit') || '15', 10)

    // Category filter (curated only — extended drugs use same category strings)
    if (category) {
      const results = getDrugsByCategory(category)
      return NextResponse.json({
        drugs:  results.map(formatDrugResult),
        count:  results.length,
      })
    }

    // Search query
    if (!query || query.length < 2) {
      return NextResponse.json(
        { error: 'Query must be at least 2 characters' },
        { status: 400 }
      )
    }

    // ── Tier 1: curated 801 drugs (always takes priority) ──────────────────
    const curatedResults = searchEgyptianDrugs(query, limit)
    const curatedFormatted = curatedResults.map(formatDrugResult)

    // ── Tier 2: extended 25K drugs (fill remaining slots) ──────────────────
    const remaining = limit - curatedResults.length
    let extendedFormatted: ReturnType<typeof formatExtendedDrugResult>[] = []

    if (remaining > 0) {
      const excludeIds = new Set(curatedResults.map(d => d.id))
      const extendedResults = searchExtendedDrugs(query, remaining, excludeIds)
      extendedFormatted = extendedResults.map(formatExtendedDrugResult)
    }

    const combined = [...curatedFormatted, ...extendedFormatted]

    return NextResponse.json({
      drugs: combined,
      count: combined.length,
    })

  } catch (error: any) {
    console.error('Drug search error:', error)
    return NextResponse.json(
      { error: error.message || 'Search failed' },
      { status: 500 }
    )
  }
}

/**
 * Format a curated EgyptianDrug for the API response
 */
function formatDrugResult(drug: EgyptianDrug) {
  const priceMap = CURATED_PRICE_MAP as Record<string, number | null>
  return {
    id:                 drug.id,
    name:               drug.brandName,
    nameAr:             drug.brandNameAr,
    genericName:        drug.genericName,
    strength:           drug.strength,
    strengthVariants:   drug.strengthVariants,
    form:               drug.form,
    category:           drug.category,
    subcategory:        drug.subcategory,
    defaults:           drug.defaults,
    requiresMonitoring: drug.requiresMonitoring || false,
    controlledSubstance: drug.controlledSubstance || false,
    pregnancyCategory:  drug.pregnancyCategory,
    priceEGP:           priceMap[drug.id] ?? null,
    source:             'curated' as const,
  }
}
