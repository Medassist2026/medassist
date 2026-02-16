import { getLabTestsCatalog } from '@/lib/data/clinical'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const tests = await getLabTestsCatalog()

    return NextResponse.json({
      success: true,
      tests
    })

  } catch (error: any) {
    console.error('Lab tests error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to load lab tests' },
      { status: 500 }
    )
  }
}
