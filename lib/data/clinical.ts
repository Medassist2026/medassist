import { createClient } from '@/lib/supabase/server'

// ============================================================================
// TYPES
// ============================================================================

export interface VitalSigns {
  id: string
  patient_id: string
  doctor_id: string
  clinical_note_id: string | null
  systolic_bp: number | null
  diastolic_bp: number | null
  heart_rate: number | null
  temperature: number | null
  respiratory_rate: number | null
  oxygen_saturation: number | null
  weight: number | null
  height: number | null
  bmi: number | null
  notes: string | null
  measured_at: string
  created_at: string
}

export interface LabTest {
  id: string
  test_code: string
  test_name: string
  category: string
  normal_range_min: number | null
  normal_range_max: number | null
  unit: string | null
  is_active: boolean
}

export interface LabOrder {
  id: string
  patient_id: string
  doctor_id: string
  clinical_note_id: string | null
  status: 'pending' | 'collected' | 'processing' | 'completed' | 'cancelled'
  priority: 'routine' | 'urgent' | 'stat'
  notes: string | null
  ordered_at: string
  collected_at: string | null
  completed_at: string | null
}

export interface LabResult {
  id: string
  lab_order_id: string
  lab_test_id: string
  result_value: number | null
  result_text: string | null
  is_abnormal: boolean
  abnormal_flag: string | null
  result_date: string
  test: LabTest
}

export interface PrescriptionData {
  prescription_number: string
  doctor_license_number: string | null
  prescription_date: string
  medications: Array<{
    name: string
    type: string
    frequency: string
    duration: string
    endDate?: string
    notes?: string
    taperingInstructions?: string
  }>
}

// ============================================================================
// VITAL SIGNS
// ============================================================================

/**
 * Record vital signs for a patient
 */
export async function recordVitalSigns(params: {
  patientId: string
  doctorId: string
  clinicalNoteId?: string
  systolicBp?: number
  diastolicBp?: number
  heartRate?: number
  temperature?: number
  respiratoryRate?: number
  oxygenSaturation?: number
  weight?: number
  height?: number
  notes?: string
}): Promise<VitalSigns> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('vital_signs')
    .insert({
      patient_id: params.patientId,
      doctor_id: params.doctorId,
      clinical_note_id: params.clinicalNoteId,
      systolic_bp: params.systolicBp,
      diastolic_bp: params.diastolicBp,
      heart_rate: params.heartRate,
      temperature: params.temperature,
      respiratory_rate: params.respiratoryRate,
      oxygen_saturation: params.oxygenSaturation,
      weight: params.weight,
      height: params.height,
      notes: params.notes
    })
    .select()
    .single()
  
  if (error) throw new Error(error.message)
  
  return data as VitalSigns
}

/**
 * Get patient vital signs history
 */
export async function getPatientVitals(
  patientId: string,
  limit: number = 10
): Promise<VitalSigns[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('vital_signs')
    .select('*')
    .eq('patient_id', patientId)
    .order('measured_at', { ascending: false })
    .limit(limit)
  
  if (error) throw new Error(error.message)
  
  return data as VitalSigns[]
}

/**
 * Get latest vitals for a patient
 */
export async function getLatestVitals(patientId: string): Promise<VitalSigns | null> {
  const vitals = await getPatientVitals(patientId, 1)
  return vitals.length > 0 ? vitals[0] : null
}

// ============================================================================
// LAB TESTS & ORDERS
// ============================================================================

/**
 * Get all lab tests catalog
 */
export async function getLabTestsCatalog(category?: string): Promise<LabTest[]> {
  const supabase = await createClient()
  
  let query = supabase
    .from('lab_tests')
    .select('*')
    .eq('is_active', true)
    .order('category')
    .order('test_name')
  
  if (category) {
    query = query.eq('category', category)
  }
  
  const { data, error } = await query
  
  if (error) throw new Error(error.message)
  
  return data as LabTest[]
}

