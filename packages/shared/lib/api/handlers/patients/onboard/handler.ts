export const dynamic = 'force-dynamic'

import { onboardPatient } from '@shared/lib/data/patients'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { ensureDoctorInFrontdeskClinic, getUserClinicId } from '@shared/lib/data/frontdesk-scope'
import { NextResponse } from 'next/server'
import { validateEgyptianPhone } from '@shared/lib/utils/phone-validation'
import { enforceRateLimit } from '@shared/lib/security/rate-limit'
import { findGlobalPatientByPhone } from '@shared/lib/data/global-patients'
import {
  createMinorGlobalPatient,
  establishMinorClinicPresence,
  GuardianAuthorityError,
  InvalidDependentError,
} from '@shared/lib/data/dependents'

/**
 * POST /api/patients/onboard
 * 
 * Unified patient onboarding endpoint
 * Handles: New walk-ins, returning patients, code verification, ghost mode
 */
export async function POST(request: Request) {
  try {
    const rate = await enforceRateLimit(request, 'patient-onboard', 20, 60_000)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many onboarding attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      )
    }

    // Verify doctor or front desk
    const user = await requireApiRole(['doctor', 'frontdesk'])
    
    const body = await request.json()
    const { 
      phone, 
      fullName, 
      age, 
      sex, 
      isDependent, 
      parentPhone,
      doctorId,     // Required for frontdesk flows
      patientCode,  // Optional: if patient shares their code
      isGhostMode,  // Optional: no records created
      ghostReasonCategory
    } = body

    const assignedDoctorId = user.role === 'frontdesk' ? doctorId : user.id

    if (!assignedDoctorId) {
      return NextResponse.json(
        { error: 'Doctor ID is required for frontdesk onboarding', errorAr: 'يجب اختيار الطبيب أولاً' },
        { status: 400 }
      )
    }

    if (user.role === 'frontdesk') {
      const supabase = await createClient()
      const doctorInScope = await ensureDoctorInFrontdeskClinic(
        supabase as any,
        user.id,
        assignedDoctorId
      )
      if (!doctorInScope) {
        return NextResponse.json(
          { error: 'Doctor is outside your clinic scope' },
          { status: 403 }
        )
      }
    }

    // Resolve clinic context
    const clinicId = await getUserClinicId(user.id)

    // ============================================
    // GHOST MODE - Early exit
    // ============================================
    if (isGhostMode) {
      const result = await onboardPatient(assignedDoctorId, {
        phone: 'ghost',  // Not used in ghost mode
        fullName: 'ghost',
        age: 0,
        sex: 'Other',
        isGhostMode: true,
        ghostReasonCategory,
        clinicId: clinicId || undefined
      })
      
      return NextResponse.json({
        success: true,
        isGhostMode: true,
        anonymousNumber: result.anonymousNumber,
        message: result.message,
        access_level: result.accessLevel || 'ghost',
        consent_state: result.consentState || 'revoked'
      })
    }
    
    // ============================================
    // VALIDATION
    // ============================================
    
    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required', errorAr: 'رقم الموبايل مطلوب' },
        { status: 400 }
      )
    }
    
    const phoneValidation = validateEgyptianPhone(phone)
    if (!phoneValidation.isValid) {
      return NextResponse.json(
        { error: phoneValidation.error, errorAr: phoneValidation.errorAr },
        { status: 400 }
      )
    }
    
    if (!fullName || fullName.trim().length < 2) {
      return NextResponse.json(
        { error: 'Full name is required (at least 2 characters)', errorAr: 'الاسم مطلوب' },
        { status: 400 }
      )
    }
    
    if (age === undefined || age === null) {
      return NextResponse.json(
        { error: 'Age is required', errorAr: 'السن مطلوب' },
        { status: 400 }
      )
    }
    const parsedAge = Number(age)
    if (!Number.isFinite(parsedAge)) {
      return NextResponse.json(
        { error: 'Age must be numeric', errorAr: 'السن يجب أن يكون رقمًا' },
        { status: 400 }
      )
    }
    
    if (!sex || !['Male', 'Female', 'Other'].includes(sex)) {
      return NextResponse.json(
        { error: 'Sex is required', errorAr: 'النوع مطلوب' },
        { status: 400 }
      )
    }
    
    if (isDependent && !parentPhone) {
      return NextResponse.json(
        { error: 'Parent phone required for dependents', errorAr: 'رقم ولي الأمر مطلوب' },
        { status: 400 }
      )
    }

    // ============================================
    // B07 PHASE E + PHASE G — DEPENDENT V2 PATH
    // ============================================
    // When isDependent=true, the v2 path creates the FULL clinic-scoped
    // shape for a minor: (global_patients, patients, PCR, DPR) — four
    // rows total, matching the empirical pattern of the 3 mig-111
    // backfilled minors AND the structure of adult onboarding.
    //
    // STAGED HISTORY:
    //   - Phase E (commit 8cd485f) shipped step 1 only: create the
    //     minor gp via `createMinorGlobalPatient`.
    //   - Phase G (THIS commit) completes Phase E by ALSO calling
    //     `establishMinorClinicPresence` to land (patients, PCR, DPR)
    //     at the registering clinic. Without those rows, mig 081's
    //     compat trigger raises EXCEPTION on every downstream clinical
    //     insert (check-in queue, sessions, prescriptions, etc.) —
    //     making minors clinically unusable. Mo's case A1 ("mother
    //     registers 6yo, books appointment") was architecturally
    //     blocked between Phase E and Phase G. See
    //     `audits/b07-phase-g-execution-2026-05-10.md` Section 0
    //     for the empirical FK-chain survey that motivated this.
    //
    // BRIDGE PATTERN (Phase E Decision 8, preserved):
    //   `createMinorGlobalPatient` requires `createdByUserId === guardian.
    //   claimed_user_id`. The caller here is doctor/frontdesk staff, not
    //   the parent. We pass the parent's claimed_user_id as
    //   createdByUserId so the data-layer authority check passes.
    //   The audit row attributes to the parent — semantically "the
    //   parent authored this minor's creation, even though staff typed
    //   it in." This matches existing MVP convention where staff-
    //   mediated patient consent attributes to the patient.
    //
    // ADULT PATH UNCHANGED — when isDependent=false (or missing) we fall
    // through to the legacy onboardPatient flow.
    if (isDependent) {
      const parentValidation = validateEgyptianPhone(parentPhone)
      if (!parentValidation.isValid) {
        return NextResponse.json(
          { error: parentValidation.error, errorAr: parentValidation.errorAr },
          { status: 400 }
        )
      }

      const parentGp = await findGlobalPatientByPhone(parentPhone)
      if (!parentGp) {
        return NextResponse.json(
          {
            error:
              'Parent must register their own patient account before a dependent can be added',
            errorAr: 'يجب تسجيل ولي الأمر أولاً',
            code: 'PARENT_NOT_REGISTERED',
          },
          { status: 400 }
        )
      }
      if (!parentGp.claimed_user_id) {
        // gp exists but unclaimed — parent has no auth.users record yet,
        // so there is no `createdByUserId` to bridge through. Per Phase E
        // Decision 8, do NOT inline-create the parent gp; require them to
        // register first.
        return NextResponse.json(
          {
            error:
              'Parent has not yet completed account registration. Ask them to log in first, then add the dependent.',
            errorAr: 'يجب على ولي الأمر إكمال التسجيل أولاً',
            code: 'PARENT_UNCLAIMED',
          },
          { status: 400 }
        )
      }
      if (parentGp.is_minor) {
        return NextResponse.json(
          {
            error: 'A minor cannot be a guardian (authority chain depth = 1)',
            code: 'PARENT_IS_MINOR',
          },
          { status: 400 }
        )
      }

      // Map the existing onboard body shape (sex 'Male'/'Female') to the
      // dependents data layer shape ('male'/'female').
      let mappedSex: 'male' | 'female' | undefined
      if (sex === 'Male') mappedSex = 'male'
      else if (sex === 'Female') mappedSex = 'female'
      // 'Other' is allowed by the existing onboard schema but not by
      // dependents.normalizeSex; pass undefined to defer to data-layer
      // default (no sex stored).

      try {
        const minor = await createMinorGlobalPatient({
          guardianGlobalPatientId: parentGp.id,
          displayName: fullName.trim(),
          // dateOfBirth not collected by this endpoint — onboard uses
          // age-as-integer only. Pass undefined; the minor row gets
          // date_of_birth=NULL.
          dateOfBirth: undefined,
          sex: mappedSex,
          preferredLanguage: undefined, // defaults to 'ar' in data layer
          createdByUserId: parentGp.claimed_user_id,
        })

        // Phase G: complete the four-row shape at the registering clinic
        // so downstream clinical operations (queue add, session, etc.)
        // work for this minor. Requires clinicId + doctorId — both are
        // resolved above (clinicId via getUserClinicId(user.id);
        // assignedDoctorId is the validated doctor for frontdesk or
        // the user themselves for doctor self-onboard).
        if (!clinicId) {
          // Without a clinic, we have only the network-wide gp. This
          // matches pre-Phase-G behavior but flag it explicitly so the
          // caller knows the minor has no clinic presence yet.
          return NextResponse.json(
            {
              success: true,
              isDependent: true,
              isV2DependentPath: true,
              isClinicScoped: false,
              minorGlobalPatientId: minor.minorGlobalPatientId,
              guardianGlobalPatientId: parentGp.id,
              message:
                'Dependent gp created; no clinic context resolved — clinic-scoped patients row deferred to first clinic encounter.',
            },
            { status: 201 }
          )
        }

        const presence = await establishMinorClinicPresence({
          minorGlobalPatientId: minor.minorGlobalPatientId,
          guardianGlobalPatientId: parentGp.id,
          clinicId,
          doctorId: assignedDoctorId,
          parentPhone: parentPhone as string,
          displayName: fullName.trim(),
          age: parsedAge,
          sex: (sex as 'Male' | 'Female' | 'Other') ?? null,
          createdByUserId: parentGp.claimed_user_id,
        })

        // Adult-shaped response so legacy UI (queue add, session start)
        // works for minors without code changes. The new fields
        // (isDependent, isV2DependentPath, minorGlobalPatientId,
        // guardianGlobalPatientId) are additive; existing callers ignore
        // them.
        return NextResponse.json(
          {
            success: true,
            isDependent: true,
            isV2DependentPath: true,
            isClinicScoped: true,
            isExisting: false,
            isGhostMode: false,
            minorGlobalPatientId: minor.minorGlobalPatientId,
            guardianGlobalPatientId: parentGp.id,
            patient: {
              id: presence.patientId,
              unique_id: presence.patientUniqueId,
              phone: presence.patientPhone,
              full_name: fullName.trim(),
              age: parsedAge,
              sex,
              is_dependent: true,
              parent_phone: parentPhone,
              global_patient_id: minor.minorGlobalPatientId,
              clinic_id: clinicId,
            },
            relationship: {
              id: presence.dprId,
              doctor_id: assignedDoctorId,
              patient_id: presence.patientId,
              clinic_id: clinicId,
              status: 'pending',
              access_level: 'walk_in_limited',
              consent_state: 'pending',
            },
            access_level: 'walk_in_limited',
            consent_state: 'pending',
            message: 'Dependent registered (minor gp + clinic presence)',
          },
          { status: 201 }
        )
      } catch (e: any) {
        if (e instanceof InvalidDependentError) {
          return NextResponse.json(
            { error: e.message, code: e.code },
            { status: 400 }
          )
        }
        if (e instanceof GuardianAuthorityError) {
          return NextResponse.json(
            { error: e.message, code: e.code },
            { status: 403 }
          )
        }
        throw e
      }
    }

    // ============================================
    // ONBOARD PATIENT (adult path — legacy behavior unchanged)
    // ============================================

    const result = await onboardPatient(assignedDoctorId, {
      phone,
      fullName: fullName.trim(),
      age: parsedAge,
      sex,
      isDependent: isDependent || false,
      parentPhone,
      patientCode: patientCode?.trim(),
      clinicId: clinicId || undefined
    })

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.message,
          access_level: result.accessLevel || 'walk_in_limited',
          consent_state: result.consentState || 'pending'
        },
        { status: 400 }
      )
    }
    
    // ============================================
    // RESPONSE
    // ============================================
    
    return NextResponse.json({
      success: result.success,
      patient: result.patient,
      relationship: result.relationship,
      isExisting: result.isExisting,
      isGhostMode: false,
      message: result.message,
      carrier: phoneValidation.carrier,
      access_level: result.accessLevel || result.relationship?.access_level || 'walk_in_limited',
      consent_state: result.consentState || result.relationship?.consent_state || 'pending'
    }, { status: result.isExisting ? 200 : 201 })
    
  } catch (error: any) {
    console.error('Patient onboard error:', error)
    return toApiErrorResponse(error, 'Failed to onboard patient')
  }
}
