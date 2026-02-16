import { getPatient } from '@/lib/data/patients'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const patientId = params.id
    
    if (!patientId) {
      return NextResponse.json(
        { error: 'Patient ID is required' },
        { status: 400 }
      )
    }
    
    const patient = await getPatient(patientId)
    
    if (!patient) {
      return NextResponse.json(
        { error: 'Patient not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      success: true,
      patient
    })
    
  } catch (error: any) {
    console.error('Get patient error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch patient' },
      { status: 500 }
    )
  }
}
