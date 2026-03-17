/**
 * Input validation schemas for MedAssist API endpoints
 * Standalone implementation (no external dependencies)
 *
 * Phase D4: Input validation for Layer 2 readiness
 */

// ============================================================================
// VALIDATION TYPES
// ============================================================================

export interface ValidationError {
  field: string
  message: string
}

export interface ValidationResult<T> {
  success: boolean
  data?: T
  errors?: ValidationError[]
}

// ============================================================================
// HELPER VALIDATORS
// ============================================================================

function isString(val: unknown): val is string {
  return typeof val === 'string'
}

function isNumber(val: unknown): val is number {
  return typeof val === 'number' && !isNaN(val)
}

function isUUID(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
}

function isEmail(val: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)
}

function isPhone(val: string): boolean {
  return val.length >= 8 && val.length <= 20
}

// ============================================================================
// AUTH SCHEMAS
// ============================================================================

export function validateRegister(body: any): ValidationResult<{
  phone: string
  email?: string
  password: string
  role: 'doctor' | 'patient' | 'frontdesk'
  fullName: string
  specialty?: string
  clinicUniqueId?: string
}> {
  const errors: ValidationError[] = []

  if (!isString(body?.phone) || !isPhone(body.phone)) {
    errors.push({ field: 'phone', message: 'Valid phone number required (8-20 chars)' })
  }
  if (body?.email && !isEmail(body.email)) {
    errors.push({ field: 'email', message: 'Invalid email format' })
  }
  if (!isString(body?.password) || body.password.length < 6) {
    errors.push({ field: 'password', message: 'Password must be at least 6 characters' })
  }
  if (!['doctor', 'patient', 'frontdesk'].includes(body?.role)) {
    errors.push({ field: 'role', message: 'Role must be doctor, patient, or frontdesk' })
  }
  if (!isString(body?.fullName) || body.fullName.trim().length < 2) {
    errors.push({ field: 'fullName', message: 'Full name required (at least 2 characters)' })
  }

  if (errors.length > 0) return { success: false, errors }
  return { success: true, data: body }
}

export function validateLogin(body: any): ValidationResult<{
  phone: string
  password: string
}> {
  const errors: ValidationError[] = []

  if (!isString(body?.phone) || body.phone.length < 1) {
    errors.push({ field: 'phone', message: 'Phone number required' })
  }
  if (!isString(body?.password) || body.password.length < 1) {
    errors.push({ field: 'password', message: 'Password required' })
  }

  if (errors.length > 0) return { success: false, errors }
  return { success: true, data: body }
}

// ============================================================================
// CLINICAL SCHEMAS
// ============================================================================

export function validateClinicalNote(body: any): ValidationResult<{
  patientId: string
  chiefComplaint: string[]
  diagnosis?: Array<{ text: string; icd10_code?: string }>
  medications?: Array<{
    name: string
    drug?: string
    drugId?: string
    type: string
    frequency: string
    duration: string
    strength?: string
    instructions?: string
    notes?: string
  }>
  examination?: string
  plan?: string
  followUp?: string
}> {
  const errors: ValidationError[] = []

  if (!isString(body?.patientId) || !isUUID(body.patientId)) {
    errors.push({ field: 'patientId', message: 'Valid patient UUID required' })
  }
  if (!Array.isArray(body?.chiefComplaint) || body.chiefComplaint.length < 1) {
    errors.push({ field: 'chiefComplaint', message: 'At least one chief complaint required' })
  }
  if (body?.medications && Array.isArray(body.medications)) {
    body.medications.forEach((med: any, i: number) => {
      if (!isString(med?.name) || med.name.length < 1) {
        errors.push({ field: `medications[${i}].name`, message: 'Medication name required' })
      }
      if (!isString(med?.frequency)) {
        errors.push({ field: `medications[${i}].frequency`, message: 'Frequency required' })
      }
      if (!isString(med?.duration)) {
        errors.push({ field: `medications[${i}].duration`, message: 'Duration required' })
      }
    })
  }

  if (errors.length > 0) return { success: false, errors }
  return { success: true, data: body }
}

// ============================================================================
// APPOINTMENT SCHEMAS
// ============================================================================