/**
 * Get lab test categories
 */
export async function getLabTestCategories(): Promise<string[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('lab_tests')
    .select('category')
    .eq('is_active', true)
  
  if (error) throw new Error(error.message)
  
  const categories = [...new Set(data.map(t => t.category))]
  return categories.sort()
}

/**
 * Create lab order
 */
export async function createLabOrder(params: {
  patientId: string
  doctorId: string
  clinicalNoteId?: string
  testIds: string[]
  priority?: 'routine' | 'urgent' | 'stat'
  notes?: string
}): Promise<LabOrder> {
  const supabase = await createClient()
  
  // Create the order
  const { data: order, error: orderError } = await supabase
    .from('lab_orders')
    .insert({
      patient_id: params.patientId,
      doctor_id: params.doctorId,
      clinical_note_id: params.clinicalNoteId,
      priority: params.priority || 'routine',
      notes: params.notes,
      status: 'pending'
    })
    .select()
    .single()
  
  if (orderError) throw new Error(orderError.message)
  
  // Create placeholder results for each test
  const results = params.testIds.map(testId => ({
    lab_order_id: order.id,
    lab_test_id: testId
  }))
  
  const { error: resultsError } = await supabase
    .from('lab_results')
    .insert(results)
  
  if (resultsError) throw new Error(resultsError.message)
  
  return order as LabOrder
}

/**
 * Get lab orders for a patient
 */
export async function getPatientLabOrders(patientId: string): Promise<LabOrder[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('lab_orders')
    .select('*')
    .eq('patient_id', patientId)
    .order('ordered_at', { ascending: false })
  
  if (error) throw new Error(error.message)
  
  return data as LabOrder[]
}

/**
 * Get lab results for an order
 */
export async function getLabOrderResults(orderId: string): Promise<LabResult[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('lab_results')
    .select(`
      *,
      test:lab_tests (*)
    `)
    .eq('lab_order_id', orderId)
  
  if (error) throw new Error(error.message)
  
  return data as unknown as LabResult[]
}

/**
 * Update lab order status
 */
export async function updateLabOrderStatus(
  orderId: string,
  status: 'pending' | 'collected' | 'processing' | 'completed' | 'cancelled'
): Promise<void> {
  const supabase = await createClient()
  
  const updates: any = { status }
  
  if (status === 'collected') {
    updates.collected_at = new Date().toISOString()
  } else if (status === 'completed') {
    updates.completed_at = new Date().toISOString()
  }
  
  const { error } = await supabase
    .from('lab_orders')
    .update(updates)
    .eq('id', orderId)
  
  if (error) throw new Error(error.message)
}

/**
 * Update a single lab result with value and abnormal flag
 */
export async function updateLabResult(params: {
  resultId: string
  resultValue?: number
  resultText?: string
  isAbnormal?: boolean
  abnormalFlag?: 'H' | 'L' | 'HH' | 'LL' | null
}): Promise<void> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('lab_results')
    .update({
      result_value: params.resultValue,
      result_text: params.resultText,
      is_abnormal: params.isAbnormal || false,
      abnormal_flag: params.abnormalFlag,
      result_date: new Date().toISOString()
    })
    .eq('id', params.resultId)
  
  if (error) throw new Error(error.message)
}

/**
 * Calculate abnormal flag based on value and normal range
 */
export function calculateAbnormalFlag(
  value: number,
  normalMin: number | null,
  normalMax: number | null
): { isAbnormal: boolean; flag: 'H' | 'L' | 'HH' | 'LL' | null } {
  if (normalMin === null && normalMax === null) {
    return { isAbnormal: false, flag: null }
  }
  
  // Critical thresholds (20% beyond normal range)
  const criticalFactor = 0.2
  
  if (normalMin !== null && value < normalMin) {
    const criticalLow = normalMin * (1 - criticalFactor)
    if (value < criticalLow) {
      return { isAbnormal: true, flag: 'LL' }
    }
    return { isAbnormal: true, flag: 'L' }
  }
  
  if (normalMax !== null && value > normalMax) {
    const criticalHigh = normalMax * (1 + criticalFactor)
    if (value > criticalHigh) {
      return { isAbnormal: true, flag: 'HH' }
    }
    return { isAbnormal: true, flag: 'H' }
  }
  
  return { isAbnormal: false, flag: null }
}

