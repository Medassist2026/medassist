#!/usr/bin/env bash
set -u

BASE_URL="${BASE_URL:-http://localhost:3001}"
TS="$(date +%Y%m%d_%H%M%S)"
ARTIFACT_DIR="/tmp/phase16_rbac_${TS}"
mkdir -p "$ARTIFACT_DIR"

DOC_COOKIE="$ARTIFACT_DIR/doctor.cookies.txt"
FD_COOKIE="$ARTIFACT_DIR/frontdesk.cookies.txt"
PAT_COOKIE="$ARTIFACT_DIR/patient.cookies.txt"
NO_COOKIE=""

PASS_COUNT=0
FAIL_COUNT=0
TOTAL_COUNT=0
SUMMARY_TSV="$ARTIFACT_DIR/summary.tsv"
SUMMARY_TXT="$ARTIFACT_DIR/summary.txt"
printf "id\tdescription\tresult\thttp_status\tnote\tevidence\n" > "$SUMMARY_TSV"

DOC_PHONE="010$(date +%H%M%S)31"
FD_PHONE="011$(date +%H%M%S)32"
PAT_PHONE="012$(date +%H%M%S)33"
DOC_EMAIL="phase16.doctor.${TS}@medassist.test"
FD_EMAIL="phase16.frontdesk.${TS}@medassist.test"
PAT_EMAIL="phase16.patient.${TS}@medassist.test"
PASSWORD="Pass1234!"

DOCTOR_ID=""
PATIENT_ID=""
PAT_QUERY=""

run_json_check() {
  local id="$1"
  local description="$2"
  local method="$3"
  local url="$4"
  local cookie_file="$5"
  local payload="${6:-}"
  local expected_status="$7"
  local jq_assert="${8:-}"
  local cookie_mode="${9:-readonly}"

  TOTAL_COUNT=$((TOTAL_COUNT + 1))
  local outfile="$ARTIFACT_DIR/${id}.json"
  local status=""

  if [[ -n "$cookie_file" && -n "$payload" ]]; then
    if [[ "$cookie_mode" == "readwrite" ]]; then
      status=$(curl -sS -X "$method" "$url" \
        -H "Content-Type: application/json" \
        -b "$cookie_file" -c "$cookie_file" \
        --data "$payload" \
        -o "$outfile" -w "%{http_code}" || echo "000")
    else
      status=$(curl -sS -X "$method" "$url" \
        -H "Content-Type: application/json" \
        -b "$cookie_file" \
        --data "$payload" \
        -o "$outfile" -w "%{http_code}" || echo "000")
    fi
  elif [[ -n "$cookie_file" ]]; then
    if [[ "$cookie_mode" == "readwrite" ]]; then
      status=$(curl -sS -X "$method" "$url" \
        -b "$cookie_file" -c "$cookie_file" \
        -o "$outfile" -w "%{http_code}" || echo "000")
    else
      status=$(curl -sS -X "$method" "$url" \
        -b "$cookie_file" \
        -o "$outfile" -w "%{http_code}" || echo "000")
    fi
  elif [[ -n "$payload" ]]; then
    status=$(curl -sS -X "$method" "$url" \
      -H "Content-Type: application/json" \
      --data "$payload" \
      -o "$outfile" -w "%{http_code}" || echo "000")
  else
    status=$(curl -sS -X "$method" "$url" \
      -o "$outfile" -w "%{http_code}" || echo "000")
  fi

  local status_ok="false"
  if [[ "$expected_status" == "2xx" ]]; then
    [[ "$status" =~ ^2[0-9][0-9]$ ]] && status_ok="true"
  elif [[ "$expected_status" == *","* ]]; then
    IFS=',' read -r -a allowed <<< "$expected_status"
    for s in "${allowed[@]}"; do
      if [[ "$status" == "$s" ]]; then
        status_ok="true"
        break
      fi
    done
  else
    [[ "$status" == "$expected_status" ]] && status_ok="true"
  fi

  local assert_ok="true"
  local note="ok"
  if [[ "$status_ok" != "true" ]]; then
    assert_ok="false"
    note="expected HTTP ${expected_status}, got ${status}"
  fi

  if [[ "$assert_ok" == "true" && -n "$jq_assert" ]]; then
    if ! jq -e "$jq_assert" "$outfile" >/dev/null 2>&1; then
      assert_ok="false"
      note="jq assertion failed: $jq_assert"
    fi
  fi

  local result="PASS"
  if [[ "$assert_ok" == "true" ]]; then
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    result="FAIL"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi

  printf "%s\t%s\t%s\t%s\t%s\t%s\n" "$id" "$description" "$result" "$status" "$note" "$outfile" >> "$SUMMARY_TSV"
}

