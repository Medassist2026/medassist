import { createAdminClient } from '@shared/lib/supabase/admin'
import { createClient } from '@shared/lib/supabase/server'
import Fuse from 'fuse.js'
import { auditLog } from '@shared/lib/audit/logger'

export interface DuplicateMatch {
  patientId: string
  matchScore: number // 0-1 score (higher = more likely duplicate)
  matchReasons: string[]
  patientDetails?: {
    phone: string
    full_name: string | null
    age: number | null
    sex: string | null
  }
}

interface PatientRecord {
  id: string
  phone: string
  full_name: string | null
  age: number | null
  sex: string | null
  account_status?: string
}

interface DedupContext {
  userId: string
  userRole: string
}

/**
 * Calculate Levenshtein distance between two strings
 * Returns the edit distance (lower = more similar)
 */
function levenshteinDistance(str1: string, str2: string): number {
  const track = Array(str2.length + 1)
    .fill(null)
    .map(() => Array(str1.length + 1).fill(0))

  for (let i = 0; i <= str1.length; i += 1) {
    track[0][i] = i
  }
  for (let j = 0; j <= str2.length; j += 1) {
    track[j][0] = j
  }

  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator // substitution
      )
    }
  }

  return track[str2.length][str1.length]
}

/**
 * Check if two names are similar using Levenshtein distance
 * @returns true if distance <= 3 or one contains the other
 */
function areNamesSimilar(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false

  const n1 = name1.toLowerCase().trim()
  const n2 = name2.toLowerCase().trim()

  // Exact match
  if (n1 === n2) return true

  // One contains the other (for partial matches)
  if (n1.includes(n2) || n2.includes(n1)) return true

  // Levenshtein distance <= 3
  const distance = levenshteinDistance(n1, n2)
  return distance <= 3
}

/**
 * Find potential duplicate patients
 * Matches on: phone (exact), name (fuzzy), age+sex+name combination
 */
