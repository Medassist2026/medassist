#!/usr/bin/env bash
set -u

BASE_URL="${BASE_URL:-http://localhost:3001}"
TS="$(date +%Y%m%d_%H%M%S)"
ARTIFACT_DIR="/tmp/phase13_messaging_systems_${TS}"
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
DOC_EMAIL="phase13.doctor.${TS}@medassist.test"
FD_EMAIL="phase13.frontdesk.${TS}@medassist.test"
PAT_EMAIL="phase13.patient.${TS}@medassist.test"
PASSWORD="Pass1234!"

DOCTOR_ID=""
PATIENT_ID=""

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
run_json_check "P13_01_register_doctor" "Register doctor" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"email\":\"$DOC_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"doctor\",\"specialty\":\"general-practitioner\",\"fullName\":\"Phase13 Doctor\"}" \
  "200" ".success == true and .role == \"doctor\""
DOCTOR_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P13_01_register_doctor.json")

run_json_check "P13_02_register_frontdesk" "Register frontdesk" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$FD_PHONE\",\"email\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\",\"fullName\":\"Phase13 Frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\""

run_json_check "P13_03_register_patient" "Register patient" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"email\":\"$PAT_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"patient\",\"fullName\":\"Phase13 Patient\"}" \
  "200" ".success == true and .role == \"patient\""
PATIENT_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P13_03_register_patient.json")

run_json_check "P13_04_login_doctor" "Login doctor" "POST" "$BASE_URL/api/auth/login" "$DOC_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"doctor\"}" \
  "200" ".success == true and .role == \"doctor\"" "readwrite"

run_json_check "P13_05_login_frontdesk" "Login frontdesk" "POST" "$BASE_URL/api/auth/login" "$FD_COOKIE" \
  "{\"phone\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\"" "readwrite"

run_json_check "P13_06_login_patient" "Login patient" "POST" "$BASE_URL/api/auth/login" "$PAT_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"patient\"}" \
  "200" ".success == true and .role == \"patient\"" "readwrite"

# -----------------------------------------------------------------------------
# Phase 13 messaging maturity checks
# -----------------------------------------------------------------------------
run_json_check "P13_07_patient_send_message" "Patient sends message to doctor" "POST" "$BASE_URL/api/patient/messages" "$PAT_COOKIE" \
  "{\"doctor_id\":\"$DOCTOR_ID\",\"content\":\"Phase13 patient -> doctor unread semantics\"}" \
  "200" ".success == true and .message.sender_type == \"patient\" and .message.is_read == false"

run_json_check "P13_08_doctor_conversations_unread" "Doctor conversations show unread count after patient message" "GET" "$BASE_URL/api/doctor/messages/conversations" "$DOC_COOKIE" "" \
  "200" ".success == true and ((.conversations|map(select(.patient.id==\"$PATIENT_ID\"))|length) >= 1) and ((.conversations|map(select(.patient.id==\"$PATIENT_ID\"))[0].unread_count) >= 1)"

run_json_check "P13_09_doctor_get_thread_marks_read" "Doctor reads thread and receives mapped messages with is_read field" "GET" "$BASE_URL/api/doctor/messages?patientId=$PATIENT_ID" "$DOC_COOKIE" "" \
  "200" ".success == true and (.messages|type==\"array\") and ((.messages|length) >= 1) and ((.messages|map(has(\"is_read\"))|all) == true)"

run_json_check "P13_10_doctor_conversations_unread_reset" "Doctor unread count resets after thread read" "GET" "$BASE_URL/api/doctor/messages/conversations" "$DOC_COOKIE" "" \
  "200" ".success == true and ((.conversations|map(select(.patient.id==\"$PATIENT_ID\"))|length) >= 1) and ((.conversations|map(select(.patient.id==\"$PATIENT_ID\"))[0].unread_count) == 0)"

run_json_check "P13_11_doctor_reply_message" "Doctor replies to patient" "POST" "$BASE_URL/api/doctor/messages" "$DOC_COOKIE" \
  "{\"patient_id\":\"$PATIENT_ID\",\"content\":\"Phase13 doctor -> patient unread semantics\"}" \
  "200" ".success == true and .message.sender_type == \"doctor\" and .message.is_read == false"

run_json_check "P13_12_patient_conversations_unread" "Patient conversations show unread count after doctor reply" "GET" "$BASE_URL/api/patient/messages/conversations" "$PAT_COOKIE" "" \
  "200" ".success == true and ((.conversations|map(select(.doctor.id==\"$DOCTOR_ID\"))|length) >= 1) and ((.conversations|map(select(.doctor.id==\"$DOCTOR_ID\"))[0].unread_count) >= 1)"

