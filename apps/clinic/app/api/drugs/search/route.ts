import { searchEgyptianDrugs, getDrugsByCategory, type EgyptianDrug } from '@shared/lib/data/egyptian-drugs'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    const category = searchParams.get('category')
    const limit = parseInt(searchParams.get('limit') || '15', 10)

    // Category filter
    if (category) {
      const results = getDrugsByCategory(category)
      return NextResponse.json({
        results: results.map(formatDrugResult),
        count: results.length
      })
    }

    // Search query
    if (!query || query.length < 2) {
      return NextResponse.json(
        { error: 'Query must be at least 2 characters' },
        { status: 400 }
      )
    }

    const results = searchEgyptianDrugs(query, limit)

    return NextResponse.json({
      results: results.map(formatDrugResult),
      count: results.length
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
 * Format drug result for API response
 * Includes smart defaults for auto-filling prescription fields
 */
function formatDrugResult(drug: EgyptianDrug) {
  return {
    id: drug.id,
    name: drug.brandName,
    nameAr: drug.brandNameAr,
    genericName: drug.genericName,
    strength: drug.strength,
    strengthVariants: drug.strengthVariants,
    form: drug.form,
    category: drug.category,
    subcategory: drug.subcategory,
    defaults: drug.defaults,
    requiresMonitoring: drug.requiresMonitoring || false,
    controlledSubstance: drug.controlledSubstance || false,
    pregnancyCategory: drug.pregnancyCategory,
  }
}
