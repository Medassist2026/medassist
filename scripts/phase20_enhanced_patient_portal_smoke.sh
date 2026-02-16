#!/usr/bin/env bash
set -u

BASE_URL="${BASE_URL:-http://localhost:3001}"
TS="$(date +%Y%m%d_%H%M%S)"
ARTIFACT_DIR="/tmp/phase20_enhanced_patient_portal_${TS}"
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

DOC_PHONE="010$(date +%H%M%S)51"
FD_PHONE="011$(date +%H%M%S)52"
PAT_PHONE="012$(date +%H%M%S)53"
DOC_EMAIL="phase20.doctor.${TS}@medassist.test"
FD_EMAIL="phase20.frontdesk.${TS}@medassist.test"
PAT_EMAIL="phase20.patient.${TS}@medassist.test"
PASSWORD="Pass1234!"

APPT_DATE="2026-12-04"
APPT_START="2026-12-04T11:00:00Z"
TODAY="$(date +%Y-%m-%d)"

DOCTOR_ID=""
PATIENT_ID=""
APPOINTMENT_ID=""
PAYMENT_ID=""
RECORD_ID=""
CONDITION_ID=""
ALLERGY_ID=""
IMMUNIZATION_ID=""
MEDICATION_ID=""
MESSAGE_ID=""

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
run_json_check "P20_01_register_doctor" "Register doctor" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"email\":\"$DOC_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"doctor\",\"specialty\":\"general-practitioner\",\"fullName\":\"Phase20 Doctor\"}" \
  "200" ".success == true and .role == \"doctor\""
DOCTOR_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P20_01_register_doctor.json")

run_json_check "P20_02_register_frontdesk" "Register frontdesk" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$FD_PHONE\",\"email\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\",\"fullName\":\"Phase20 Frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\""

run_json_check "P20_03_register_patient" "Register patient" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"email\":\"$PAT_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"patient\",\"fullName\":\"Phase20 Patient\"}" \
  "200" ".success == true and .role == \"patient\""
PATIENT_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P20_03_register_patient.json")

run_json_check "P20_04_login_doctor" "Login doctor" "POST" "$BASE_URL/api/auth/login" "$DOC_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"doctor\"}" \
  "200" ".success == true and .role == \"doctor\"" "readwrite"

run_json_check "P20_05_login_frontdesk" "Login frontdesk" "POST" "$BASE_URL/api/auth/login" "$FD_COOKIE" \
  "{\"phone\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\"" "readwrite"

run_json_check "P20_06_login_patient" "Login patient" "POST" "$BASE_URL/api/auth/login" "$PAT_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"patient\"}" \
  "200" ".success == true and .role == \"patient\"" "readwrite"

run_json_check "P20_07_login_role_mismatch_guard" "Login denies role mismatch (doctor as patient)" "POST" "$BASE_URL/api/auth/login" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"patient\"}" \
  "403" ".error != null"

# -----------------------------------------------------------------------------
# Implemented enhanced patient-portal baseline
# -----------------------------------------------------------------------------
run_json_check "P20_08_frontdesk_create_appointment_seed" "Frontdesk creates scheduled appointment for patient" "POST" "$BASE_URL/api/frontdesk/appointments/create" "$FD_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOCTOR_ID\",\"startTime\":\"$APPT_START\",\"durationMinutes\":30,\"appointmentType\":\"consultation\",\"notes\":\"Phase20 seed appointment\"}" \
  "200" ".success == true and (.appointment.id|type==\"string\")"
APPOINTMENT_ID=$(jq -r '.appointment.id // empty' "$ARTIFACT_DIR/P20_08_frontdesk_create_appointment_seed.json")

run_json_check "P20_09_frontdesk_create_payment_seed" "Frontdesk records payment entry for patient journey" "POST" "$BASE_URL/api/frontdesk/payments/create" "$FD_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOCTOR_ID\",\"amount\":650,\"paymentMethod\":\"cash\",\"appointmentId\":\"$APPOINTMENT_ID\",\"notes\":\"Phase20 billing seed\"}" \
  "200" ".success == true and (.payment.id|type==\"string\")"
PAYMENT_ID=$(jq -r '.payment.id // empty' "$ARTIFACT_DIR/P20_09_frontdesk_create_payment_seed.json")

run_json_check "P20_10_patient_health_summary" "Patient health summary endpoint returns structured summary" "GET" "$BASE_URL/api/patient/health-summary" "$PAT_COOKIE" "" \
  "200" ".success == true and (.summary|type==\"object\")"

run_json_check "P20_11_patient_create_record" "Patient can add health record entry (document metadata)" "POST" "$BASE_URL/api/patient/records" "$PAT_COOKIE" \
  "{\"record_type\":\"imaging\",\"title\":\"Chest X-Ray Upload $TS\",\"description\":\"Uploaded radiology report\",\"date\":\"$TODAY\",\"provider_name\":\"Phase20 Provider\",\"facility_name\":\"Phase20 Center\"}" \
  "200" ".success == true and (.record.id|type==\"string\") and .record.record_type == \"imaging\""
