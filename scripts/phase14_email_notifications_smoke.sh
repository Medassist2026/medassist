#!/usr/bin/env bash
set -u

BASE_URL="${BASE_URL:-http://localhost:3001}"
TS="$(date +%Y%m%d_%H%M%S)"
ARTIFACT_DIR="/tmp/phase14_email_notifications_${TS}"
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

DOC_PHONE="010$(date +%H%M%S)61"
FD_PHONE="011$(date +%H%M%S)62"
PAT_PHONE="012$(date +%H%M%S)63"
DOC_EMAIL="phase14.doctor.${TS}@medassist.test"
FD_EMAIL="phase14.frontdesk.${TS}@medassist.test"
PAT_EMAIL="phase14.patient.${TS}@medassist.test"
PASSWORD="Pass1234!"

DOCTOR_ID=""
PATIENT_ID=""
REMINDER_ID=""
NOTE_ID=""

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
run_json_check "P14_01_register_doctor" "Register doctor" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"email\":\"$DOC_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"doctor\",\"specialty\":\"general-practitioner\",\"fullName\":\"Phase14 Doctor\"}" \
  "200" ".success == true and .role == \"doctor\""
DOCTOR_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P14_01_register_doctor.json")

run_json_check "P14_02_register_frontdesk" "Register frontdesk" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$FD_PHONE\",\"email\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\",\"fullName\":\"Phase14 Frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\""

run_json_check "P14_03_register_patient" "Register patient" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"email\":\"$PAT_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"patient\",\"fullName\":\"Phase14 Patient\"}" \
  "200" ".success == true and .role == \"patient\""
PATIENT_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P14_03_register_patient.json")

run_json_check "P14_04_login_doctor" "Login doctor" "POST" "$BASE_URL/api/auth/login" "$DOC_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"doctor\"}" \
  "200" ".success == true and .role == \"doctor\"" "readwrite"

run_json_check "P14_05_login_frontdesk" "Login frontdesk" "POST" "$BASE_URL/api/auth/login" "$FD_COOKIE" \
  "{\"phone\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\"" "readwrite"

run_json_check "P14_06_login_patient" "Login patient" "POST" "$BASE_URL/api/auth/login" "$PAT_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"patient\"}" \
  "200" ".success == true and .role == \"patient\"" "readwrite"

# -----------------------------------------------------------------------------
# Implemented notification baseline (in-app medication reminder flows)
# -----------------------------------------------------------------------------
run_json_check "P14_07_create_synced_note_for_reminders" "Doctor creates synced note with medication trigger" "POST" "$BASE_URL/api/clinical/notes" "$DOC_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"noteData\":{\"chief_complaint\":[\"Headache\"],\"diagnosis\":\"R51: Headache\",\"medications\":[{\"name\":\"Paracetamol\",\"frequency\":\"TID\",\"duration\":\"5 days\",\"notes\":\"After meals\"}],\"plan\":\"Hydration and rest\"},\"keystrokeCount\":92,\"durationSeconds\":320,\"syncToPatient\":true}" \
  "200" ".success == true and (.noteId|type==\"string\")"
NOTE_ID=$(jq -r '.noteId // empty' "$ARTIFACT_DIR/P14_07_create_synced_note_for_reminders.json")

run_json_check "P14_08_patient_reminders_list" "Patient can list medication reminders" "GET" "$BASE_URL/api/patient/medication-reminders" "$PAT_COOKIE" "" \
  "200" ".success == true and (.medications|type==\"array\") and ((.medications|length) >= 1)"
REMINDER_ID=$(jq -r '.medications[0].id // empty' "$ARTIFACT_DIR/P14_08_patient_reminders_list.json")

run_json_check "P14_09_update_reminder_status_accepted" "Patient can accept medication reminder" "POST" "$BASE_URL/api/medications/update-status" "$PAT_COOKIE" \
  "{\"reminderId\":\"$REMINDER_ID\",\"status\":\"accepted\"}" \
  "200" ".success == true"

run_json_check "P14_10_update_reminder_status_validation" "Reminder status endpoint rejects invalid status" "POST" "$BASE_URL/api/medications/update-status" "$PAT_COOKIE" \
  "{\"reminderId\":\"$REMINDER_ID\",\"status\":\"paused\"}" \
  "400" ".error != null"

run_json_check "P14_11_patient_health_summary" "Patient health summary includes medication aggregates" "GET" "$BASE_URL/api/patient/health-summary" "$PAT_COOKIE" "" \
  "200" ".success == true and (.summary|type==\"object\") and (.summary.medications|type==\"object\")"

run_json_check "P14_12_patient_notes_available" "Patient can fetch synced clinical notes" "GET" "$BASE_URL/api/patient/notes" "$PAT_COOKIE" "" \
  "200" ".success == true and (.notes|type==\"array\") and ((.notes|length) >= 1)"

