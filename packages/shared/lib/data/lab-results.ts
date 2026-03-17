// NOTE: createAdminClient is imported dynamically in async functions below
// to avoid pulling server-only code into client components that import pure data from this file.

// ============================================================================
// LAB TEST CATALOG
// ============================================================================

export interface LabTest {
  id: string
  name: string
  nameAr: string
  category: string
  unit: string
  referenceRange: string
}

export const LAB_TEST_CATALOG: LabTest[] = [
  // CBC
  { id: 'cbc', name: 'Complete Blood Count', nameAr: 'صورة دم كاملة', category: 'hematology', unit: '', referenceRange: '' },
  { id: 'wbc', name: 'White Blood Cells', nameAr: 'كرات الدم البيضاء', category: 'hematology', unit: '×10³/µL', referenceRange: '4.5-11.0' },
  { id: 'rbc', name: 'Red Blood Cells', nameAr: 'كرات الدم الحمراء', category: 'hematology', unit: '×10⁶/µL', referenceRange: '4.5-5.5' },
  { id: 'hgb', name: 'Hemoglobin', nameAr: 'هيموجلوبين', category: 'hematology', unit: 'g/dL', referenceRange: '12-17' },
  { id: 'hct', name: 'Hematocrit', nameAr: 'الهيماتوكريت', category: 'hematology', unit: '%', referenceRange: '36-48' },
  { id: 'plt', name: 'Platelets', nameAr: 'الصفائح الدموية', category: 'hematology', unit: '×10³/µL', referenceRange: '150-400' },

  // Blood Chemistry
  { id: 'fbs', name: 'Fasting Blood Sugar', nameAr: 'سكر صائم', category: 'chemistry', unit: 'mg/dL', referenceRange: '70-100' },
  { id: 'rbs', name: 'Random Blood Sugar', nameAr: 'سكر عشوائي', category: 'chemistry', unit: 'mg/dL', referenceRange: '70-140' },
  { id: 'hba1c', name: 'HbA1c', nameAr: 'السكر التراكمي', category: 'chemistry', unit: '%', referenceRange: '4.0-5.6' },
  { id: 'creatinine', name: 'Creatinine', nameAr: 'كرياتينين', category: 'kidney', unit: 'mg/dL', referenceRange: '0.6-1.2' },
  { id: 'bun', name: 'BUN', nameAr: 'يوريا', category: 'kidney', unit: 'mg/dL', referenceRange: '7-20' },
  { id: 'uric_acid', name: 'Uric Acid', nameAr: 'حمض اليوريك', category: 'kidney', unit: 'mg/dL', referenceRange: '3.5-7.2' },

  // Liver Function
  { id: 'alt', name: 'ALT (SGPT)', nameAr: 'إنزيم الكبد ALT', category: 'liver', unit: 'U/L', referenceRange: '7-56' },
  { id: 'ast', name: 'AST (SGOT)', nameAr: 'إنزيم الكبد AST', category: 'liver', unit: 'U/L', referenceRange: '10-40' },
  { id: 'alp', name: 'Alkaline Phosphatase', nameAr: 'الفوسفاتيز القلوي', category: 'liver', unit: 'U/L', referenceRange: '44-147' },
  { id: 'albumin', name: 'Albumin', nameAr: 'الألبومين', category: 'liver', unit: 'g/dL', referenceRange: '3.5-5.5' },
  { id: 'bilirubin', name: 'Total Bilirubin', nameAr: 'البيليروبين', category: 'liver', unit: 'mg/dL', referenceRange: '0.1-1.2' },

  // Lipid Panel
  { id: 'cholesterol', name: 'Total Cholesterol', nameAr: 'الكوليسترول الكلي', category: 'lipids', unit: 'mg/dL', referenceRange: '<200' },
  { id: 'ldl', name: 'LDL Cholesterol', nameAr: 'الكوليسترول الضار', category: 'lipids', unit: 'mg/dL', referenceRange: '<100' },
  { id: 'hdl', name: 'HDL Cholesterol', nameAr: 'الكوليسترول النافع', category: 'lipids', unit: 'mg/dL', referenceRange: '>40' },
  { id: 'triglycerides', name: 'Triglycerides', nameAr: 'الدهون الثلاثية', category: 'lipids', unit: 'mg/dL', referenceRange: '<150' },

  // Thyroid
  { id: 'tsh', name: 'TSH', nameAr: 'هرمون الغدة الدرقية', category: 'thyroid', unit: 'mIU/L', referenceRange: '0.4-4.0' },
  { id: 'ft3', name: 'Free T3', nameAr: 'T3 حر', category: 'thyroid', unit: 'pg/mL', referenceRange: '2.0-4.4' },
  { id: 'ft4', name: 'Free T4', nameAr: 'T4 حر', category: 'thyroid', unit: 'ng/dL', referenceRange: '0.8-1.8' },

  // Urinalysis
  { id: 'urinalysis', name: 'Complete Urinalysis', nameAr: 'تحليل بول كامل', category: 'urinalysis', unit: '', referenceRange: '' },

  // Inflammatory Markers
  { id: 'crp', name: 'C-Reactive Protein', nameAr: 'بروتين سي التفاعلي', category: 'inflammatory', unit: 'mg/L', referenceRange: '<10' },
  { id: 'esr', name: 'ESR', nameAr: 'سرعة الترسيب', category: 'inflammatory', unit: 'mm/hr', referenceRange: '0-20' },

  // Vitamins
  { id: 'vitd', name: 'Vitamin D', nameAr: 'فيتامين د', category: 'vitamins', unit: 'ng/mL', referenceRange: '30-100' },
  { id: 'vitb12', name: 'Vitamin B12', nameAr: 'فيتامين ب١٢', category: 'vitamins', unit: 'pg/mL', referenceRange: '200-900' },
  { id: 'iron', name: 'Serum Iron', nameAr: 'الحديد', category: 'vitamins', unit: 'µg/dL', referenceRange: '60-170' },
  { id: 'ferritin', name: 'Ferritin', nameAr: 'الفيريتين', category: 'vitamins', unit: 'ng/mL', referenceRange: '12-300' },
]

