#!/usr/bin/env bash
set -u

BASE_URL="${BASE_URL:-http://localhost:3001}"
TS="$(date +%Y%m%d_%H%M%S)"
ARTIFACT_DIR="/tmp/phase8_patient_empowerment_${TS}"
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

DOC_PHONE="010$(date +%H%M%S)71"
FD_PHONE="011$(date +%H%M%S)72"
PAT_PHONE="012$(date +%H%M%S)73"
DOC_EMAIL="phase8.doctor.${TS}@medassist.test"
FD_EMAIL="phase8.frontdesk.${TS}@medassist.test"
PAT_EMAIL="phase8.patient.${TS}@medassist.test"
PASSWORD="Pass1234!"
TODAY="$(date +%Y-%m-%d)"

DOCTOR_ID=""
PATIENT_ID=""
NOTE_ID=""
REMINDER_ID=""

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
run_check "P8_01_register_doctor" "Register doctor" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"email\":\"$DOC_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"doctor\",\"specialty\":\"general-practitioner\",\"fullName\":\"Phase8 Doctor\"}" \
  "200" ".success == true and .role == \"doctor\""
DOCTOR_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P8_01_register_doctor.json")

run_check "P8_02_register_frontdesk" "Register frontdesk" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$FD_PHONE\",\"email\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\",\"fullName\":\"Phase8 Frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\""

run_check "P8_03_register_patient" "Register patient" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"email\":\"$PAT_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"patient\",\"fullName\":\"Phase8 Patient\"}" \
  "200" ".success == true and .role == \"patient\""
PATIENT_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P8_03_register_patient.json")

run_check "P8_04_login_doctor" "Login doctor" "POST" "$BASE_URL/api/auth/login" "$DOC_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"doctor\"}" \
  "200" ".success == true and .role == \"doctor\"" "readwrite"

run_check "P8_05_login_frontdesk" "Login frontdesk" "POST" "$BASE_URL/api/auth/login" "$FD_COOKIE" \
  "{\"phone\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\"" "readwrite"

run_check "P8_06_login_patient" "Login patient" "POST" "$BASE_URL/api/auth/login" "$PAT_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"patient\"}" \
  "200" ".success == true and .role == \"patient\"" "readwrite"

# -----------------------------------------------------------------------------
# Seed clinical context for patient empowerment
# -----------------------------------------------------------------------------
run_check "P8_07_doctor_creates_synced_note" "Doctor creates synced clinical note with medication" "POST" "$BASE_URL/api/clinical/notes" "$DOC_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"noteData\":{\"chief_complaint\":[\"Headache\"],\"diagnosis\":\"R51: Headache\",\"medications\":[{\"name\":\"Paracetamol\",\"frequency\":\"TID\",\"duration\":\"5 days\",\"notes\":\"After meals\"}],\"plan\":\"Hydration and rest\"},\"keystrokeCount\":90,\"durationSeconds\":300,\"syncToPatient\":true}" \
  "200" ".success == true and (.noteId|type==\"string\")"
NOTE_ID=$(jq -r '.noteId // empty' "$ARTIFACT_DIR/P8_07_doctor_creates_synced_note.json")

# -----------------------------------------------------------------------------
# Phase 8 core journey (patient empowerment APIs)
# -----------------------------------------------------------------------------
run_check "P8_08_reminders_list" "Patient can list medication reminders" "GET" "$BASE_URL/api/patient/medication-reminders" "$PAT_COOKIE" "" \
  "200" ".success == true and (.medications|type==\"array\") and ((.medications|length) >= 1)"
REMINDER_ID=$(jq -r '.medications[0].id // empty' "$ARTIFACT_DIR/P8_08_reminders_list.json")

run_check "P8_09_update_reminder_status" "Patient can accept medication reminder" "POST" "$BASE_URL/api/medications/update-status" "$PAT_COOKIE" \
  "{\"reminderId\":\"$REMINDER_ID\",\"status\":\"accepted\"}" \
  "200" ".success == true"

run_check "P8_10_health_summary" "Patient health summary aggregates data" "GET" "$BASE_URL/api/patient/health-summary" "$PAT_COOKIE" "" \
  "200" ".success == true and (.summary|type==\"object\") and (.summary.medications|type==\"object\")"

run_check "P8_11_patient_notes" "Patient can fetch synced notes" "GET" "$BASE_URL/api/patient/notes" "$PAT_COOKIE" "" \
  "200" ".success == true and (.notes|type==\"array\")"

run_check "P8_12_create_patient_medication" "Patient can add manual medication" "POST" "$BASE_URL/api/patient/medications" "$PAT_COOKIE" \
  "{\"medication_name\":\"Vitamin D\",\"dosage\":\"1000 IU\",\"frequency\":\"daily\",\"start_date\":\"$TODAY\",\"purpose\":\"Supplement\"}" \
  "200" ".success == true and .medication.id != null"

run_check "P8_13_list_patient_medications" "Patient can list manual medications" "GET" "$BASE_URL/api/patient/medications" "$PAT_COOKIE" "" \
  "200" ".success == true and (.medications|type==\"array\") and ((.medications|length) >= 1)"

run_check "P8_14_medication_validation" "Medication create enforces required fields" "POST" "$BASE_URL/api/patient/medications" "$PAT_COOKIE" \
  "{\"medication_name\":\"X\"}" \
  "400" ".error != null"

