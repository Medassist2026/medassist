#!/usr/bin/env bash
set -u

BASE_URL="${BASE_URL:-http://localhost:3001}"
TS="$(date +%Y%m%d_%H%M%S)"
ARTIFACT_DIR="/tmp/phase18_telemedicine_${TS}"
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
FD_PHONE="011$(date +%H%M%S)12"
PAT_PHONE="012$(date +%H%M%S)13"
DOC_EMAIL="phase18.doctor.${TS}@medassist.test"
FD_EMAIL="phase18.frontdesk.${TS}@medassist.test"
PAT_EMAIL="phase18.patient.${TS}@medassist.test"
PASSWORD="Pass1234!"

APPT_DATE="2026-12-02"
APPT_START="2026-12-02T09:30:00Z"

DOCTOR_ID=""
PATIENT_ID=""
APPOINTMENT_ID=""

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
run_json_check "P18_01_register_doctor" "Register doctor" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"email\":\"$DOC_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"doctor\",\"specialty\":\"general-practitioner\",\"fullName\":\"Phase18 Doctor\"}" \
  "200" ".success == true and .role == \"doctor\""
DOCTOR_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P18_01_register_doctor.json")

run_json_check "P18_02_register_frontdesk" "Register frontdesk" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$FD_PHONE\",\"email\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\",\"fullName\":\"Phase18 Frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\""

run_json_check "P18_03_register_patient" "Register patient" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"email\":\"$PAT_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"patient\",\"fullName\":\"Phase18 Patient\"}" \
  "200" ".success == true and .role == \"patient\""
PATIENT_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P18_03_register_patient.json")

run_json_check "P18_04_login_doctor" "Login doctor" "POST" "$BASE_URL/api/auth/login" "$DOC_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"doctor\"}" \
  "200" ".success == true and .role == \"doctor\"" "readwrite"

run_json_check "P18_05_login_frontdesk" "Login frontdesk" "POST" "$BASE_URL/api/auth/login" "$FD_COOKIE" \
  "{\"phone\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\"" "readwrite"

run_json_check "P18_06_login_patient" "Login patient" "POST" "$BASE_URL/api/auth/login" "$PAT_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"patient\"}" \
  "200" ".success == true and .role == \"patient\"" "readwrite"

# -----------------------------------------------------------------------------
# Current telemedicine-adjacent baseline
# -----------------------------------------------------------------------------
run_json_check "P18_07_create_consultation_appointment" "Frontdesk creates consultation appointment type" "POST" "$BASE_URL/api/frontdesk/appointments/create" "$FD_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOCTOR_ID\",\"startTime\":\"$APPT_START\",\"durationMinutes\":30,\"appointmentType\":\"consultation\",\"notes\":\"Phase18 telemedicine prep\"}" \
  "200" ".success == true and (.appointment.id|type==\"string\") and .appointment.appointment_type == \"consultation\""
APPOINTMENT_ID=$(jq -r '.appointment.id // empty' "$ARTIFACT_DIR/P18_07_create_consultation_appointment.json")

run_json_check "P18_08_list_appointments_contains_consultation" "Frontdesk list includes consultation appointment" "GET" "$BASE_URL/api/frontdesk/appointments?date=$APPT_DATE&doctorId=$DOCTOR_ID" "$FD_COOKIE" "" \
  "200" ".success == true and (.appointments|type==\"array\") and ((.appointments|map(select(.id==\"$APPOINTMENT_ID\"))|length) >= 1) and ((.appointments|map(select(.id==\"$APPOINTMENT_ID\"))[0].type) == \"consultation\")"

run_json_check "P18_09_create_payment_for_consultation" "Frontdesk records payment for consultation appointment" "POST" "$BASE_URL/api/frontdesk/payments/create" "$FD_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOCTOR_ID\",\"amount\":500,\"paymentMethod\":\"cash\",\"appointmentId\":\"$APPOINTMENT_ID\",\"notes\":\"Phase18 consultation fee\"}" \
  "200" ".success == true and (.payment.id|type==\"string\")"