export async function findPotentialDuplicates(
  patientId: string,
  context: DedupContext
): Promise<DuplicateMatch[]> {
  const admin = createAdminClient('patient-dedup')

  // Get the patient record
  const { data: patient, error: patientError } = await admin
    .from('patients')
    .select('id, phone, full_name, age, sex, account_status')
    .eq('id', patientId)
    .single()

  if (patientError || !patient) {
    throw new Error(`Patient not found: ${patientId}`)
  }

  // Get all other active patients
  const { data: allPatients, error: allError } = await admin
    .from('patients')
    .select('id, phone, full_name, age, sex, account_status')
    .neq('id', patientId)
    .neq('account_status', 'merged')

  if (allError || !allPatients) {
    throw new Error('Failed to fetch patients for dedup')
  }

  const matches: DuplicateMatch[] = []

  for (const other of allPatients) {
    const reasons: string[] = []
    let score = 0

    // 1. Phone match (exact) - highest confidence
    if (patient.phone && other.phone && patient.phone === other.phone) {
      reasons.push('Exact phone match')
      score = Math.max(score, 0.95)
    }

    // 2. Name similarity + age/sex match
    if (patient.full_name && other.full_name) {
      if (areNamesSimilar(patient.full_name, other.full_name)) {
        reasons.push('Similar name (fuzzy match)')

        // Boost score if age and sex also match
        if (
          patient.age !== null &&
          other.age !== null &&
          patient.age === other.age &&
          patient.sex === other.sex
        ) {
          reasons.push('Age and sex match')
          score = Math.max(score, 0.85)
        } else if (patient.age === other.age && patient.sex === other.sex) {
          score = Math.max(score, 0.70)
        } else {
          score = Math.max(score, 0.55)
        }
      }
    }

    // 3. Age + sex + partial name match (weaker signal)
    if (
      patient.age !== null &&
      other.age !== null &&
      patient.age === other.age &&
      patient.sex === other.sex &&
      patient.full_name &&
      other.full_name
    ) {
      // Check if any word in name matches
      const patientWords = patient.full_name.toLowerCase().split(/\s+/)
      const otherWords = other.full_name.toLowerCase().split(/\s+/)
      const commonWords = patientWords.filter((w: string) => otherWords.includes(w))

      if (commonWords.length > 0 && score < 0.45) {
        reasons.push(`Shared name components: ${commonWords.join(', ')}`)
        score = Math.max(score, 0.45)
      }
    }

    // Only include matches with reasonable confidence
    if (score > 0.4 && reasons.length > 0) {
      matches.push({
        patientId: other.id,
        matchScore: score,
        matchReasons: reasons,
        patientDetails: {
          phone: other.phone,
          full_name: other.full_name,
          age: other.age,
          sex: other.sex
        }
      })
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.matchScore - a.matchScore)

  // Log the search
  await auditLog({
    userId: context.userId,
    userRole: context.userRole,
    action: 'search',
    resourceType: 'patient',
    resourceId: patientId,
    details: {
      matchesFound: matches.length,
      topMatches: matches.slice(0, 3).map(m => ({
        patientId: m.patientId,
        score: m.matchScore
      }))
    }
  })

  return matches
}

/**
 * Merge two patient records
 * Moves all clinical data from mergeId to keepId
 * Marks mergeId as merged
 */
export async function mergePatients(
  keepId: string,
  mergeId: string,
  context: DedupContext
): Promise<void> {
  const admin = createAdminClient('patient-dedup')
  const supabase = await createClient()

  // Verify both patients exist
  const { data: keepPatient } = await admin
    .from('patients')
    .select('id')
    .eq('id', keepId)
    .single()

  const { data: mergePatient } = await admin
    .from('patients')
    .select('id')
    .eq('id', mergeId)
    .single()

  if (!keepPatient || !mergePatient) {
    throw new Error('One or both patients not found')
  }

  if (keepId === mergeId) {
    throw new Error('Cannot merge a patient with themselves')
  }

  try {
    // 1. Move clinical notes
    const { error: notesError } = await admin
      .from('clinical_notes')
      .update({ patient_id: keepId })
      .eq('patient_id', mergeId)

    if (notesError) throw new Error(`Failed to merge clinical notes: ${notesError.message}`)

    // 2. Move appointments
    const { error: appointmentsError } = await admin
      .from('appointments')
      .update({ patient_id: keepId })
      .eq('patient_id', mergeId)

    if (appointmentsError) throw new Error(`Failed to merge appointments: ${appointmentsError.message}`)

    // 3. Move prescription items
    const { error: prescriptionsError } = await admin
      .from('prescription_items')
      .update({ patient_id: keepId })
      .eq('patient_id', mergeId)

    if (prescriptionsError) throw new Error(`Failed to merge prescriptions: ${prescriptionsError.message}`)

    // 4. Mark mergeId patient as merged/inactive
    const { error: statusError } = await admin
      .from('patients')
      .update({
        account_status: 'merged'
      })
      .eq('id', mergeId)

    if (statusError) throw new Error(`Failed to mark patient as merged: ${statusError.message}`)

    // 5. Log the merge action
    await auditLog({
      userId: context.userId,
      userRole: context.userRole,
      action: 'merge',
      resourceType: 'patient',
      resourceId: keepId,
      details: {
        mergedPatientId: mergeId,
        clinicalNotesTransferred: true,
        appointmentsTransferred: true,
        prescriptionsTransferred: true
      }
    })
  } catch (error) {
    console.error('[PatientDedup] Merge failed:', error)
    throw error
  }
}

/**
 * Search for patients by name or phone for manual deduplication
 */
export async function searchPatientsForDedup(
  query: string,
  context: DedupContext
): Promise<PatientRecord[]> {
  const admin = createAdminClient('patient-dedup')

  // Normalize query
  const normalized = query.toLowerCase().trim()

  if (!normalized || normalized.length < 2) {
    return []
  }

  // Get all active patients
  const { data: patients, error } = await admin
    .from('patients')
    .select('id, phone, full_name, age, sex, account_status')
    .neq('account_status', 'merged')

  if (error || !patients) {
    throw new Error('Failed to fetch patients')
  }

  // Use Fuse.js for fuzzy search on names + exact match on phone
  const fuse = new Fuse(patients, {
    keys: ['full_name', 'phone'],
    threshold: 0.4, // 40% match threshold
    minMatchCharLength: 2
  })

  const results = fuse.search(normalized)

  // Log the search
  await auditLog({
    userId: context.userId,
    userRole: context.userRole,
    action: 'search',
    resourceType: 'patient',
    details: {
      query,
      resultsFound: results.length
    }
  })

  return results.map((r: any) => r.item as PatientRecord)
}