RECORD_ID=$(jq -r '.record.id // empty' "$ARTIFACT_DIR/P20_11_patient_create_record.json")

run_json_check "P20_12_patient_list_records" "Patient records list includes created record" "GET" "$BASE_URL/api/patient/records" "$PAT_COOKIE" "" \
  "200" ".success == true and (.records|type==\"array\") and ((.records|map(select(.id==\"$RECORD_ID\"))|length) >= 1)"

run_json_check "P20_13_patient_create_condition" "Patient can add condition entry" "POST" "$BASE_URL/api/patient/conditions" "$PAT_COOKIE" \
  "{\"name\":\"Phase20 Hypertension $TS\",\"diagnosed_date\":\"$TODAY\",\"status\":\"active\",\"notes\":\"portal entry\"}" \
  "200" ".success == true and (.condition.id|type==\"string\")"
CONDITION_ID=$(jq -r '.condition.id // empty' "$ARTIFACT_DIR/P20_13_patient_create_condition.json")

run_json_check "P20_14_patient_list_conditions" "Patient can list conditions including created condition" "GET" "$BASE_URL/api/patient/conditions" "$PAT_COOKIE" "" \
  "200" ".success == true and (.conditions|type==\"array\") and ((.conditions|map(.id)|index(\"$CONDITION_ID\")) != null)"

run_json_check "P20_15_patient_create_allergy" "Patient can add allergy entry" "POST" "$BASE_URL/api/patient/allergies" "$PAT_COOKIE" \
  "{\"allergen\":\"Phase20 Allergen $TS\",\"reaction\":\"Rash\",\"severity\":\"mild\",\"recorded_date\":\"$TODAY\",\"notes\":\"portal entry\"}" \
  "200" ".success == true and (.allergy.id|type==\"string\")"
ALLERGY_ID=$(jq -r '.allergy.id // empty' "$ARTIFACT_DIR/P20_15_patient_create_allergy.json")

run_json_check "P20_16_patient_list_allergies" "Patient can list allergies including created allergy" "GET" "$BASE_URL/api/patient/allergies" "$PAT_COOKIE" "" \
  "200" ".success == true and (.allergies|type==\"array\") and ((.allergies|map(.allergen)|index(\"Phase20 Allergen $TS\")) != null)"

run_json_check "P20_17_patient_create_immunization" "Patient can add immunization entry" "POST" "$BASE_URL/api/patient/immunizations" "$PAT_COOKIE" \
  "{\"vaccine_name\":\"Phase20 Vaccine $TS\",\"administered_date\":\"$TODAY\",\"provider_name\":\"Phase20 Clinic\",\"dose\":\"1st\",\"notes\":\"portal entry\"}" \
  "200" ".success == true and (.immunization.id|type==\"string\")"
IMMUNIZATION_ID=$(jq -r '.immunization.id // empty' "$ARTIFACT_DIR/P20_17_patient_create_immunization.json")

run_json_check "P20_18_patient_list_immunizations" "Patient can list immunizations including created immunization" "GET" "$BASE_URL/api/patient/immunizations" "$PAT_COOKIE" "" \
  "200" ".success == true and (.immunizations|type==\"array\") and ((.immunizations|map(.vaccine_name)|index(\"Phase20 Vaccine $TS\")) != null)"

run_json_check "P20_19_patient_create_medication" "Patient can add medication entry" "POST" "$BASE_URL/api/patient/medications" "$PAT_COOKIE" \
  "{\"medication_name\":\"Phase20 Vitamin C\",\"dosage\":\"500 mg\",\"frequency\":\"daily\",\"start_date\":\"$TODAY\",\"purpose\":\"General wellness\"}" \
  "200" ".success == true and (.medication.id|type==\"string\")"
MEDICATION_ID=$(jq -r '.medication.id // empty' "$ARTIFACT_DIR/P20_19_patient_create_medication.json")

run_json_check "P20_20_patient_list_medications" "Patient can list medications including created medication" "GET" "$BASE_URL/api/patient/medications" "$PAT_COOKIE" "" \
  "200" ".success == true and (.medications|type==\"array\") and ((.medications|map(select(.id==\"$MEDICATION_ID\"))|length) >= 1)"

run_json_check "P20_21_patient_lab_results" "Patient lab results endpoint returns structured response" "GET" "$BASE_URL/api/patient/lab-results" "$PAT_COOKIE" "" \
  "200" ".success == true and (.orders|type==\"array\")"