export const LAB_CATEGORIES = {
  hematology: { name: 'Hematology', nameAr: 'أمراض الدم' },
  chemistry: { name: 'Blood Chemistry', nameAr: 'كيمياء الدم' },
  kidney: { name: 'Kidney Function', nameAr: 'وظائف الكلى' },
  liver: { name: 'Liver Function', nameAr: 'وظائف الكبد' },
  lipids: { name: 'Lipid Panel', nameAr: 'الدهون' },
  thyroid: { name: 'Thyroid', nameAr: 'الغدة الدرقية' },
  urinalysis: { name: 'Urinalysis', nameAr: 'تحليل البول' },
  inflammatory: { name: 'Inflammatory Markers', nameAr: 'علامات الالتهاب' },
  vitamins: { name: 'Vitamins & Minerals', nameAr: 'الفيتامينات والمعادن' },
}

// ============================================================================
// DATA TYPES
// ============================================================================

export interface LabResult {
  id: string
  order_id: string
  test_id: string
  result_value: string | null
  is_abnormal: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface LabOrder {
  id: string
  patient_id: string
  clinic_id: string
  doctor_id: string
  status: 'pending' | 'completed' | 'cancelled'
  ordered_at: string
  created_at: string
  updated_at: string
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Parse numeric value and detect abnormality based on reference range
 */
export function parseResultValue(value: string, referenceRange: string): {
  numericValue: number | null
  isAbnormal: boolean
} {
  const numValue = parseFloat(value)
  if (isNaN(numValue)) {
    return { numericValue: null, isAbnormal: false }
  }

  if (!referenceRange) {
    return { numericValue: numValue, isAbnormal: false }
  }

  // Parse reference range (e.g., "4.5-11.0" or "<200" or ">40")
  if (referenceRange.startsWith('<')) {
    const max = parseFloat(referenceRange.substring(1))
    return { numericValue: numValue, isAbnormal: numValue >= max }
  }

  if (referenceRange.startsWith('>')) {
    const min = parseFloat(referenceRange.substring(1))
    return { numericValue: numValue, isAbnormal: numValue <= min }
  }

  // Range format: "4.5-11.0"
  const parts = referenceRange.split('-')
  if (parts.length === 2) {
    const min = parseFloat(parts[0])
    const max = parseFloat(parts[1])
    const isAbnormal = isNaN(min) ? false : isNaN(max) ? numValue < min : numValue < min || numValue > max
    return { numericValue: numValue, isAbnormal }
  }

  return { numericValue: numValue, isAbnormal: false }
}

/**
 * Get test by ID from catalog
 */
export function getTestById(testId: string): LabTest | undefined {
  return LAB_TEST_CATALOG.find(t => t.id === testId)
}

/**
 * Group tests by category
 */
export function groupTestsByCategory(): Record<string, LabTest[]> {
  const grouped: Record<string, LabTest[]> = {}
  LAB_TEST_CATALOG.forEach(test => {
    if (!grouped[test.category]) {
      grouped[test.category] = []
    }
    grouped[test.category].push(test)
  })
  return grouped
}

/**
 * Get category info by category ID
 */
export function getCategoryInfo(categoryId: string): { name: string; nameAr: string } | null {
  const category = LAB_CATEGORIES[categoryId as keyof typeof LAB_CATEGORIES]
  return category || null
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Order lab tests for a patient
 */
export async function orderLabTests(params: {
  patientId: string
  clinicId: string
  doctorId: string
  tests: Array<{ testId: string; testName: string }>
}) {
  const { createAdminClient } = await import('@shared/lib/supabase/admin')
  const adminClient = createAdminClient('lab-results')

  // Create order record
  const { data: order, error: orderError } = await adminClient
    .from('lab_results_orders')
    .insert({
      patient_id: params.patientId,
      clinic_id: params.clinicId,
      doctor_id: params.doctorId,
      status: 'pending',
      ordered_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (orderError) {
    throw new Error(`Failed to create lab order: ${orderError.message}`)
  }

  // Create result placeholders for each test
  const results = params.tests.map(test => ({
    order_id: order.id,
    test_id: test.testId,
    test_name: test.testName,
    result_value: null,
    is_abnormal: false,
  }))

  const { error: resultsError } = await adminClient
    .from('lab_results_entries')
    .insert(results)

  if (resultsError) {
    throw new Error(`Failed to create lab result entries: ${resultsError.message}`)
  }

  return order
}

/**
 * Get lab results for a patient
 */
export async function getLabResults(patientId: string, orderId?: string) {
  const { createAdminClient } = await import('@shared/lib/supabase/admin')
  const adminClient = createAdminClient('lab-results')

  let query = adminClient
    .from('lab_results_orders')
    .select(`
      *,
      results:lab_results_entries (*)
    `)
    .eq('patient_id', patientId)
    .order('ordered_at', { ascending: false })

  if (orderId) {
    query = query.eq('id', orderId)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch lab results: ${error.message}`)
  }

  return data || []
}

/**
 * Update a lab result value
 */
export async function updateLabResult(params: {
  resultId: string
  resultValue: string
  isAbnormal: boolean
  notes?: string
}) {
  const { createAdminClient } = await import('@shared/lib/supabase/admin')
  const adminClient = createAdminClient('lab-results')

  const { error } = await adminClient
    .from('lab_results_entries')
    .update({
      result_value: params.resultValue,
      is_abnormal: params.isAbnormal,
      notes: params.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.resultId)

  if (error) {
    throw new Error(`Failed to update lab result: ${error.message}`)
  }
}

/**
 * Mark lab order as completed
 */
export async function completeLabOrder(orderId: string) {
  const { createAdminClient } = await import('@shared/lib/supabase/admin')
  const adminClient = createAdminClient('lab-results')

  const { error } = await adminClient
    .from('lab_results_orders')
    .update({
      status: 'completed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)

  if (error) {
    throw new Error(`Failed to complete lab order: ${error.message}`)
  }
}

/**
 * Get patient's lab history for a specific test category
 */
export async function getPatientLabHistory(patientId: string, category?: string) {
  const { createAdminClient } = await import('@shared/lib/supabase/admin')
  const adminClient = createAdminClient('lab-results')

  let query = adminClient
    .from('lab_results_orders')
    .select(`
      *,
      results:lab_results_entries (*)
    `)
    .eq('patient_id', patientId)
    .eq('status', 'completed')
    .order('ordered_at', { ascending: false })

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch lab history: ${error.message}`)
  }

  if (!category) {
    return data || []
  }

  // Filter by category
  return (data || []).map(order => ({
    ...order,
    results: order.results?.filter((result: { test_id: string }) => {
      const test = getTestById(result.test_id)
      return test && test.category === category
    }) || [],
  })).filter(order => order.results.length > 0)
}
