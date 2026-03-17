import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import {
  orderLabTests,
  getLabResults,
  updateLabResult,
  completeLabOrder,
  parseResultValue,
  getTestById,
} from '@shared/lib/data/lab-results'
import { NextResponse } from 'next/server'

/**
 * GET /api/clinical/lab-results
 * Fetch lab results for a patient
 * Query params: patientId (required)
 */
export async function GET(request: Request) {
  try {
    await requireApiRole('doctor')
    const { searchParams } = new URL(request.url)
    const patientId = searchParams.get('patientId')

    if (!patientId) {
      return NextResponse.json(
        { error: 'patientId query parameter is required' },
        { status: 400 }
      )
    }

    const results = await getLabResults(patientId)

    return NextResponse.json({
      success: true,
      results,
    })
  } catch (error: any) {
    console.error('Lab results fetch error:', error)
    return toApiErrorResponse(error, 'Failed to fetch lab results')
  }
}

/**
 * POST /api/clinical/lab-results
 * Order new lab tests for a patient
 * Body: { patientId, clinicId, tests: [{testId, testName}] }
 */
export async function POST(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const body = await request.json()
    const { patientId, clinicId, tests } = body

    // Validation
    if (!patientId) {
      return NextResponse.json({ error: 'patientId is required' }, { status: 400 })
    }
    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId is required' }, { status: 400 })
    }
    if (!tests || !Array.isArray(tests) || tests.length === 0) {
      return NextResponse.json({ error: 'tests array is required' }, { status: 400 })
    }

    // Validate tests
    for (const test of tests) {
      if (!test.testId) {
        return NextResponse.json({ error: 'testId is required for each test' }, { status: 400 })
      }
    }

    const order = await orderLabTests({
      patientId,
      clinicId,
      doctorId: user.id,
      tests: tests.map((t: any) => ({
        testId: t.testId,
        testName: t.testName || getTestById(t.testId)?.name || t.testId,
      })),
    })

    return NextResponse.json({
      success: true,
      orderId: order.id,
      message: `Lab order created for ${tests.length} test(s)`,
    })
  } catch (error: any) {
    console.error('Lab order creation error:', error)
    return toApiErrorResponse(error, 'Failed to create lab order')
  }
}

/**
 * PATCH /api/clinical/lab-results
 * Update lab result values
 * Body: { resultId, resultValue, notes? } or array of results
 */
export async function PATCH(request: Request) {
  try {
    await requireApiRole('doctor')
    const body = await request.json()

    const results = Array.isArray(body) ? body : [body]

    for (const result of results) {
      if (!result.resultId) {
        return NextResponse.json({ error: 'resultId is required' }, { status: 400 })
      }
      if (!result.resultValue) {
        return NextResponse.json({ error: 'resultValue is required' }, { status: 400 })
      }
    }

    // Update each result
    for (const result of results) {
      // Try to determine if abnormal based on reference range
      let isAbnormal = result.isAbnormal || false

      // If not provided, try to detect from reference range
      if (!('isAbnormal' in result)) {
        const testId = result.testId
        if (testId) {
          const test = getTestById(testId)
          if (test) {
            const { isAbnormal: detected } = parseResultValue(result.resultValue, test.referenceRange)
            isAbnormal = detected
          }
        }
      }

      await updateLabResult({
        resultId: result.resultId,
        resultValue: result.resultValue.toString(),
        isAbnormal,
        notes: result.notes,
      })
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${results.length} result(s)`,
    })
  } catch (error: any) {
    console.error('Lab result update error:', error)
    return toApiErrorResponse(error, 'Failed to update lab result')
  }
}

/**
 * PUT /api/clinical/lab-results
 * Complete a lab order (mark all results submitted)
 * Body: { orderId }
 */
export async function PUT(request: Request) {
  try {
    await requireApiRole('doctor')
    const body = await request.json()
    const { orderId } = body

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 })
    }

    await completeLabOrder(orderId)

    return NextResponse.json({
      success: true,
      message: 'Lab order marked as completed',
    })
  } catch (error: any) {
    console.error('Lab order completion error:', error)
    return toApiErrorResponse(error, 'Failed to complete lab order')
  }
}