run_check "P8_15_update_status_validation" "Medication status endpoint validates status values" "POST" "$BASE_URL/api/medications/update-status" "$PAT_COOKIE" \
  "{\"reminderId\":\"$REMINDER_ID\",\"status\":\"paused\"}" \
  "400" ".error != null"

run_check "P8_16_create_diary_entry" "Patient can create diary entry" "POST" "$BASE_URL/api/patient/diary" "$PAT_COOKIE" \
  "{\"date\":\"$TODAY\",\"mood\":4,\"energy\":4,\"sleep_quality\":3,\"sleep_hours\":7,\"symptoms\":[\"headache\"],\"notes\":\"Phase8 entry\"}" \
  "201" ".entry.id != null"

run_check "P8_17_diary_duplicate_guard" "Patient diary rejects duplicate date" "POST" "$BASE_URL/api/patient/diary" "$PAT_COOKIE" \
  "{\"date\":\"$TODAY\",\"mood\":3,\"energy\":3,\"sleep_quality\":3,\"sleep_hours\":6,\"symptoms\":[],\"notes\":\"dup\"}" \
  "409" ".error != null"

run_check "P8_18_diary_list" "Patient can list diary entries" "GET" "$BASE_URL/api/patient/diary" "$PAT_COOKIE" "" \
  "200" ".entries|type==\"array\""

run_check "P8_19_patient_lab_results" "Patient lab results endpoint returns structured response" "GET" "$BASE_URL/api/patient/lab-results" "$PAT_COOKIE" "" \
  "200" ".success == true and (.orders|type==\"array\")"

# -----------------------------------------------------------------------------
# Auth boundary semantics (strict)
# -----------------------------------------------------------------------------
run_check "P8_20_unauth_health_summary" "Unauthenticated patient health summary returns 401" "GET" "$BASE_URL/api/patient/health-summary" "$NO_COOKIE" "" \
  "401" ".error != null"

run_check "P8_21_frontdesk_health_summary_forbidden" "Frontdesk cannot access patient health summary" "GET" "$BASE_URL/api/patient/health-summary" "$FD_COOKIE" "" \
  "403" ".error != null"

run_check "P8_22_unauth_reminders" "Unauthenticated reminders returns 401" "GET" "$BASE_URL/api/patient/medication-reminders" "$NO_COOKIE" "" \
  "401" ".error != null"

run_check "P8_23_doctor_reminders_forbidden" "Doctor cannot access patient reminders endpoint" "GET" "$BASE_URL/api/patient/medication-reminders" "$DOC_COOKIE" "" \
  "403" ".error != null"

run_check "P8_24_unauth_medications" "Unauthenticated medications returns 401" "GET" "$BASE_URL/api/patient/medications" "$NO_COOKIE" "" \
  "401" ".error != null"

run_check "P8_25_frontdesk_medications_forbidden" "Frontdesk cannot access patient medications endpoint" "GET" "$BASE_URL/api/patient/medications" "$FD_COOKIE" "" \
  "403" ".error != null"

run_check "P8_26_unauth_notes" "Unauthenticated patient notes returns 401" "GET" "$BASE_URL/api/patient/notes" "$NO_COOKIE" "" \
  "401" ".error != null"

run_check "P8_27_doctor_notes_forbidden" "Doctor cannot access patient notes endpoint" "GET" "$BASE_URL/api/patient/notes" "$DOC_COOKIE" "" \
  "403" ".error != null"

run_check "P8_28_unauth_diary" "Unauthenticated diary returns 401" "GET" "$BASE_URL/api/patient/diary" "$NO_COOKIE" "" \
  "401" ".error != null"

run_check "P8_29_frontdesk_diary_forbidden" "Frontdesk cannot access patient diary endpoint" "GET" "$BASE_URL/api/patient/diary" "$FD_COOKIE" "" \
  "403" ".error != null"

run_check "P8_30_unauth_lab_results" "Unauthenticated lab results returns 401" "GET" "$BASE_URL/api/patient/lab-results" "$NO_COOKIE" "" \
  "401" ".error != null"

run_check "P8_31_frontdesk_lab_results_forbidden" "Frontdesk cannot access patient lab results endpoint" "GET" "$BASE_URL/api/patient/lab-results" "$FD_COOKIE" "" \
  "403" ".error != null"

run_check "P8_32_unauth_update_status" "Unauthenticated reminder status update returns 401" "POST" "$BASE_URL/api/medications/update-status" "$NO_COOKIE" \
  "{\"reminderId\":\"$REMINDER_ID\",\"status\":\"accepted\"}" \
  "401" ".error != null"

run_check "P8_33_frontdesk_update_status_forbidden" "Frontdesk cannot update patient reminder status" "POST" "$BASE_URL/api/medications/update-status" "$FD_COOKIE" \
  "{\"reminderId\":\"$REMINDER_ID\",\"status\":\"accepted\"}" \
  "403" ".error != null"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
{
  echo "Phase 8 Patient Empowerment Smoke"
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
  --arg note_id "$NOTE_ID" \
  --arg reminder_id "$REMINDER_ID" \
  '{artifacts:$artifacts, ids:{doctor:$doctor_id, patient:$patient_id, note:$note_id, reminder:$reminder_id}}' \
  > "$ARTIFACT_DIR/context.json"

echo "$ARTIFACT_DIR"
