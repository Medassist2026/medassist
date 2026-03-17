import { checkDrugInteractions, checkAllInteractions } from '@shared/lib/data/drug-interactions'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { NextResponse } from 'next/server'

/**
 * POST /api/drugs/interactions
 *
 * Check drug interactions for a prescription.
 * Requires authenticated doctor role.
 *
 * Body options:
 * 1. Check new drug against existing list:
 *    { newDrug: { name, genericName }, existingMedications: [{ name, genericName }] }
 *
 * 2. Check all medications against each other:
 *    { medications: [{ name, genericName }] }
 */
export async function POST(request: Request) {
  try {
    await requireApiRole('doctor')
    const body = await request.json()

    // Mode 1: Check new drug against existing medications
    if (body.newDrug && body.existingMedications) {
      const { newDrug, existingMedications } = body
      if (!newDrug.genericName) {
        return NextResponse.json({ interactions: [], count: 0 })
      }

      const interactions = checkDrugInteractions(
        newDrug.genericName,
        newDrug.name,
        existingMedications
      )

      return NextResponse.json({
        interactions: interactions.map(r => ({
          newDrug: r.newDrug,
          existingDrug: r.existingDrug,
          newDrugGeneric: r.newDrugGeneric,
          existingDrugGeneric: r.existingDrugGeneric,
          severity: r.interaction.severity,
          effect: r.interaction.effect,
          recommendation: r.interaction.recommendation,
          mechanism: r.interaction.mechanism,
          monitorable: r.interaction.monitorable || false,
        })),
        count: interactions.length,
        hasContraindicated: interactions.some(i => i.interaction.severity === 'contraindicated'),
        hasMajor: interactions.some(i => i.interaction.severity === 'major'),
      })
    }

    // Mode 2: Check all medications in list
    if (body.medications) {
      const interactions = checkAllInteractions(body.medications)

      return NextResponse.json({
        interactions: interactions.map(r => ({
          newDrug: r.newDrug,
          existingDrug: r.existingDrug,
          newDrugGeneric: r.newDrugGeneric,
          existingDrugGeneric: r.existingDrugGeneric,
          severity: r.interaction.severity,
          effect: r.interaction.effect,
          recommendation: r.interaction.recommendation,
          mechanism: r.interaction.mechanism,
          monitorable: r.interaction.monitorable || false,
        })),
        count: interactions.length,
        hasContraindicated: interactions.some(i => i.interaction.severity === 'contraindicated'),
        hasMajor: interactions.some(i => i.interaction.severity === 'major'),
      })
    }

    return NextResponse.json(
      { error: 'Invalid request. Provide either { newDrug, existingMedications } or { medications }' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('Interaction check error:', error)
    return toApiErrorResponse(error, 'Interaction check failed')
  }
}
