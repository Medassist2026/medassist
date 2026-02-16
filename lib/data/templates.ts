import { createClient } from '@/lib/supabase/server'

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
 * Search for ICD-10 diagnosis codes
 * (Placeholder - will use actual ICD-10 database in production)
 */
export async function searchICD10(query: string, limit: number = 10) {
  // For now, return mock data
  // In production, this would query an ICD-10 database
  const mockResults = [
    { code: 'J00', description: 'Acute nasopharyngitis [common cold]' },
    { code: 'J06.9', description: 'Acute upper respiratory infection, unspecified' },
    { code: 'J10.1', description: 'Influenza due to other identified influenza virus' },
    { code: 'A09', description: 'Infectious gastroenteritis and colitis, unspecified' },
    { code: 'I10', description: 'Essential (primary) hypertension' },
    { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' },
    { code: 'J02.9', description: 'Acute pharyngitis, unspecified' },
    { code: 'H66.90', description: 'Otitis media, unspecified' },
    { code: 'K29.70', description: 'Gastritis, unspecified' },
    { code: 'M79.3', description: 'Panniculitis, unspecified' },
    { code: 'R50.9', description: 'Fever, unspecified' },
  ]
  
  const filtered = mockResults.filter(item => 
    item.code.toLowerCase().includes(query.toLowerCase()) ||
    item.description.toLowerCase().includes(query.toLowerCase())
  )
  
  return filtered.slice(0, limit)
}

/**
 * Search for drug names
 * (Placeholder - will use Egypt drug database in production)
 */
export async function searchDrugs(query: string, limit: number = 10) {
  // Mock Egypt common drugs
  const mockDrugs = [
    { name: 'Paracetamol 500mg', category: 'Analgesic' },
    { name: 'Amoxicillin 500mg', category: 'Antibiotic' },
    { name: 'Ibuprofen 400mg', category: 'NSAID' },
    { name: 'Augmentin 1g', category: 'Antibiotic' },
    { name: 'Cetal 500mg', category: 'Analgesic' },
    { name: 'Antinal', category: 'Antidiarrheal' },
    { name: 'Amrizole', category: 'Antibiotic' },
    { name: 'Comtrex', category: 'Cold & Flu' },
    { name: 'ORS', category: 'Rehydration' },
    { name: 'Zinc Sulfate', category: 'Supplement' },
    { name: 'Aspirin 75mg', category: 'Antiplatelet' },
    { name: 'Metformin 500mg', category: 'Antidiabetic' },
    { name: 'Amlodipine 5mg', category: 'Antihypertensive' },
    { name: 'Concor 5mg', category: 'Beta Blocker' },
    { name: 'Lipitor 20mg', category: 'Statin' },
  ]
  
  const filtered = mockDrugs.filter(drug =>
    drug.name.toLowerCase().includes(query.toLowerCase())
  )
  
  return filtered.slice(0, limit)
}

/**
 * Common medication frequencies
 */
export const MEDICATION_FREQUENCIES = [
  { value: 'once-daily', label: 'Once daily', shorthand: 'OD' },
  { value: 'twice-daily', label: 'Twice daily', shorthand: 'BD' },
  { value: 'three-times-daily', label: 'Three times daily', shorthand: 'TDS' },
  { value: 'four-times-daily', label: 'Four times daily', shorthand: 'QDS' },
  { value: 'every-6-hours', label: 'Every 6 hours', shorthand: 'Q6H' },
  { value: 'every-8-hours', label: 'Every 8 hours', shorthand: 'Q8H' },
  { value: 'before-meals', label: 'Before meals', shorthand: 'AC' },
  { value: 'after-meals', label: 'After meals', shorthand: 'PC' },
  { value: 'at-bedtime', label: 'At bedtime', shorthand: 'HS' },
  { value: 'as-needed', label: 'As needed', shorthand: 'PRN' },
]

/**
 * Common medication durations
 */
export const MEDICATION_DURATIONS = [
  { value: '3-days', label: '3 days' },
  { value: '5-days', label: '5 days' },
  { value: '7-days', label: '7 days' },
  { value: '10-days', label: '10 days' },
  { value: '14-days', label: '14 days' },
  { value: '1-month', label: '1 month' },
  { value: '3-months', label: '3 months' },
  { value: 'ongoing', label: 'Ongoing' },
]