export function validateAppointment(body: any): ValidationResult<{
  patientId: string
  doctorId: string
  startTime: string
  durationMinutes?: number
  type?: 'regular' | 'followup' | 'consultation'
  notes?: string
}> {
  const errors: ValidationError[] = []

  if (!isString(body?.patientId) || !isUUID(body.patientId)) {
    errors.push({ field: 'patientId', message: 'Valid patient UUID required' })
  }
  if (!isString(body?.doctorId) || !isUUID(body.doctorId)) {
    errors.push({ field: 'doctorId', message: 'Valid doctor UUID required' })
  }
  if (!isString(body?.startTime)) {
    errors.push({ field: 'startTime', message: 'Start time required' })
  }
  if (body?.durationMinutes !== undefined && (!isNumber(body.durationMinutes) || body.durationMinutes < 5 || body.durationMinutes > 120)) {
    errors.push({ field: 'durationMinutes', message: 'Duration must be 5-120 minutes' })
  }
  if (body?.type && !['regular', 'followup', 'consultation'].includes(body.type)) {
    errors.push({ field: 'type', message: 'Type must be regular, followup, or consultation' })
  }

  if (errors.length > 0) return { success: false, errors }
  return { success: true, data: body }
}

// ============================================================================
// CHECK-IN SCHEMA
// ============================================================================

export function validateCheckIn(body: any): ValidationResult<{
  patientId: string
  doctorId?: string
  queueType: 'walkin' | 'appointment' | 'emergency'
}> {
  const errors: ValidationError[] = []

  if (!isString(body?.patientId) || !isUUID(body.patientId)) {
    errors.push({ field: 'patientId', message: 'Valid patient UUID required' })
  }
  if (body?.doctorId && (!isString(body.doctorId) || !isUUID(body.doctorId))) {
    errors.push({ field: 'doctorId', message: 'Invalid doctor UUID' })
  }
  if (body?.queueType && !['walkin', 'appointment', 'emergency'].includes(body.queueType)) {
    errors.push({ field: 'queueType', message: 'Queue type must be walkin, appointment, or emergency' })
  }

  if (errors.length > 0) return { success: false, errors }
  return { success: true, data: { ...body, queueType: body.queueType || 'walkin' } }
}

// ============================================================================
// CLINIC SCHEMAS
// ============================================================================

export function validateCreateClinic(body: any): ValidationResult<{ name: string }> {
  const errors: ValidationError[] = []
  if (!isString(body?.name) || body.name.trim().length < 2) {
    errors.push({ field: 'name', message: 'Clinic name required (at least 2 characters)' })
  }
  if (errors.length > 0) return { success: false, errors }
  return { success: true, data: body }
}

export function validateJoinClinic(body: any): ValidationResult<{ clinicUniqueId: string }> {
  const errors: ValidationError[] = []
  if (!isString(body?.clinicUniqueId) || body.clinicUniqueId.trim().length < 4) {
    errors.push({ field: 'clinicUniqueId', message: 'Valid clinic ID required (at least 4 characters)' })
  }
  if (errors.length > 0) return { success: false, errors }
  return { success: true, data: body }
}

// ============================================================================
// SEARCH SCHEMA
// ============================================================================

export function validateSearch(params: URLSearchParams): ValidationResult<{
  q: string
  limit: number
}> {
  const errors: ValidationError[] = []
  const q = params.get('q')
  const limit = params.get('limit')

  if (!q || q.trim().length < 1) {
    errors.push({ field: 'q', message: 'Search query required' })
  }

  const limitNum = limit ? parseInt(limit) : 10
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
    errors.push({ field: 'limit', message: 'Limit must be 1-50' })
  }

  if (errors.length > 0) return { success: false, errors }
  return { success: true, data: { q: q!.trim(), limit: limitNum } }
}

// ============================================================================
// PATIENT REGISTRATION
// ============================================================================

export function validatePatientRegistration(body: any): ValidationResult<{
  fullName: string
  phone: string
  email?: string
  age?: number
  sex?: 'male' | 'female'
}> {
  const errors: ValidationError[] = []

  if (!isString(body?.fullName) || body.fullName.trim().length < 2) {
    errors.push({ field: 'fullName', message: 'Full name required (at least 2 characters)' })
  }
  if (!isString(body?.phone) || !isPhone(body.phone)) {
    errors.push({ field: 'phone', message: 'Valid phone number required' })
  }
  if (body?.email && !isEmail(body.email)) {
    errors.push({ field: 'email', message: 'Invalid email format' })
  }
  if (body?.age !== undefined && (!isNumber(body.age) || body.age < 0 || body.age > 150)) {
    errors.push({ field: 'age', message: 'Age must be 0-150' })
  }
  if (body?.sex && !['male', 'female'].includes(body.sex)) {
    errors.push({ field: 'sex', message: 'Sex must be male or female' })
  }

  if (errors.length > 0) return { success: false, errors }
  return { success: true, data: body }
}