run_json_check "P13_13_patient_get_thread_marks_read" "Patient reads thread and receives mapped messages with is_read field" "GET" "$BASE_URL/api/patient/messages?doctorId=$DOCTOR_ID" "$PAT_COOKIE" "" \
  "200" ".success == true and (.messages|type==\"array\") and ((.messages|length) >= 2) and ((.messages|map(has(\"is_read\"))|all) == true)"

run_json_check "P13_14_patient_conversations_unread_reset" "Patient unread count resets after thread read" "GET" "$BASE_URL/api/patient/messages/conversations" "$PAT_COOKIE" "" \
  "200" ".success == true and ((.conversations|map(select(.doctor.id==\"$DOCTOR_ID\"))|length) >= 1) and ((.conversations|map(select(.doctor.id==\"$DOCTOR_ID\"))[0].unread_count) == 0)"

run_json_check "P13_15_patient_send_blank_content_guard" "Patient message send rejects blank content" "POST" "$BASE_URL/api/patient/messages" "$PAT_COOKIE" \
  "{\"doctor_id\":\"$DOCTOR_ID\",\"content\":\"   \"}" \
  "400" ".error != null"

run_json_check "P13_16_doctor_send_blank_content_guard" "Doctor message send rejects blank content" "POST" "$BASE_URL/api/doctor/messages" "$DOC_COOKIE" \
  "{\"patient_id\":\"$PATIENT_ID\",\"content\":\"   \"}" \
  "400" ".error != null"

# -----------------------------------------------------------------------------
# Auth boundaries
# -----------------------------------------------------------------------------
run_json_check "P13_17_unauth_patient_messages_guard" "Unauth patient messages API returns 401" "GET" "$BASE_URL/api/patient/messages?doctorId=$DOCTOR_ID" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P13_18_doctor_patient_messages_forbidden" "Doctor blocked from patient messages API" "GET" "$BASE_URL/api/patient/messages?doctorId=$DOCTOR_ID" "$DOC_COOKIE" "" \
  "403" ".error != null"

run_json_check "P13_19_unauth_doctor_messages_guard" "Unauth doctor messages API returns 401" "GET" "$BASE_URL/api/doctor/messages?patientId=$PATIENT_ID" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P13_20_patient_doctor_messages_forbidden" "Patient blocked from doctor messages API" "GET" "$BASE_URL/api/doctor/messages?patientId=$PATIENT_ID" "$PAT_COOKIE" "" \
  "403" ".error != null"

# -----------------------------------------------------------------------------
# Messaging pages
# -----------------------------------------------------------------------------
run_page_check "P13_21_patient_messages_page" "Patient messages page reachable" "$BASE_URL/patient/messages" "$PAT_COOKIE" \
  "200" "" "Messages"

run_page_check "P13_22_doctor_messages_page" "Doctor messages page reachable" "$BASE_URL/doctor/messages" "$DOC_COOKIE" \
  "200" "" "Messages"

# -----------------------------------------------------------------------------
# Internal team chat gap tracking (Phase 13 planned, currently not implemented)
# -----------------------------------------------------------------------------
run_page_check "P13_23_gap_frontdesk_messages_page" "GAP: frontdesk messages page currently missing" "$BASE_URL/frontdesk/messages" "$FD_COOKIE" \
  "404"

run_json_check "P13_24_gap_frontdesk_messages_api" "GAP: frontdesk messages API currently missing" "GET" "$BASE_URL/api/frontdesk/messages" "$FD_COOKIE" "" \
  "404"

run_json_check "P13_25_gap_internal_team_messages_api" "GAP: internal team messages API currently missing" "GET" "$BASE_URL/api/doctor/team-messages" "$DOC_COOKIE" "" \
  "404"

run_json_check "P13_26_gap_message_attachments_api" "GAP: message attachments API currently missing" "POST" "$BASE_URL/api/messages/attachments" "$PAT_COOKIE" \
  "{\"conversation_id\":\"dummy\",\"filename\":\"x.png\"}" \
  "404"

run_json_check "P13_27_gap_message_threads_api" "GAP: message_threads endpoint currently missing" "GET" "$BASE_URL/api/message-threads" "$DOC_COOKIE" "" \
  "404"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
{
  echo "Phase 13 Messaging Systems Smoke"
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
