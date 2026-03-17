// NOTE: createClient is imported dynamically in async functions below
// to avoid pulling server-only code into client components.

// Re-export pure data that can be used by client components
export { searchICD10, COMPLAINT_TO_DIAGNOSIS, MEDICATION_FREQUENCIES, MEDICATION_DURATIONS } from './templates-data'
export type { ICD10Entry } from './templates-data'

export interface TemplateSection {
  chief_complaints: string[]
  diagnoses: string[]
  medications: string[]
  plans: string[]
}

export interface Template {
  id: string
  specialty: string
  sections: TemplateSection
  is_default: boolean
  metadata?: {
    requiresWeightInput?: boolean
    showDoseHelper?: boolean
    allowMoreFreeText?: boolean
    lessAutomation?: boolean
  }
}

/**
 * Get default template for a specialty
 */
export async function getDefaultTemplate(specialty: string): Promise<Template | null> {
  const { createClient } = await import('@shared/lib/supabase/server')
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .eq('specialty', specialty)
    .eq('is_default', true)
    .single()

  if (error || !data) {
    return null
  }

  return data as Template
}

/**
 * Get doctor's custom templates
 */
export async function getDoctorTemplates(doctorId: string) {
  const { createClient } = await import('@shared/lib/supabase/server')
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('doctor_templates')
    .select('*, templates(*)')
    .eq('doctor_id', doctorId)
    .order('is_favorite', { ascending: false })

  if (error) {
    return []
  }

  return data
}

/**
 * Search for drug names
 * Uses the comprehensive Egyptian drug database
 */
export async function searchDrugs(query: string, limit: number = 10) {
  const { searchEgyptianDrugs } = await import('./egyptian-drugs')
  const results = searchEgyptianDrugs(query, limit)
  return results.map(drug => ({
    name: drug.brandName,
    category: drug.category,
    id: drug.id,
    genericName: drug.genericName,
    strength: drug.strength,
    form: drug.form,
    defaults: drug.defaults,
  }))
}
