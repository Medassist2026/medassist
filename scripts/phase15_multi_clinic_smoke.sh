#!/usr/bin/env bash
set -u

BASE_URL="${BASE_URL:-http://localhost:3001}"
TS="$(date +%Y%m%d_%H%M%S)"
ARTIFACT_DIR="/tmp/phase15_multi_clinic_${TS}"
mkdir -p "$ARTIFACT_DIR"

DOC_A_COOKIE="$ARTIFACT_DIR/doctor_a.cookies.txt"
DOC_B_COOKIE="$ARTIFACT_DIR/doctor_b.cookies.txt"
FD_COOKIE="$ARTIFACT_DIR/frontdesk.cookies.txt"
PAT_COOKIE="$ARTIFACT_DIR/patient.cookies.txt"
NO_COOKIE=""

PASS_COUNT=0
FAIL_COUNT=0
TOTAL_COUNT=0
SUMMARY_TSV="$ARTIFACT_DIR/summary.tsv"
SUMMARY_TXT="$ARTIFACT_DIR/summary.txt"
printf "id\tdescription\tresult\thttp_status\tnote\tevidence\n" > "$SUMMARY_TSV"

DOC_A_PHONE="010$(date +%H%M%S)41"
DOC_B_PHONE="010$(date +%H%M%S)42"
FD_PHONE="011$(date +%H%M%S)43"
PAT_PHONE="012$(date +%H%M%S)44"
ONBOARD_PHONE="012$(date +%H%M%S)45"

DOC_A_EMAIL="phase15.doctora.${TS}@medassist.test"
DOC_B_EMAIL="phase15.doctorb.${TS}@medassist.test"
FD_EMAIL="phase15.frontdesk.${TS}@medassist.test"
PAT_EMAIL="phase15.patient.${TS}@medassist.test"
PASSWORD="Pass1234!"

APPT_DATE="2026-12-01"
APPT_A_START="2026-12-01T09:00:00Z"
APPT_B_START="2026-12-01T10:00:00Z"

DOCTOR_A_ID=""
DOCTOR_B_ID=""
PATIENT_ID=""
APPOINTMENT_A_ID=""
QUEUE_ID=""

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
run_json_check "P15_01_register_doctor_a" "Register doctor A" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_A_PHONE\",\"email\":\"$DOC_A_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"doctor\",\"specialty\":\"general-practitioner\",\"fullName\":\"Phase15 Doctor A\"}" \
  "200" ".success == true and .role == \"doctor\""
DOCTOR_A_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P15_01_register_doctor_a.json")

run_json_check "P15_02_register_doctor_b" "Register doctor B" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_B_PHONE\",\"email\":\"$DOC_B_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"doctor\",\"specialty\":\"general-practitioner\",\"fullName\":\"Phase15 Doctor B\"}" \
  "200" ".success == true and .role == \"doctor\""
DOCTOR_B_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P15_02_register_doctor_b.json")

run_json_check "P15_03_register_frontdesk" "Register frontdesk" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$FD_PHONE\",\"email\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\",\"fullName\":\"Phase15 Frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\""

run_json_check "P15_04_register_patient" "Register patient" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"email\":\"$PAT_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"patient\",\"fullName\":\"Phase15 Patient\"}" \
  "200" ".success == true and .role == \"patient\""
PATIENT_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P15_04_register_patient.json")

run_json_check "P15_05_login_doctor_a" "Login doctor A" "POST" "$BASE_URL/api/auth/login" "$DOC_A_COOKIE" \
  "{\"phone\":\"$DOC_A_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"doctor\"}" \
  "200" ".success == true and .role == \"doctor\"" "readwrite"

run_json_check "P15_06_login_doctor_b" "Login doctor B" "POST" "$BASE_URL/api/auth/login" "$DOC_B_COOKIE" \
  "{\"phone\":\"$DOC_B_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"doctor\"}" \
  "200" ".success == true and .role == \"doctor\"" "readwrite"

run_json_check "P15_07_login_frontdesk" "Login frontdesk" "POST" "$BASE_URL/api/auth/login" "$FD_COOKIE" \
  "{\"phone\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\"" "readwrite"

