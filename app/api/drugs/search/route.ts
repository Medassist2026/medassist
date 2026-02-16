import { searchDrugs } from '@/lib/data/templates'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    
    if (!query || query.length < 2) {
      return NextResponse.json(
        { error: 'Query must be at least 2 characters' },
        { status: 400 }
      )
    }
    
    const results = await searchDrugs(query, 10)
    
    return NextResponse.json({
      results,
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