run_json_check "P20_22_patient_vitals" "Patient vitals endpoint returns structured response" "GET" "$BASE_URL/api/patient/vitals" "$PAT_COOKIE" "" \
  "200" ".success == true and (.vitals|type==\"array\")"

run_json_check "P20_23_patient_conversations" "Patient conversations endpoint returns list" "GET" "$BASE_URL/api/patient/messages/conversations" "$PAT_COOKIE" "" \
  "200" ".success == true and (.conversations|type==\"array\")"

run_json_check "P20_24_patient_send_message" "Patient can send message to doctor from portal" "POST" "$BASE_URL/api/patient/messages" "$PAT_COOKIE" \
  "{\"doctor_id\":\"$DOCTOR_ID\",\"content\":\"Phase20 patient message\"}" \
  "200" ".success == true and (.message.id|type==\"string\")"
MESSAGE_ID=$(jq -r '.message.id // empty' "$ARTIFACT_DIR/P20_24_patient_send_message.json")

run_json_check "P20_25_patient_get_messages" "Patient can fetch message thread with doctor" "GET" "$BASE_URL/api/patient/messages?doctorId=$DOCTOR_ID" "$PAT_COOKIE" "" \
  "200" ".success == true and (.messages|type==\"array\") and ((.messages|map(select(.id==\"$MESSAGE_ID\"))|length) >= 1)"

run_page_check "P20_26_patient_dashboard_page" "Patient dashboard page reachable" "$BASE_URL/patient/dashboard" "$PAT_COOKIE" \
  "200"

run_page_check "P20_27_patient_records_page" "Patient records page reachable" "$BASE_URL/patient/records" "$PAT_COOKIE" \
  "200"

run_page_check "P20_28_patient_medications_page" "Patient medications page reachable" "$BASE_URL/patient/medications" "$PAT_COOKIE" \
  "200"

run_page_check "P20_29_patient_conditions_page" "Patient conditions page reachable" "$BASE_URL/patient/conditions" "$PAT_COOKIE" \
  "200"

run_page_check "P20_30_patient_lab_results_page" "Patient lab results page reachable" "$BASE_URL/patient/lab-results" "$PAT_COOKIE" \
  "200"

run_page_check "P20_31_patient_messages_page" "Patient messages page reachable" "$BASE_URL/patient/messages" "$PAT_COOKIE" \
  "200"

# -----------------------------------------------------------------------------
# Auth/RBAC boundaries for implemented APIs/pages
# -----------------------------------------------------------------------------
run_json_check "P20_32_unauth_records_guard" "Unauthenticated patient records returns 401" "GET" "$BASE_URL/api/patient/records" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P20_33_doctor_records_forbidden" "Doctor blocked from patient records API" "GET" "$BASE_URL/api/patient/records" "$DOC_COOKIE" "" \
  "403" ".error != null"

run_json_check "P20_34_frontdesk_records_forbidden" "Frontdesk blocked from patient records API" "GET" "$BASE_URL/api/patient/records" "$FD_COOKIE" "" \
  "403" ".error != null"

run_json_check "P20_35_unauth_conditions_guard" "Unauthenticated patient conditions returns 401" "GET" "$BASE_URL/api/patient/conditions" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P20_36_doctor_conditions_forbidden" "Doctor blocked from patient conditions API" "GET" "$BASE_URL/api/patient/conditions" "$DOC_COOKIE" "" \
  "403" ".error != null"

run_json_check "P20_37_unauth_allergies_guard" "Unauthenticated patient allergies returns 401" "GET" "$BASE_URL/api/patient/allergies" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P20_38_frontdesk_allergies_forbidden" "Frontdesk blocked from patient allergies API" "GET" "$BASE_URL/api/patient/allergies" "$FD_COOKIE" "" \
  "403" ".error != null"

run_json_check "P20_39_unauth_immunizations_guard" "Unauthenticated patient immunizations returns 401" "GET" "$BASE_URL/api/patient/immunizations" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P20_40_doctor_immunizations_forbidden" "Doctor blocked from patient immunizations API" "GET" "$BASE_URL/api/patient/immunizations" "$DOC_COOKIE" "" \
  "403" ".error != null"

run_json_check "P20_41_unauth_messages_guard" "Unauthenticated patient messages returns 401" "GET" "$BASE_URL/api/patient/messages?doctorId=$DOCTOR_ID" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P20_42_doctor_messages_forbidden" "Doctor blocked from patient messages API" "GET" "$BASE_URL/api/patient/messages?doctorId=$DOCTOR_ID" "$DOC_COOKIE" "" \
  "403" ".error != null"

run_json_check "P20_43_unauth_send_message_guard" "Unauthenticated patient send-message returns 401" "POST" "$BASE_URL/api/patient/messages" "$NO_COOKIE" \
  "{\"doctor_id\":\"$DOCTOR_ID\",\"content\":\"blocked\"}" \
  "401" ".error != null"

