import { createDoctorAccount, createPatientAccount, createFrontDeskAccount } from '@/lib/data/users'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { phone, email, password, role, specialty, fullName } = await request.json()

    if (!phone || !password || !role) {
      return NextResponse.json(
        { error: 'Phone, password, and role are required' },
        { status: 400 }
      )
    }
    
    if (!fullName || fullName.trim().length < 2) {
      return NextResponse.json(
        { error: 'Full name is required (at least 2 characters)' },
        { status: 400 }
      )
    }

    if (role === 'doctor') {
      if (!specialty) {
        return NextResponse.json(
          { error: 'Specialty is required for doctor registration' },
          { status: 400 }
        )
      }

      const result = await createDoctorAccount({
        phone,
        email,
        password,
        specialty,
        fullName
      })

      return NextResponse.json({
        success: true,
        userId: result.userId,
        uniqueId: result.doctorUniqueId,
        role: 'doctor'
      })

    } else if (role === 'patient') {
      const result = await createPatientAccount({
        phone,
        email,
        password,
        fullName
      })

      return NextResponse.json({
        success: true,
        userId: result.userId,
        uniqueId: result.patientUniqueId,
        role: 'patient'
      })

    } else if (role === 'frontdesk') {
      const result = await createFrontDeskAccount({
        phone,
        email,
        password,
        fullName
      })

      return NextResponse.json({
        success: true,
        userId: result.userId,
        uniqueId: result.frontDeskUniqueId,
        role: 'frontdesk'
      })

    } else {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400 }
      )
    }

  } catch (error: any) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: error.message || 'Registration failed' },
      { status: 500 }
    )
  }
}