run_page_check() {
  local id="$1"
  local description="$2"
  local url="$3"
  local cookie_file="$4"
  local expected_status="$5"
  local location_pattern="${6:-}"
  local body_pattern="${7:-}"

  TOTAL_COUNT=$((TOTAL_COUNT + 1))
  local body_out="$ARTIFACT_DIR/${id}.html"
  local headers_out="$ARTIFACT_DIR/${id}.headers.txt"
  local status

  if [[ -n "$cookie_file" ]]; then
    status=$(curl -sS -D "$headers_out" -o "$body_out" -w "%{http_code}" -X GET "$url" -b "$cookie_file" || echo "000")
  else
    status=$(curl -sS -D "$headers_out" -o "$body_out" -w "%{http_code}" -X GET "$url" || echo "000")
  fi

  local status_ok="false"
  if [[ "$expected_status" == *","* ]]; then
    IFS=',' read -r -a allowed <<< "$expected_status"
    for s in "${allowed[@]}"; do
      if [[ "$status" == "$s" ]]; then
        status_ok="true"
        break
      fi
    done
  else
    [[ "$status" == "$expected_status" ]] && status_ok="true"
  fi

  local assert_ok="true"
  local note="ok"
  if [[ "$status_ok" != "true" ]]; then
    assert_ok="false"
    note="expected HTTP ${expected_status}, got ${status}"
  fi

  if [[ "$assert_ok" == "true" && -n "$location_pattern" ]]; then
    if ! grep -Eiq "^location: .*${location_pattern}" "$headers_out"; then
      assert_ok="false"
      note="missing location header pattern: ${location_pattern}"
    fi
  fi

  if [[ "$assert_ok" == "true" && -n "$body_pattern" ]]; then
    if ! grep -Eiq "$body_pattern" "$body_out"; then
      assert_ok="false"
      note="missing body pattern: ${body_pattern}"
    fi
  fi

  local result="PASS"
  if [[ "$assert_ok" == "true" ]]; then
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    result="FAIL"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi

  printf "%s\t%s\t%s\t%s\t%s\t%s\n" "$id" "$description" "$result" "$status" "$note" "$headers_out" >> "$SUMMARY_TSV"
}

# -----------------------------------------------------------------------------
# Setup identities and sessions
# -----------------------------------------------------------------------------
run_json_check "P16_01_register_doctor" "Register doctor" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"email\":\"$DOC_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"doctor\",\"specialty\":\"general-practitioner\",\"fullName\":\"Phase16 Doctor\"}" \
  "200" ".success == true and .role == \"doctor\""
DOCTOR_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P16_01_register_doctor.json")

run_json_check "P16_02_register_frontdesk" "Register frontdesk" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$FD_PHONE\",\"email\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\",\"fullName\":\"Phase16 Frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\""

run_json_check "P16_03_register_patient" "Register patient" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"email\":\"$PAT_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"patient\",\"fullName\":\"Phase16 Patient\"}" \
  "200" ".success == true and .role == \"patient\""
PATIENT_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P16_03_register_patient.json")
PAT_QUERY="${PAT_PHONE: -4}"

run_json_check "P16_04_login_doctor" "Login doctor" "POST" "$BASE_URL/api/auth/login" "$DOC_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"doctor\"}" \
  "200" ".success == true and .role == \"doctor\"" "readwrite"

run_json_check "P16_05_login_frontdesk" "Login frontdesk" "POST" "$BASE_URL/api/auth/login" "$FD_COOKIE" \
  "{\"phone\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\"" "readwrite"

run_json_check "P16_06_login_patient" "Login patient" "POST" "$BASE_URL/api/auth/login" "$PAT_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"patient\"}" \
  "200" ".success == true and .role == \"patient\"" "readwrite"

run_json_check "P16_07_login_role_mismatch_guard" "Login denies role mismatch (doctor as patient)" "POST" "$BASE_URL/api/auth/login" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"patient\"}" \
  "403" ".error != null"

# -----------------------------------------------------------------------------
# Core role access sanity (implemented RBAC baseline)
# -----------------------------------------------------------------------------
run_json_check "P16_08_doctor_lab_orders_access" "Doctor can access doctor lab-orders API" "GET" "$BASE_URL/api/doctor/lab-orders" "$DOC_COOKIE" "" \
  "200" ".success == true and (.orders|type==\"array\")"