run_json_check "P15_08_login_patient" "Login patient" "POST" "$BASE_URL/api/auth/login" "$PAT_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"patient\"}" \
  "200" ".success == true and .role == \"patient\"" "readwrite"

# -----------------------------------------------------------------------------
# Current multi-clinic baseline checks
# -----------------------------------------------------------------------------
run_json_check "P15_09_doctors_list_frontdesk" "Frontdesk can load doctor list (current global scope baseline)" "GET" "$BASE_URL/api/doctors/list" "$FD_COOKIE" "" \
  "200" ".success == true and (.doctors|type==\"array\") and ((.doctors|map(.id)|index(\"$DOCTOR_A_ID\")) != null) and ((.doctors|map(.id)|index(\"$DOCTOR_B_ID\")) != null)"

run_json_check "P15_10_doctors_list_doctor_scoped" "Doctor sees own doctor profile in doctors list" "GET" "$BASE_URL/api/doctors/list" "$DOC_A_COOKIE" "" \
  "200" ".success == true and (.doctors|type==\"array\") and ((.doctors|length) == 1) and (.doctors[0].id == \"$DOCTOR_A_ID\")"

run_json_check "P15_11_frontdesk_slots_validation" "Frontdesk slots endpoint validates required params" "GET" "$BASE_URL/api/frontdesk/slots" "$FD_COOKIE" "" \
  "400" ".error != null"

run_json_check "P15_12_frontdesk_slots_by_doctor_date" "Frontdesk can query slots by doctor/date" "GET" "$BASE_URL/api/frontdesk/slots?doctorId=$DOCTOR_A_ID&date=$APPT_DATE" "$FD_COOKIE" "" \
  "200" ".success == true and (.slots|type==\"array\")"

run_json_check "P15_13_frontdesk_create_appointment_regular" "Frontdesk creates appointment (regular)" "POST" "$BASE_URL/api/frontdesk/appointments/create" "$FD_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOCTOR_A_ID\",\"startTime\":\"$APPT_A_START\",\"durationMinutes\":30,\"appointmentType\":\"regular\",\"notes\":\"Phase15 regular\"}" \
  "200" ".success == true and (.appointment.id|type==\"string\") and .appointment.appointment_type == \"regular\" and (.appointment|has(\"clinic_id\"))"
APPOINTMENT_A_ID=$(jq -r '.appointment.id // empty' "$ARTIFACT_DIR/P15_13_frontdesk_create_appointment_regular.json")

run_json_check "P15_14_frontdesk_create_appointment_followup_alias" "Frontdesk creates appointment with follow-up alias normalization" "POST" "$BASE_URL/api/frontdesk/appointments/create" "$FD_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOCTOR_A_ID\",\"startTime\":\"$APPT_B_START\",\"durationMinutes\":30,\"appointmentType\":\"follow-up\",\"notes\":\"Phase15 followup alias\"}" \
  "200" ".success == true and (.appointment.id|type==\"string\") and .appointment.appointment_type == \"followup\""

run_json_check "P15_15_frontdesk_list_appointments_by_date" "Frontdesk can list appointments by date" "GET" "$BASE_URL/api/frontdesk/appointments?date=$APPT_DATE" "$FD_COOKIE" "" \
  "200" ".success == true and (.appointments|type==\"array\") and ((.appointments|map(.id)|index(\"$APPOINTMENT_A_ID\")) != null)"

run_json_check "P15_16_frontdesk_list_appointments_by_doctor" "Frontdesk can list appointments by doctor filter" "GET" "$BASE_URL/api/frontdesk/appointments?date=$APPT_DATE&doctorId=$DOCTOR_A_ID" "$FD_COOKIE" "" \
  "200" ".success == true and (.appointments|type==\"array\") and ((.appointments|length) >= 1) and ((.appointments|map(.doctor.id == \"$DOCTOR_A_ID\")|all) == true)"