run_json_check "P18_10_patient_vitals_api" "Patient remote-vitals baseline API returns structure" "GET" "$BASE_URL/api/patient/vitals" "$PAT_COOKIE" "" \
  "200" ".success == true and (.vitals|type==\"array\")"

run_page_check "P18_11_patient_vitals_page" "Patient vitals page reachable" "$BASE_URL/patient/vitals" "$PAT_COOKIE" \
  "200"

run_page_check "P18_12_patient_messages_page" "Patient messages page reachable for async tele-consult communication" "$BASE_URL/patient/messages" "$PAT_COOKIE" \
  "200"

run_page_check "P18_13_doctor_messages_page" "Doctor messages page reachable for async tele-consult communication" "$BASE_URL/doctor/messages" "$DOC_COOKIE" \
  "200"

# -----------------------------------------------------------------------------
# Boundary checks for implemented telemedicine-adjacent APIs
# -----------------------------------------------------------------------------
run_json_check "P18_14_unauth_appointments_create_guard" "Unauthenticated appointment create returns 401" "POST" "$BASE_URL/api/frontdesk/appointments/create" "$NO_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOCTOR_ID\",\"startTime\":\"$APPT_START\",\"durationMinutes\":30}" \
  "401" ".error != null"

run_json_check "P18_15_doctor_appointments_create_forbidden" "Doctor blocked from frontdesk appointment create API" "POST" "$BASE_URL/api/frontdesk/appointments/create" "$DOC_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOCTOR_ID\",\"startTime\":\"$APPT_START\",\"durationMinutes\":30}" \
  "403" ".error != null"

run_json_check "P18_16_patient_appointments_create_forbidden" "Patient blocked from frontdesk appointment create API" "POST" "$BASE_URL/api/frontdesk/appointments/create" "$PAT_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOCTOR_ID\",\"startTime\":\"$APPT_START\",\"durationMinutes\":30}" \
  "403" ".error != null"

run_json_check "P18_17_unauth_frontdesk_appointments_guard" "Unauthenticated frontdesk appointments list returns 401" "GET" "$BASE_URL/api/frontdesk/appointments?date=$APPT_DATE" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P18_18_doctor_frontdesk_appointments_forbidden" "Doctor blocked from frontdesk appointments list API" "GET" "$BASE_URL/api/frontdesk/appointments?date=$APPT_DATE" "$DOC_COOKIE" "" \
  "403" ".error != null"

run_json_check "P18_19_patient_frontdesk_appointments_forbidden" "Patient blocked from frontdesk appointments list API" "GET" "$BASE_URL/api/frontdesk/appointments?date=$APPT_DATE" "$PAT_COOKIE" "" \
  "403" ".error != null"

run_json_check "P18_20_unauth_payment_create_guard" "Unauthenticated payment create returns 401" "POST" "$BASE_URL/api/frontdesk/payments/create" "$NO_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOCTOR_ID\",\"amount\":100,\"paymentMethod\":\"cash\"}" \
  "401" ".error != null"

run_json_check "P18_21_doctor_payment_create_forbidden" "Doctor blocked from payment create API" "POST" "$BASE_URL/api/frontdesk/payments/create" "$DOC_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOCTOR_ID\",\"amount\":100,\"paymentMethod\":\"cash\"}" \
  "403" ".error != null"

run_json_check "P18_22_patient_payment_create_forbidden" "Patient blocked from payment create API" "POST" "$BASE_URL/api/frontdesk/payments/create" "$PAT_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOCTOR_ID\",\"amount\":100,\"paymentMethod\":\"cash\"}" \
  "403" ".error != null"

run_json_check "P18_23_unauth_patient_vitals_guard" "Unauthenticated patient vitals returns 401" "GET" "$BASE_URL/api/patient/vitals" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P18_24_doctor_patient_vitals_forbidden" "Doctor blocked from patient vitals API" "GET" "$BASE_URL/api/patient/vitals" "$DOC_COOKIE" "" \
  "403" ".error != null"

run_json_check "P18_25_frontdesk_patient_vitals_forbidden" "Frontdesk blocked from patient vitals API" "GET" "$BASE_URL/api/patient/vitals" "$FD_COOKIE" "" \
  "403" ".error != null"