run_json_check "P16_09_doctor_availability_access" "Doctor can access doctor availability API" "GET" "$BASE_URL/api/doctor/availability" "$DOC_COOKIE" "" \
  "200" ".availability|type==\"object\""

run_json_check "P16_10_frontdesk_appointments_access" "Frontdesk can access frontdesk appointments API" "GET" "$BASE_URL/api/frontdesk/appointments" "$FD_COOKIE" "" \
  "200" ".success == true and (.appointments|type==\"array\")"

run_json_check "P16_11_frontdesk_slots_validation" "Frontdesk slots endpoint validates required params" "GET" "$BASE_URL/api/frontdesk/slots" "$FD_COOKIE" "" \
  "400" ".error != null"

run_json_check "P16_12_patient_health_summary_access" "Patient can access health summary API" "GET" "$BASE_URL/api/patient/health-summary" "$PAT_COOKIE" "" \
  "200" ".success == true and (.summary|type==\"object\")"

run_json_check "P16_13_doctor_doctors_list_scoped" "Doctor sees own profile in doctors list API" "GET" "$BASE_URL/api/doctors/list" "$DOC_COOKIE" "" \
  "200" ".success == true and (.doctors|type==\"array\") and ((.doctors|length) == 1) and (.doctors[0].id == \"$DOCTOR_ID\")"

run_json_check "P16_14_frontdesk_doctors_list" "Frontdesk can list doctors for operations" "GET" "$BASE_URL/api/doctors/list" "$FD_COOKIE" "" \
  "200" ".success == true and (.doctors|type==\"array\") and ((.doctors|map(.id)|index(\"$DOCTOR_ID\")) != null)"

run_json_check "P16_15_frontdesk_patient_search" "Frontdesk can search patient registry" "GET" "$BASE_URL/api/patients/search?q=$PAT_QUERY" "$FD_COOKIE" "" \
  "200" "(.patients|type==\"array\") and (.count|type==\"number\") and (.count >= 1)"

run_json_check "P16_16_doctor_patient_search" "Doctor can call patient search API" "GET" "$BASE_URL/api/patients/search?q=ab" "$DOC_COOKIE" "" \
  "200" "(.patients|type==\"array\") and (.count|type==\"number\")"

run_json_check "P16_17_doctor_my_patients" "Doctor can call my-patients API" "GET" "$BASE_URL/api/patients/my-patients" "$DOC_COOKIE" "" \
  "200" "(.patients|type==\"array\") and (.total|type==\"number\")"

run_json_check "P16_18_doctor_templates_current" "Doctor can load current template endpoint (or specialty template absent)" "GET" "$BASE_URL/api/templates/current" "$DOC_COOKIE" "" \
  "200,404"

# -----------------------------------------------------------------------------
# Strict API auth boundaries (hardened routes expected to pass)
# -----------------------------------------------------------------------------
run_json_check "P16_19_unauth_doctor_lab_orders_guard" "Unauthenticated doctor lab-orders returns 401" "GET" "$BASE_URL/api/doctor/lab-orders" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P16_20_patient_doctor_lab_orders_forbidden" "Patient blocked from doctor lab-orders API" "GET" "$BASE_URL/api/doctor/lab-orders" "$PAT_COOKIE" "" \
  "403" ".error != null"

run_json_check "P16_21_frontdesk_doctor_lab_orders_forbidden" "Frontdesk blocked from doctor lab-orders API" "GET" "$BASE_URL/api/doctor/lab-orders" "$FD_COOKIE" "" \
  "403" ".error != null"

run_json_check "P16_22_unauth_patient_health_summary_guard" "Unauthenticated patient health-summary returns 401" "GET" "$BASE_URL/api/patient/health-summary" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P16_23_doctor_patient_health_summary_forbidden" "Doctor blocked from patient health-summary API" "GET" "$BASE_URL/api/patient/health-summary" "$DOC_COOKIE" "" \
  "403" ".error != null"

run_json_check "P16_24_frontdesk_patient_health_summary_forbidden" "Frontdesk blocked from patient health-summary API" "GET" "$BASE_URL/api/patient/health-summary" "$FD_COOKIE" "" \
  "403" ".error != null"

run_json_check "P16_25_unauth_doctors_list_guard" "Unauthenticated doctors-list returns 401" "GET" "$BASE_URL/api/doctors/list" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P16_26_patient_doctors_list_forbidden" "Patient blocked from doctors-list API" "GET" "$BASE_URL/api/doctors/list" "$PAT_COOKIE" "" \
  "403" ".error != null"

