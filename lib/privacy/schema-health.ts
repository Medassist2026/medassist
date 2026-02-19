import { createAdminClient } from '@/lib/supabase/admin'

const REQUIRED_TABLES = [
  'doctor_patient_relationships',
  'anonymous_visits',
  'opt_out_statistics',
  'patient_phone_history',
  'patient_consent_grants',
  'conversations'
] as const

const REQUIRED_PATIENT_COLUMNS = [
  'account_status',
  'phone_verified',
  'last_activity_at',
  'created_by_doctor_id',
  'converted_at'
] as const

let checkPromise: Promise<void> | null = null

export async function assertPrivacySchemaHealth(): Promise<void> {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return
  }

  if (process.env.MEDASSIST_SKIP_SCHEMA_HEALTH_CHECK === '1') {
    return
  }

  if (!checkPromise) {
    checkPromise = runSchemaCheck()
  }

  return checkPromise
}

async function runSchemaCheck(): Promise<void> {
  const admin = createAdminClient('schema-health-check')

  const { data: tables, error: tablesError } = await admin
    .rpc('get_public_table_names')

  if (tablesError) {
    throw new Error(`Failed schema health check (tables): ${tablesError.message}`)
  }

  const tableSet = new Set((tables || []).map((row: any) => row.table_name))
  const missingTables = REQUIRED_TABLES.filter((table) => !tableSet.has(table))
  if (missingTables.length > 0) {
    throw new Error(
      `Privacy schema health check failed. Missing tables: ${missingTables.join(', ')}. Apply reconciliation migration before startup.`
    )
  }

  const { data: patientColumns, error: columnsError } = await admin
    .rpc('get_table_columns', { p_table_name: 'patients' })

  if (columnsError) {
    throw new Error(`Failed schema health check (patients columns): ${columnsError.message}`)
  }

  const columnSet = new Set((patientColumns || []).map((row: any) => row.column_name))
  const missingColumns = REQUIRED_PATIENT_COLUMNS.filter((column) => !columnSet.has(column))
  if (missingColumns.length > 0) {
    throw new Error(
      `Privacy schema health check failed. Missing patients columns: ${missingColumns.join(', ')}. Apply reconciliation migration before startup.`
    )
  }
}