# -----------------------------------------------------------------------------
# Phase 18 roadmap gaps (expected, currently unimplemented)
# -----------------------------------------------------------------------------
run_page_check "P18_26_gap_doctor_telemedicine_page" "GAP: doctor telemedicine page currently missing" "$BASE_URL/doctor/telemedicine" "$DOC_COOKIE" \
  "404"

run_page_check "P18_27_gap_patient_telemedicine_page" "GAP: patient telemedicine page currently missing" "$BASE_URL/patient/telemedicine" "$PAT_COOKIE" \
  "404"

run_page_check "P18_28_gap_virtual_waiting_room_page" "GAP: virtual waiting room page currently missing" "$BASE_URL/telemedicine/waiting-room" "$PAT_COOKIE" \
  "404"

run_json_check "P18_29_gap_sessions_api" "GAP: telemedicine sessions API currently missing" "GET" "$BASE_URL/api/telemedicine/sessions" "$DOC_COOKIE" "" \
  "404"

run_json_check "P18_30_gap_start_session_api" "GAP: telemedicine session start API currently missing" "POST" "$BASE_URL/api/telemedicine/sessions/start" "$DOC_COOKIE" \
  "{\"appointmentId\":\"$APPOINTMENT_ID\"}" \
  "404"

run_json_check "P18_31_gap_join_session_api" "GAP: telemedicine session join API currently missing" "POST" "$BASE_URL/api/telemedicine/sessions/join" "$PAT_COOKIE" \
  "{\"sessionId\":\"dummy\"}" \
  "404"

run_json_check "P18_32_gap_webrtc_token_api" "GAP: WebRTC token API currently missing" "POST" "$BASE_URL/api/telemedicine/webrtc/token" "$DOC_COOKIE" \
  "{\"sessionId\":\"dummy\"}" \
  "404"

run_json_check "P18_33_gap_screen_share_api" "GAP: screen-share API currently missing" "POST" "$BASE_URL/api/telemedicine/screen-share" "$DOC_COOKIE" \
  "{\"sessionId\":\"dummy\"}" \
  "404"

run_json_check "P18_34_gap_recordings_api" "GAP: recording API currently missing" "POST" "$BASE_URL/api/telemedicine/recordings" "$DOC_COOKIE" \
  "{\"sessionId\":\"dummy\",\"action\":\"start\"}" \
  "404"

run_json_check "P18_35_gap_consent_api" "GAP: consent API currently missing" "POST" "$BASE_URL/api/telemedicine/consent" "$PAT_COOKIE" \
  "{\"sessionId\":\"dummy\",\"consent\":true}" \
  "404"

run_json_check "P18_36_gap_signature_api" "GAP: e-signature API currently missing" "POST" "$BASE_URL/api/telemedicine/signature" "$PAT_COOKIE" \
  "{\"sessionId\":\"dummy\",\"signature\":\"dummy\"}" \
  "404"

run_json_check "P18_37_gap_remote_vitals_api" "GAP: remote-vitals telemedicine API currently missing" "POST" "$BASE_URL/api/telemedicine/remote-vitals" "$PAT_COOKIE" \
  "{\"sessionId\":\"dummy\",\"heart_rate\":80}" \
  "404"

run_json_check "P18_38_gap_chat_token_api" "GAP: telemedicine chat-token API currently missing" "GET" "$BASE_URL/api/telemedicine/chat-token?sessionId=dummy" "$DOC_COOKIE" "" \
  "404"

run_json_check "P18_39_gap_session_analytics_api" "GAP: telemedicine session analytics API currently missing" "GET" "$BASE_URL/api/telemedicine/session-analytics?sessionId=dummy" "$DOC_COOKIE" "" \
  "404"

run_page_check "P18_40_gap_frontdesk_telemedicine_page" "GAP: frontdesk telemedicine page currently missing" "$BASE_URL/frontdesk/telemedicine" "$FD_COOKIE" \
  "404"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
{
  echo "Phase 18 Telemedicine Smoke"
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
  '{artifacts:$artifacts, ids:{doctor:$doctor_id, patient:$patient_id, appointment:$appointment_id}}' \
  > "$ARTIFACT_DIR/context.json"

echo "$ARTIFACT_DIR"