/**
 * Get all pending/processing lab orders for a doctor
 */
export async function getDoctorLabOrders(doctorId: string, status?: string): Promise<any[]> {
  const supabase = await createClient()
  
  let query = supabase
    .from('lab_orders')
    .select(`
      *,
      patient:patients (id, full_name, phone, age, sex),
      results:lab_results (
        *,
        test:lab_tests (*)
      )
    `)
    .eq('doctor_id', doctorId)
    .order('ordered_at', { ascending: false })
  
  if (status) {
    query = query.eq('status', status)
  }
  
  const { data, error } = await query
  
  if (error) throw new Error(error.message)
  
  return data
}

/**
 * Get a single lab order with full details
 */
export async function getLabOrderDetails(orderId: string): Promise<any> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('lab_orders')
    .select(`
      *,
      patient:patients (id, full_name, phone, age, sex),
      doctor:doctors (id, full_name, specialty),
      results:lab_results (
        *,
        test:lab_tests (*)
      )
    `)
    .eq('id', orderId)
    .single()
  
  if (error) throw new Error(error.message)
  
  return data
}

/**
 * Batch update lab results and mark order as completed
 */
export async function submitLabResults(
  orderId: string,
  results: Array<{
    resultId: string
    value: number
    isAbnormal: boolean
    abnormalFlag: 'H' | 'L' | 'HH' | 'LL' | null
  }>
): Promise<void> {
  const supabase = await createClient()
  
  // Update each result
  for (const result of results) {
    const { error } = await supabase
      .from('lab_results')
      .update({
        result_value: result.value,
        is_abnormal: result.isAbnormal,
        abnormal_flag: result.abnormalFlag,
        result_date: new Date().toISOString()
      })
      .eq('id', result.resultId)
    
    if (error) throw new Error(error.message)
  }
  
  // Mark order as completed
  await updateLabOrderStatus(orderId, 'completed')
}

// ============================================================================
// PRESCRIPTIONS
// ============================================================================

/**
 * Generate unique prescription number
 */
export async function generatePrescriptionNumber(): Promise<string> {
  const supabase = await createClient()
  
  const { data, error } = await supabase.rpc('generate_prescription_number')
  
  if (error) throw new Error(error.message)
  
  return data as string
}

/**
 * Update clinical note with prescription info
 */
export async function updatePrescriptionInfo(
  clinicalNoteId: string,
  prescriptionNumber: string,
  doctorLicenseNumber?: string
): Promise<void> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('clinical_notes')
    .update({
      prescription_number: prescriptionNumber,
      doctor_license_number: doctorLicenseNumber,
      prescription_date: new Date().toISOString().split('T')[0]
    })
    .eq('id', clinicalNoteId)
  
  if (error) throw new Error(error.message)
}

/**
 * Mark prescription as printed
 */
export async function markPrescriptionPrinted(clinicalNoteId: string): Promise<void> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('clinical_notes')
    .update({
      prescription_printed_at: new Date().toISOString()
    })
    .eq('id', clinicalNoteId)
  
  if (error) throw new Error(error.message)
}

/**
 * Get prescription data for printing
 */
export async function getPrescriptionData(clinicalNoteId: string): Promise<any> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('clinical_notes')
    .select(`
      *,
      patient:patients (*),
      doctor:doctors (*)
    `)
    .eq('id', clinicalNoteId)
    .single()
  
  if (error) throw new Error(error.message)
  
  return data
}