run_json_check "P14_13_patient_medications_list" "Patient medications endpoint returns list" "GET" "$BASE_URL/api/patient/medications" "$PAT_COOKIE" "" \
  "200" ".success == true and (.medications|type==\"array\")"

# -----------------------------------------------------------------------------
# Auth boundary checks
# -----------------------------------------------------------------------------
run_json_check "P14_14_unauth_reminders_guard" "Unauthenticated reminders request returns 401" "GET" "$BASE_URL/api/patient/medication-reminders" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P14_15_doctor_reminders_forbidden" "Doctor cannot access patient reminders endpoint" "GET" "$BASE_URL/api/patient/medication-reminders" "$DOC_COOKIE" "" \
  "403" ".error != null"

run_json_check "P14_16_unauth_update_status_guard" "Unauthenticated reminder status update returns 401" "POST" "$BASE_URL/api/medications/update-status" "$NO_COOKIE" \
  "{\"reminderId\":\"$REMINDER_ID\",\"status\":\"accepted\"}" \
  "401" ".error != null"

run_json_check "P14_17_frontdesk_update_status_forbidden" "Frontdesk cannot update patient reminder status" "POST" "$BASE_URL/api/medications/update-status" "$FD_COOKIE" \
  "{\"reminderId\":\"$REMINDER_ID\",\"status\":\"accepted\"}" \
  "403" ".error != null"

run_json_check "P14_18_frontdesk_appointments_list" "Frontdesk appointments API remains healthy" "GET" "$BASE_URL/api/frontdesk/appointments" "$FD_COOKIE" "" \
  "200" ".success == true and (.appointments|type==\"array\")"

run_json_check "P14_19_unauth_frontdesk_appointments_guard" "Unauthenticated frontdesk appointments returns 401" "GET" "$BASE_URL/api/frontdesk/appointments" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P14_20_doctor_frontdesk_appointments_forbidden" "Doctor blocked from frontdesk appointments API" "GET" "$BASE_URL/api/frontdesk/appointments" "$DOC_COOKIE" "" \
  "403" ".error != null"

# -----------------------------------------------------------------------------
# Core route reachability
# -----------------------------------------------------------------------------
run_page_check "P14_21_patient_medications_page" "Patient medications page reachable" "$BASE_URL/patient/medications" "$PAT_COOKIE" \
  "200"

run_page_check "P14_22_patient_lab_results_page" "Patient lab results page reachable" "$BASE_URL/patient/lab-results" "$PAT_COOKIE" \
  "200"

run_page_check "P14_23_frontdesk_dashboard_page" "Frontdesk dashboard page reachable" "$BASE_URL/frontdesk/dashboard" "$FD_COOKIE" \
  "200"

# -----------------------------------------------------------------------------
# Phase 14 roadmap gaps (email notifications not implemented yet)
# -----------------------------------------------------------------------------
run_json_check "P14_24_gap_email_send_api" "GAP: email send API currently missing" "POST" "$BASE_URL/api/notifications/email/send" "$FD_COOKIE" \
  "{\"to\":\"patient@example.com\",\"template\":\"appointment-reminder\"}" \
  "404"

run_json_check "P14_25_gap_appointment_reminders_api" "GAP: appointment reminder scheduler API currently missing" "GET" "$BASE_URL/api/notifications/appointment-reminders" "$FD_COOKIE" "" \
  "404"

run_json_check "P14_26_gap_lab_results_notifications_api" "GAP: lab results notification API currently missing" "GET" "$BASE_URL/api/notifications/lab-results" "$DOC_COOKIE" "" \
  "404"

run_json_check "P14_27_gap_unsubscribe_api" "GAP: unsubscribe API currently missing" "POST" "$BASE_URL/api/notifications/unsubscribe" "$NO_COOKIE" \
  "{\"token\":\"dummy\"}" \
  "404"

run_page_check "P14_28_gap_unsubscribe_page" "GAP: unsubscribe page currently missing" "$BASE_URL/unsubscribe" "$NO_COOKIE" \
  "404"

run_json_check "P14_29_gap_email_templates_api" "GAP: email templates API currently missing" "GET" "$BASE_URL/api/email/templates" "$DOC_COOKIE" "" \
  "404"

run_json_check "P14_30_gap_email_logs_api" "GAP: email logs API currently missing" "GET" "$BASE_URL/api/email/logs" "$FD_COOKIE" "" \
  "404"

run_json_check "P14_31_gap_notification_preferences_api" "GAP: notification preferences API currently missing" "GET" "$BASE_URL/api/notifications/preferences" "$PAT_COOKIE" "" \
  "404"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
{
  echo "Phase 14 Email Notifications Smoke"
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