run_json_check "P16_27_unauth_frontdesk_appointments_guard" "Unauthenticated frontdesk appointments returns 401" "GET" "$BASE_URL/api/frontdesk/appointments" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P16_28_doctor_frontdesk_appointments_forbidden" "Doctor blocked from frontdesk appointments API" "GET" "$BASE_URL/api/frontdesk/appointments" "$DOC_COOKIE" "" \
  "403" ".error != null"

run_json_check "P16_29_patient_frontdesk_appointments_forbidden" "Patient blocked from frontdesk appointments API" "GET" "$BASE_URL/api/frontdesk/appointments" "$PAT_COOKIE" "" \
  "403" ".error != null"

run_json_check "P16_30_unauth_patient_search_guard" "Unauthenticated patient-search returns 401" "GET" "$BASE_URL/api/patients/search?q=ab" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P16_31_patient_patient_search_forbidden" "Patient blocked from patient-search API" "GET" "$BASE_URL/api/patients/search?q=ab" "$PAT_COOKIE" "" \
  "403" ".error != null"

# -----------------------------------------------------------------------------
# Legacy auth boundary checks (strict semantics expected)
# -----------------------------------------------------------------------------
run_json_check "P16_32_unauth_frontdesk_checkin_guard" "Unauthenticated frontdesk check-in should return 401" "POST" "$BASE_URL/api/frontdesk/checkin" "$NO_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOCTOR_ID\",\"queueType\":\"walkin\"}" \
  "401" ".error != null"

run_json_check "P16_33_doctor_frontdesk_checkin_forbidden" "Doctor should be blocked from frontdesk check-in API" "POST" "$BASE_URL/api/frontdesk/checkin" "$DOC_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOCTOR_ID\",\"queueType\":\"walkin\"}" \
  "403" ".error != null"

run_json_check "P16_34_unauth_frontdesk_queue_guard" "Unauthenticated queue-update should return 401" "POST" "$BASE_URL/api/frontdesk/queue/update" "$NO_COOKIE" \
  "{\"queueId\":\"dummy\",\"status\":\"completed\"}" \
  "401" ".error != null"

run_json_check "P16_35_doctor_frontdesk_queue_forbidden" "Doctor should be blocked from queue-update API" "POST" "$BASE_URL/api/frontdesk/queue/update" "$DOC_COOKIE" \
  "{\"queueId\":\"dummy\",\"status\":\"completed\"}" \
  "403" ".error != null"

run_json_check "P16_36_unauth_doctor_availability_guard" "Unauthenticated doctor availability should return 401" "GET" "$BASE_URL/api/doctor/availability" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P16_37_patient_doctor_availability_forbidden" "Patient should be blocked from doctor availability API" "GET" "$BASE_URL/api/doctor/availability" "$PAT_COOKIE" "" \
  "403" ".error != null"

run_json_check "P16_38_frontdesk_doctor_availability_forbidden" "Frontdesk should be blocked from doctor availability API" "GET" "$BASE_URL/api/doctor/availability" "$FD_COOKIE" "" \
  "403" ".error != null"

run_json_check "P16_39_unauth_my_patients_guard" "Unauthenticated my-patients should return 401" "GET" "$BASE_URL/api/patients/my-patients" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P16_40_frontdesk_my_patients_forbidden" "Frontdesk should be blocked from my-patients API" "GET" "$BASE_URL/api/patients/my-patients" "$FD_COOKIE" "" \
  "403" ".error != null"

run_json_check "P16_41_frontdesk_templates_forbidden" "Frontdesk should be blocked from templates/current with 403" "GET" "$BASE_URL/api/templates/current" "$FD_COOKIE" "" \
  "403" ".error != null"

run_json_check "P16_42_unauth_templates_guard" "Unauthenticated templates/current should return 401" "GET" "$BASE_URL/api/templates/current" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P16_43_frontdesk_clinical_notes_forbidden" "Frontdesk should be blocked from clinical note create with 403" "POST" "$BASE_URL/api/clinical/notes" "$FD_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"noteData\":{\"chief_complaint\":[\"Headache\"]}}" \
  "403" ".error != null"

run_json_check "P16_44_unauth_clinical_notes_guard" "Unauthenticated clinical note create should return 401" "POST" "$BASE_URL/api/clinical/notes" "$NO_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"noteData\":{\"chief_complaint\":[\"Headache\"]}}" \
  "401" ".error != null"

# -----------------------------------------------------------------------------
# Page role boundary checks
# -----------------------------------------------------------------------------
run_page_check "P16_45_doctor_dashboard_page" "Doctor dashboard reachable for doctor" "$BASE_URL/doctor/dashboard" "$DOC_COOKIE" \
  "200"