run_json_check "P15_17_frontdesk_checkin" "Frontdesk can check in patient" "POST" "$BASE_URL/api/frontdesk/checkin" "$FD_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOCTOR_A_ID\",\"appointmentId\":\"$APPOINTMENT_A_ID\",\"queueType\":\"appointment\"}" \
  "200" ".success == true and (.queueItem.id|type==\"string\")"
QUEUE_ID=$(jq -r '.queueItem.id // empty' "$ARTIFACT_DIR/P15_17_frontdesk_checkin.json")

run_json_check "P15_18_frontdesk_queue_to_in_progress" "Frontdesk can move queue item to in_progress" "POST" "$BASE_URL/api/frontdesk/queue/update" "$FD_COOKIE" \
  "{\"queueId\":\"$QUEUE_ID\",\"status\":\"in_progress\"}" \
  "200" ".success == true"

run_json_check "P15_19_frontdesk_queue_to_completed" "Frontdesk can complete queue item" "POST" "$BASE_URL/api/frontdesk/queue/update" "$FD_COOKIE" \
  "{\"queueId\":\"$QUEUE_ID\",\"status\":\"completed\"}" \
  "200" ".success == true"

run_json_check "P15_20_frontdesk_create_payment" "Frontdesk can create payment record" "POST" "$BASE_URL/api/frontdesk/payments/create" "$FD_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOCTOR_A_ID\",\"amount\":450,\"paymentMethod\":\"cash\",\"appointmentId\":\"$APPOINTMENT_A_ID\",\"notes\":\"Phase15 payment\"}" \
  "200" ".success == true and (.payment.id|type==\"string\")"

run_json_check "P15_21_frontdesk_onboard_requires_doctor_id" "Frontdesk onboarding requires doctor assignment" "POST" "$BASE_URL/api/patients/onboard" "$FD_COOKIE" \
  "{\"phone\":\"$ONBOARD_PHONE\",\"fullName\":\"Phase15 Walkin\",\"age\":31,\"sex\":\"Male\"}" \
  "400" ".error != null"

run_json_check "P15_22_frontdesk_onboard_success" "Frontdesk can onboard walk-in with explicit doctor" "POST" "$BASE_URL/api/patients/onboard" "$FD_COOKIE" \
  "{\"phone\":\"$ONBOARD_PHONE\",\"fullName\":\"Phase15 Walkin\",\"age\":31,\"sex\":\"Male\",\"doctorId\":\"$DOCTOR_A_ID\"}" \
  "200,201" ".success == true and .patient.id != null"

# -----------------------------------------------------------------------------
# Auth boundary checks
# -----------------------------------------------------------------------------
run_json_check "P15_23_unauth_frontdesk_appointments_guard" "Unauthenticated frontdesk appointments list returns 401" "GET" "$BASE_URL/api/frontdesk/appointments?date=$APPT_DATE" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P15_24_doctor_frontdesk_appointments_forbidden" "Doctor blocked from frontdesk appointments list API" "GET" "$BASE_URL/api/frontdesk/appointments?date=$APPT_DATE" "$DOC_A_COOKIE" "" \
  "403" ".error != null"

run_json_check "P15_25_patient_frontdesk_appointments_forbidden" "Patient blocked from frontdesk appointments list API" "GET" "$BASE_URL/api/frontdesk/appointments?date=$APPT_DATE" "$PAT_COOKIE" "" \
  "403" ".error != null"

run_json_check "P15_26_unauth_appointments_create_guard" "Unauthenticated appointment create returns 401" "POST" "$BASE_URL/api/frontdesk/appointments/create" "$NO_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOCTOR_A_ID\",\"startTime\":\"$APPT_A_START\",\"durationMinutes\":30}" \
  "401" ".error != null"

run_json_check "P15_27_doctor_appointments_create_forbidden" "Doctor blocked from frontdesk appointment create API" "POST" "$BASE_URL/api/frontdesk/appointments/create" "$DOC_A_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOCTOR_A_ID\",\"startTime\":\"$APPT_A_START\",\"durationMinutes\":30}" \
  "403" ".error != null"