run_json_check "P20_44_frontdesk_send_message_forbidden" "Frontdesk blocked from patient send-message API" "POST" "$BASE_URL/api/patient/messages" "$FD_COOKIE" \
  "{\"doctor_id\":\"$DOCTOR_ID\",\"content\":\"blocked\"}" \
  "403" ".error != null"

run_page_check "P20_45_unauth_records_page_redirect" "Unauthenticated records page redirects to login" "$BASE_URL/patient/records" "$NO_COOKIE" \
  "303,307,308" "/login"

run_page_check "P20_46_doctor_records_page_redirect" "Doctor hitting patient records redirects to doctor dashboard" "$BASE_URL/patient/records" "$DOC_COOKIE" \
  "303,307,308" "/doctor/dashboard"

run_page_check "P20_47_frontdesk_records_page_redirect" "Frontdesk hitting patient records redirects to frontdesk dashboard" "$BASE_URL/patient/records" "$FD_COOKIE" \
  "303,307,308" "/frontdesk/dashboard"

# -----------------------------------------------------------------------------
# Phase 20 roadmap gaps (expected, currently unimplemented)
# -----------------------------------------------------------------------------
run_page_check "P20_48_gap_patient_appointment_booking_page" "GAP: patient-initiated appointment booking page currently missing" "$BASE_URL/patient/appointments/book" "$PAT_COOKIE" \
  "404"

run_page_check "P20_49_gap_patient_refills_page" "GAP: prescription refill requests page currently missing" "$BASE_URL/patient/refills" "$PAT_COOKIE" \
  "404"

run_page_check "P20_50_gap_patient_documents_page" "GAP: document upload page currently missing" "$BASE_URL/patient/documents" "$PAT_COOKIE" \
  "404"

run_page_check "P20_51_gap_patient_insurance_page" "GAP: insurance management page currently missing" "$BASE_URL/patient/insurance" "$PAT_COOKIE" \
  "404"

run_page_check "P20_52_gap_patient_billing_page" "GAP: payment history and billing page currently missing" "$BASE_URL/patient/billing" "$PAT_COOKIE" \
  "404"

run_page_check "P20_53_gap_patient_family_page" "GAP: family/dependents management page currently missing" "$BASE_URL/patient/family" "$PAT_COOKIE" \
  "404"

run_json_check "P20_54_gap_appointment_requests_api" "GAP: patient appointment-requests API currently missing" "POST" "$BASE_URL/api/patient/appointment-requests" "$PAT_COOKIE" \
  "{\"doctor_id\":\"$DOCTOR_ID\",\"preferred_date\":\"$TODAY\",\"reason\":\"Follow-up\"}" \
  "404"

run_json_check "P20_55_gap_refill_requests_api" "GAP: refill-requests API currently missing" "POST" "$BASE_URL/api/patient/refill-requests" "$PAT_COOKIE" \
  "{\"medication_id\":\"$MEDICATION_ID\",\"notes\":\"Need refill\"}" \
  "404"

run_json_check "P20_56_gap_documents_upload_api" "GAP: patient documents upload API currently missing" "POST" "$BASE_URL/api/patient/documents/upload" "$PAT_COOKIE" \
  "{\"file_name\":\"insurance-card.jpg\",\"file_type\":\"image/jpeg\"}" \
  "404"

run_json_check "P20_57_gap_insurance_api" "GAP: patient insurance API currently missing" "GET" "$BASE_URL/api/patient/insurance" "$PAT_COOKIE" "" \
  "404"

run_json_check "P20_58_gap_billing_history_api" "GAP: patient billing history API currently missing" "GET" "$BASE_URL/api/patient/billing/history" "$PAT_COOKIE" "" \
  "404"

run_json_check "P20_59_gap_dependents_api" "GAP: patient dependents API currently missing" "GET" "$BASE_URL/api/patient/dependents" "$PAT_COOKIE" "" \
  "404"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
{
  echo "Phase 20 Enhanced Patient Portal Smoke"
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
  --arg appointment_id "$APPOINTMENT_ID" \
  --arg payment_id "$PAYMENT_ID" \
  --arg record_id "$RECORD_ID" \
  --arg condition_id "$CONDITION_ID" \
  --arg allergy_id "$ALLERGY_ID" \
  --arg immunization_id "$IMMUNIZATION_ID" \
  --arg medication_id "$MEDICATION_ID" \
  --arg message_id "$MESSAGE_ID" \
  '{artifacts:$artifacts, ids:{doctor:$doctor_id, patient:$patient_id, appointment:$appointment_id, payment:$payment_id, record:$record_id, condition:$condition_id, allergy:$allergy_id, immunization:$immunization_id, medication:$medication_id, message:$message_id}}' \
  > "$ARTIFACT_DIR/context.json"

echo "$ARTIFACT_DIR"