run_page_check "P16_46_patient_dashboard_page" "Patient dashboard reachable for patient" "$BASE_URL/patient/dashboard" "$PAT_COOKIE" \
  "200"

run_page_check "P16_47_frontdesk_dashboard_page" "Frontdesk dashboard reachable for frontdesk" "$BASE_URL/frontdesk/dashboard" "$FD_COOKIE" \
  "200"

run_page_check "P16_48_unauth_doctor_dashboard_redirect" "Unauthenticated doctor dashboard redirects to login" "$BASE_URL/doctor/dashboard" "$NO_COOKIE" \
  "307,308" "/login"

run_page_check "P16_49_patient_to_doctor_dashboard_redirect" "Patient is redirected away from doctor dashboard" "$BASE_URL/doctor/dashboard" "$PAT_COOKIE" \
  "307,308" "/patient/dashboard"

run_page_check "P16_50_frontdesk_to_doctor_dashboard_redirect" "Frontdesk is redirected away from doctor dashboard" "$BASE_URL/doctor/dashboard" "$FD_COOKIE" \
  "307,308" "/frontdesk/dashboard"

run_page_check "P16_51_doctor_to_patient_dashboard_redirect" "Doctor is redirected away from patient dashboard" "$BASE_URL/patient/dashboard" "$DOC_COOKIE" \
  "307,308" "/doctor/dashboard"

run_page_check "P16_52_frontdesk_to_patient_dashboard_redirect" "Frontdesk is redirected away from patient dashboard" "$BASE_URL/patient/dashboard" "$FD_COOKIE" \
  "307,308" "/frontdesk/dashboard"

# -----------------------------------------------------------------------------
# Phase 16 roadmap gaps (RBAC module not implemented yet)
# -----------------------------------------------------------------------------
run_json_check "P16_53_gap_rbac_roles_api" "GAP: RBAC roles API currently missing" "GET" "$BASE_URL/api/rbac/roles" "$DOC_COOKIE" "" \
  "404"

run_json_check "P16_54_gap_rbac_permissions_api" "GAP: RBAC permissions API currently missing" "GET" "$BASE_URL/api/rbac/permissions" "$DOC_COOKIE" "" \
  "404"

run_json_check "P16_55_gap_rbac_role_permissions_api" "GAP: RBAC role-permissions API currently missing" "GET" "$BASE_URL/api/rbac/role-permissions" "$DOC_COOKIE" "" \
  "404"

run_json_check "P16_56_gap_rbac_user_roles_api" "GAP: RBAC user-roles API currently missing" "GET" "$BASE_URL/api/rbac/user-roles" "$DOC_COOKIE" "" \
  "404"

run_json_check "P16_57_gap_rbac_audit_logs_api" "GAP: RBAC audit-logs API currently missing" "GET" "$BASE_URL/api/rbac/audit-logs" "$DOC_COOKIE" "" \
  "404"

run_page_check "P16_58_gap_admin_rbac_page" "GAP: admin RBAC page currently missing" "$BASE_URL/admin/rbac" "$DOC_COOKIE" \
  "404"

run_page_check "P16_59_gap_admin_roles_page" "GAP: admin roles page currently missing" "$BASE_URL/admin/roles" "$DOC_COOKIE" \
  "404"

run_page_check "P16_60_gap_admin_permissions_page" "GAP: admin permissions page currently missing" "$BASE_URL/admin/permissions" "$DOC_COOKIE" \
  "404"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
{
  echo "Phase 16 RBAC Smoke"
  echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "Base URL: $BASE_URL"
  echo "Artifacts: $ARTIFACT_DIR"
  echo "Total: $TOTAL_COUNT"
  echo "Passed: $PASS_COUNT"
  echo "Failed: $FAIL_COUNT"
  if [[ "$FAIL_COUNT" -eq 0 ]]; then
    echo "Status: PASS"
  else
    echo "Status: FAIL"
  fi
  echo
  column -t -s $'\t' "$SUMMARY_TSV"
} | tee "$SUMMARY_TXT"

jq -n \
  --arg artifacts "$ARTIFACT_DIR" \
  --arg doctor_id "$DOCTOR_ID" \
  --arg patient_id "$PATIENT_ID" \
  '{artifacts:$artifacts, ids:{doctor:$doctor_id, patient:$patient_id}}' \
  > "$ARTIFACT_DIR/context.json"

echo "$ARTIFACT_DIR"