run_json_check "P15_28_unauth_doctors_list_guard" "Unauthenticated doctors list should return 401" "GET" "$BASE_URL/api/doctors/list" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P15_29_patient_doctors_list_forbidden" "Patient should be blocked from doctors list API" "GET" "$BASE_URL/api/doctors/list" "$PAT_COOKIE" "" \
  "403" ".error != null"

run_json_check "P15_30_unauth_slots_guard" "Unauthenticated slots should return 401" "GET" "$BASE_URL/api/frontdesk/slots?doctorId=$DOCTOR_A_ID&date=$APPT_DATE" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P15_31_doctor_slots_forbidden" "Doctor should be blocked from frontdesk slots API" "GET" "$BASE_URL/api/frontdesk/slots?doctorId=$DOCTOR_A_ID&date=$APPT_DATE" "$DOC_A_COOKIE" "" \
  "403" ".error != null"

# -----------------------------------------------------------------------------
# Route reachability
# -----------------------------------------------------------------------------
run_page_check "P15_32_frontdesk_appointments_page" "Frontdesk appointments page reachable" "$BASE_URL/frontdesk/appointments/new" "$FD_COOKIE" \
  "200"

run_page_check "P15_33_frontdesk_checkin_page" "Frontdesk checkin page reachable" "$BASE_URL/frontdesk/checkin" "$FD_COOKIE" \
  "200"

# -----------------------------------------------------------------------------
# Phase 15 roadmap gap tracking (multi-clinic surfaces not yet implemented)
# -----------------------------------------------------------------------------
run_json_check "P15_34_gap_clinics_api" "GAP: clinics CRUD API currently missing" "GET" "$BASE_URL/api/clinics" "$FD_COOKIE" "" \
  "404"

run_json_check "P15_35_gap_current_clinic_api" "GAP: current-clinic context API currently missing" "GET" "$BASE_URL/api/clinics/current" "$DOC_A_COOKIE" "" \
  "404"

run_json_check "P15_36_gap_switch_clinic_api" "GAP: clinic switching API currently missing" "POST" "$BASE_URL/api/clinics/switch" "$DOC_A_COOKIE" \
  "{\"clinicId\":\"dummy\"}" \
  "404"

run_json_check "P15_37_gap_transfer_patient_api" "GAP: inter-clinic transfer API currently missing" "POST" "$BASE_URL/api/clinics/transfer-patient" "$FD_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"toClinicId\":\"dummy\"}" \
  "404"

run_json_check "P15_38_gap_clinic_analytics_api" "GAP: clinic analytics API currently missing" "GET" "$BASE_URL/api/clinics/analytics" "$DOC_A_COOKIE" "" \
  "404"

run_json_check "P15_39_gap_clinic_doctors_api" "GAP: clinic-doctors association API currently missing" "GET" "$BASE_URL/api/clinic-doctors" "$DOC_A_COOKIE" "" \
  "404"

run_page_check "P15_40_gap_doctor_clinics_page" "GAP: doctor clinics page currently missing" "$BASE_URL/doctor/clinics" "$DOC_A_COOKIE" \
  "404"

run_page_check "P15_41_gap_frontdesk_clinics_page" "GAP: frontdesk clinics page currently missing" "$BASE_URL/frontdesk/clinics" "$FD_COOKIE" \
  "404"

run_page_check "P15_42_gap_patient_clinics_page" "GAP: patient clinics page currently missing" "$BASE_URL/patient/clinics" "$PAT_COOKIE" \
  "404"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
{
  echo "Phase 15 Multi-Clinic Smoke"
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
  --arg doctor_a_id "$DOCTOR_A_ID" \
  --arg doctor_b_id "$DOCTOR_B_ID" \
  --arg patient_id "$PATIENT_ID" \
  --arg appointment_a_id "$APPOINTMENT_A_ID" \
  --arg queue_id "$QUEUE_ID" \
  '{artifacts:$artifacts, ids:{doctor_a:$doctor_a_id, doctor_b:$doctor_b_id, patient:$patient_id, appointment_a:$appointment_a_id, queue:$queue_id}}' \
  > "$ARTIFACT_DIR/context.json"

echo "$ARTIFACT_DIR"
