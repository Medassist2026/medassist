#!/usr/bin/env bash
set -u

BASE_URL="http://localhost:3001"
TS="$(date +%Y%m%d_%H%M%S)"
ARTIFACT_DIR="/tmp/phase6_hardening_${TS}"
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

DOC_PHONE="010$(date +%H%M%S)11"
FD_PHONE="011$(date +%H%M%S)22"
PAT_PHONE="012$(date +%H%M%S)33"
DOC_EMAIL="phase6.doctor.${TS}@medassist.test"
FD_EMAIL="phase6.frontdesk.${TS}@medassist.test"
PAT_EMAIL="phase6.patient.${TS}@medassist.test"
PASSWORD="Pass1234!"
WRONG_PASSWORD="WrongPass123!"
TODAY="$(date +%Y-%m-%d)"

DOCTOR_ID=""
FRONTDESK_ID=""
PATIENT_ID=""

run_check() {
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

# -----------------------------------------------------------------------------
# Setup identities and sessions
# -----------------------------------------------------------------------------
run_check "H6_01_register_doctor" "Register doctor" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"email\":\"$DOC_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"doctor\",\"specialty\":\"general-practitioner\",\"fullName\":\"Phase6 Doctor\"}" \
  "200" ".success == true and .role == \"doctor\""
DOCTOR_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/H6_01_register_doctor.json")

run_check "H6_02_register_frontdesk" "Register frontdesk" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$FD_PHONE\",\"email\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\",\"fullName\":\"Phase6 Frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\""
FRONTDESK_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/H6_02_register_frontdesk.json")

run_check "H6_03_register_patient" "Register patient" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"email\":\"$PAT_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"patient\",\"fullName\":\"Phase6 Patient\"}" \
  "200" ".success == true and .role == \"patient\""
PATIENT_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/H6_03_register_patient.json")

run_check "H6_04_login_doctor" "Login doctor" "POST" "$BASE_URL/api/auth/login" "$DOC_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"doctor\"}" \
  "200" ".success == true and .role == \"doctor\"" "readwrite"

run_check "H6_05_login_frontdesk" "Login frontdesk by email" "POST" "$BASE_URL/api/auth/login" "$FD_COOKIE" \
  "{\"phone\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\"" "readwrite"

run_check "H6_06_login_patient" "Login patient" "POST" "$BASE_URL/api/auth/login" "$PAT_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"patient\"}" \
  "200" ".success == true and .role == \"patient\"" "readwrite"

# -----------------------------------------------------------------------------
# Auth and registration validation guards
# -----------------------------------------------------------------------------
run_check "H6_07_register_invalid_role" "Register invalid role rejected" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"01012345678\",\"password\":\"$PASSWORD\",\"role\":\"admin\",\"fullName\":\"Invalid Role\"}" \
  "400" ".error != null"

run_check "H6_08_register_doctor_missing_specialty" "Doctor register missing specialty rejected" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"01012345679\",\"password\":\"$PASSWORD\",\"role\":\"doctor\",\"fullName\":\"No Specialty\"}" \
  "400" ".error != null"

run_check "H6_09_register_missing_fullname" "Register missing fullName rejected" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"01012345670\",\"password\":\"$PASSWORD\",\"role\":\"patient\"}" \
  "400" ".error != null"

run_check "H6_10_login_wrong_password" "Login wrong password rejected" "POST" "$BASE_URL/api/auth/login" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"password\":\"$WRONG_PASSWORD\",\"role\":\"doctor\"}" \
  "401" ".error != null"

run_check "H6_11_login_role_mismatch" "Login role mismatch rejected" "POST" "$BASE_URL/api/auth/login" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"patient\"}" \
  "403" ".error != null"

# -----------------------------------------------------------------------------
# Positive canaries (sanity)
# -----------------------------------------------------------------------------
run_check "H6_12_doctor_appointments_canary" "Doctor appointments API reachable" "GET" "$BASE_URL/api/doctor/appointments?date=$TODAY" "$DOC_COOKIE" "" \
  "200" ".appointments|type==\"array\""

run_check "H6_13_patient_records_canary" "Patient records API reachable" "GET" "$BASE_URL/api/patient/records" "$PAT_COOKIE" "" \
  "200" ".success == true"

run_check "H6_14_frontdesk_doctors_canary" "Frontdesk can list doctors" "GET" "$BASE_URL/api/doctors/list" "$FD_COOKIE" "" \
  "200" "(.doctors|type==\"array\") and ((.doctors|length) > 0)"

# -----------------------------------------------------------------------------
# Input validations and business guardrails
# -----------------------------------------------------------------------------
run_check "H6_15_frontdesk_slots_missing_params" "Slots missing params returns 400" "GET" "$BASE_URL/api/frontdesk/slots" "$FD_COOKIE" "" \
  "400" ".error != null"

run_check "H6_16_frontdesk_appt_missing_fields" "Create appointment missing fields returns 400" "POST" "$BASE_URL/api/frontdesk/appointments/create" "$FD_COOKIE" \
  "{\"doctorId\":\"$DOCTOR_ID\"}" \
  "400" ".error != null"

run_check "H6_17_frontdesk_checkin_missing_fields" "Check-in missing fields returns 400" "POST" "$BASE_URL/api/frontdesk/checkin" "$FD_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\"}" \
  "400" ".error != null"

run_check "H6_18_frontdesk_payment_missing_fields" "Payment missing fields returns 400" "POST" "$BASE_URL/api/frontdesk/payments/create" "$FD_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\"}" \
  "400" ".error != null"

run_check "H6_19_frontdesk_queue_missing_fields" "Queue update missing fields returns 400" "POST" "$BASE_URL/api/frontdesk/queue/update" "$FD_COOKIE" \
  "{\"queueId\":\"\"}" \
  "400" ".error != null"

run_check "H6_20_patient_search_short_query" "Patient search enforces min query length" "GET" "$BASE_URL/api/patients/search?q=a" "$DOC_COOKIE" "" \
  "400" ".error != null"

run_check "H6_21_onboard_frontdesk_missing_doctor" "Frontdesk onboarding requires doctorId" "POST" "$BASE_URL/api/patients/onboard" "$FD_COOKIE" \
  "{}" \
  "400" ".error != null"

run_check "H6_22_patient_messages_missing_doctor" "Patient send message requires doctor id" "POST" "$BASE_URL/api/patient/messages" "$PAT_COOKIE" \
  "{\"content\":\"hello\"}" \
  "400" ".error != null"

run_check "H6_23_patient_messages_blank_content" "Patient send message requires non-empty content" "POST" "$BASE_URL/api/patient/messages" "$PAT_COOKIE" \
  "{\"doctor_id\":\"$DOCTOR_ID\",\"content\":\"\"}" \
  "400" ".error != null"

run_check "H6_24_patient_records_invalid_type" "Patient record type validated" "POST" "$BASE_URL/api/patient/records" "$PAT_COOKIE" \
  "{\"record_type\":\"invalid\",\"title\":\"x\",\"date\":\"$TODAY\"}" \
  "400" ".error != null"

run_check "H6_25_patient_records_missing_date" "Patient record requires date" "POST" "$BASE_URL/api/patient/records" "$PAT_COOKIE" \
  "{\"record_type\":\"lab_result\",\"title\":\"CBC\"}" \
  "400" ".error != null"

run_check "H6_26_doctor_messages_missing_patient" "Doctor send message requires patient id" "POST" "$BASE_URL/api/doctor/messages" "$DOC_COOKIE" \
  "{\"content\":\"hi\"}" \
  "400" ".error != null"

run_check "H6_27_doctor_messages_blank_content" "Doctor send message requires non-empty content" "POST" "$BASE_URL/api/doctor/messages" "$DOC_COOKIE" \
  "{\"patient_id\":\"$PATIENT_ID\",\"content\":\"\"}" \
  "400" ".error != null"

run_check "H6_28_clinical_notes_missing_patient" "Clinical notes requires patientId" "POST" "$BASE_URL/api/clinical/notes" "$DOC_COOKIE" \
  "{\"noteData\":{\"chief_complaint\":[\"Headache\"],\"diagnosis\":\"\",\"medications\":[],\"plan\":\"rest\"}}" \
  "400" ".error != null"

run_check "H6_29_clinical_notes_empty_complaint" "Clinical notes enforces chief complaint" "POST" "$BASE_URL/api/clinical/notes" "$DOC_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"noteData\":{\"chief_complaint\":[],\"diagnosis\":\"\",\"medications\":[],\"plan\":\"rest\"}}" \
  "400" ".error != null"

run_check "H6_30_prescription_missing_noteId" "Prescription API requires noteId" "GET" "$BASE_URL/api/clinical/prescription" "$DOC_COOKIE" "" \
  "400" ".error != null"

run_check "H6_31_appt_type_alias_accepted" "Appointment type alias follow_up is normalized and accepted" "POST" "$BASE_URL/api/frontdesk/appointments/create" "$FD_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOCTOR_ID\",\"startTime\":\"${TODAY}T11:30:00Z\",\"durationMinutes\":30,\"appointmentType\":\"follow_up\"}" \
  "2xx" ".success == true"

run_check "H6_31b_appt_type_invalid_contract" "Appointment type invalid value rejected as client error" "POST" "$BASE_URL/api/frontdesk/appointments/create" "$FD_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOCTOR_ID\",\"startTime\":\"${TODAY}T12:30:00Z\",\"durationMinutes\":30,\"appointmentType\":\"followupx\"}" \
  "400" ".error != null"

# Diary duplicate-date business rule
DIARY_DATE="$(date +%Y-%m-%d)"
run_check "H6_32_diary_create_first" "Diary allows first entry for date" "POST" "$BASE_URL/api/patient/diary" "$PAT_COOKIE" \
  "{\"date\":\"$DIARY_DATE\",\"mood\":3,\"energy\":3,\"sleep_quality\":3,\"sleep_hours\":7,\"symptoms\":[\"headache\"],\"notes\":\"phase6\"}" \
  "201" ".entry.id != null"

run_check "H6_33_diary_duplicate_guard" "Diary rejects duplicate entry same date" "POST" "$BASE_URL/api/patient/diary" "$PAT_COOKIE" \
  "{\"date\":\"$DIARY_DATE\",\"mood\":4,\"energy\":4,\"sleep_quality\":4,\"sleep_hours\":8,\"symptoms\":[],\"notes\":\"duplicate\"}" \
  "409" ".error != null"

# -----------------------------------------------------------------------------
# Security boundary semantics (strict expected statuses)
# -----------------------------------------------------------------------------
run_check "H6_34_unauth_doctor_api" "Unauthenticated access to doctor API should return 401" "GET" "$BASE_URL/api/doctor/appointments?date=$TODAY" "$NO_COOKIE" "" \
  "401" ".error != null"

run_check "H6_35_patient_to_doctor_api" "Patient must be forbidden from doctor API" "GET" "$BASE_URL/api/doctor/appointments?date=$TODAY" "$PAT_COOKIE" "" \
  "403" ".error != null"

run_check "H6_36_doctor_to_frontdesk_api" "Doctor must be forbidden from frontdesk API" "GET" "$BASE_URL/api/frontdesk/appointments?date=$TODAY" "$DOC_COOKIE" "" \
  "403" ".error != null"

run_check "H6_37_frontdesk_to_patient_api" "Frontdesk must be forbidden from patient API" "GET" "$BASE_URL/api/patient/records" "$FD_COOKIE" "" \
  "403" ".error != null"

run_check "H6_38_frontdesk_to_doctor_messages" "Frontdesk must be forbidden from doctor messaging API" "GET" "$BASE_URL/api/doctor/messages?patientId=$PATIENT_ID" "$FD_COOKIE" "" \
  "403" ".error != null"

run_check "H6_39_patient_to_frontdesk_payment" "Patient must be forbidden from frontdesk payment API" "POST" "$BASE_URL/api/frontdesk/payments/create" "$PAT_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOCTOR_ID\",\"amount\":100,\"paymentMethod\":\"cash\"}" \
  "403" ".error != null"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
{
  echo "Phase 6 Authorization + Validation Hardening Smoke"
  echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S %Z')"
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
  --arg frontdesk_id "$FRONTDESK_ID" \
  --arg patient_id "$PATIENT_ID" \
  '{artifacts:$artifacts, ids:{doctor:$doctor_id, frontdesk:$frontdesk_id, patient:$patient_id}}' \
  > "$ARTIFACT_DIR/context.json"

echo "$ARTIFACT_DIR"
