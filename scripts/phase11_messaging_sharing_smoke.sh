#!/usr/bin/env bash
set -u

BASE_URL="${BASE_URL:-http://localhost:3001}"
TS="$(date +%Y%m%d_%H%M%S)"
ARTIFACT_DIR="/tmp/phase11_messaging_sharing_${TS}"
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

DOC_PHONE="010$(date +%H%M%S)91"
FD_PHONE="011$(date +%H%M%S)92"
PAT_PHONE="012$(date +%H%M%S)93"
DOC_EMAIL="phase11.doctor.${TS}@medassist.test"
FD_EMAIL="phase11.frontdesk.${TS}@medassist.test"
PAT_EMAIL="phase11.patient.${TS}@medassist.test"
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
run_json_check "P11_01_register_doctor" "Register doctor" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"email\":\"$DOC_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"doctor\",\"specialty\":\"general-practitioner\",\"fullName\":\"Phase11 Doctor\"}" \
  "200" ".success == true and .role == \"doctor\""
DOCTOR_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P11_01_register_doctor.json")

run_json_check "P11_02_register_frontdesk" "Register frontdesk" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$FD_PHONE\",\"email\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\",\"fullName\":\"Phase11 Frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\""

run_json_check "P11_03_register_patient" "Register patient" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"email\":\"$PAT_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"patient\",\"fullName\":\"Phase11 Patient\"}" \
  "200" ".success == true and .role == \"patient\""
PATIENT_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P11_03_register_patient.json")

run_json_check "P11_04_login_doctor" "Login doctor" "POST" "$BASE_URL/api/auth/login" "$DOC_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"doctor\"}" \
  "200" ".success == true and .role == \"doctor\"" "readwrite"

run_json_check "P11_05_login_frontdesk" "Login frontdesk" "POST" "$BASE_URL/api/auth/login" "$FD_COOKIE" \
  "{\"phone\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\"" "readwrite"

run_json_check "P11_06_login_patient" "Login patient" "POST" "$BASE_URL/api/auth/login" "$PAT_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"patient\"}" \
  "200" ".success == true and .role == \"patient\"" "readwrite"

# -----------------------------------------------------------------------------
# Core messaging flow (patient <-> doctor)
# -----------------------------------------------------------------------------
run_json_check "P11_07_patient_conversations_initial" "Patient conversation list endpoint reachable" "GET" "$BASE_URL/api/patient/messages/conversations" "$PAT_COOKIE" "" \
  "200" ".success == true and (.conversations|type==\"array\")"

run_json_check "P11_08_doctor_conversations_initial" "Doctor conversation list endpoint reachable" "GET" "$BASE_URL/api/doctor/messages/conversations" "$DOC_COOKIE" "" \
  "200" ".success == true and (.conversations|type==\"array\")"

run_json_check "P11_09_patient_send_message" "Patient sends message to doctor" "POST" "$BASE_URL/api/patient/messages" "$PAT_COOKIE" \
  "{\"doctor_id\":\"$DOCTOR_ID\",\"content\":\"Hello doctor from Phase 11 smoke\"}" \
  "200" ".success == true and .message.id != null and .message.sender_type == \"patient\""

run_json_check "P11_10_patient_get_messages" "Patient fetches thread by doctorId" "GET" "$BASE_URL/api/patient/messages?doctorId=$DOCTOR_ID" "$PAT_COOKIE" "" \
  "200" ".success == true and (.messages|type==\"array\") and ((.messages|length) >= 1)"

run_json_check "P11_11_doctor_get_messages" "Doctor fetches thread by patientId" "GET" "$BASE_URL/api/doctor/messages?patientId=$PATIENT_ID" "$DOC_COOKIE" "" \
  "200" ".success == true and (.messages|type==\"array\") and ((.messages|length) >= 1)"

run_json_check "P11_12_doctor_reply_message" "Doctor replies to patient" "POST" "$BASE_URL/api/doctor/messages" "$DOC_COOKIE" \
  "{\"patient_id\":\"$PATIENT_ID\",\"content\":\"Reply from doctor Phase 11 smoke\"}" \
  "200" ".success == true and .message.id != null and .message.sender_type == \"doctor\""

run_json_check "P11_13_patient_thread_after_reply" "Patient sees doctor reply in thread" "GET" "$BASE_URL/api/patient/messages?doctorId=$DOCTOR_ID" "$PAT_COOKIE" "" \
  "200" ".success == true and ((.messages|map(select(.sender_type==\"doctor\"))|length) >= 1)"

run_json_check "P11_14_patient_conversations_after_messages" "Patient conversations include latest message" "GET" "$BASE_URL/api/patient/messages/conversations" "$PAT_COOKIE" "" \
  "200" ".success == true and (.conversations|type==\"array\") and ((.conversations|length) >= 1)"

run_json_check "P11_15_doctor_conversations_after_messages" "Doctor conversations include patient thread" "GET" "$BASE_URL/api/doctor/messages/conversations" "$DOC_COOKIE" "" \
  "200" ".success == true and (.conversations|type==\"array\") and ((.conversations|length) >= 1)"

# -----------------------------------------------------------------------------
# Messaging validation guards
# -----------------------------------------------------------------------------
run_json_check "P11_16_patient_send_missing_fields" "Patient message send validates required fields" "POST" "$BASE_URL/api/patient/messages" "$PAT_COOKIE" \
  "{\"content\":\"missing doctor\"}" \
  "400" ".error != null"

run_json_check "P11_17_patient_send_blank_content" "Patient message send rejects blank content" "POST" "$BASE_URL/api/patient/messages" "$PAT_COOKIE" \
  "{\"doctor_id\":\"$DOCTOR_ID\",\"content\":\"   \"}" \
  "400" ".error != null"

run_json_check "P11_18_doctor_send_missing_fields" "Doctor message send validates required fields" "POST" "$BASE_URL/api/doctor/messages" "$DOC_COOKIE" \
  "{\"content\":\"missing patient\"}" \
  "400" ".error != null"

run_json_check "P11_19_doctor_send_missing_content" "Doctor message send requires non-empty content field" "POST" "$BASE_URL/api/doctor/messages" "$DOC_COOKIE" \
  "{\"patient_id\":\"$PATIENT_ID\"}" \
  "400" ".error != null"

# -----------------------------------------------------------------------------
# API auth boundaries
# -----------------------------------------------------------------------------
run_json_check "P11_20_unauth_patient_messages_get" "Unauth patient messages GET should be 401" "GET" "$BASE_URL/api/patient/messages?doctorId=$DOCTOR_ID" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P11_21_doctor_patient_messages_forbidden" "Doctor blocked from patient messages API" "GET" "$BASE_URL/api/patient/messages?doctorId=$DOCTOR_ID" "$DOC_COOKIE" "" \
  "403" ".error != null"

run_json_check "P11_22_unauth_patient_conversations_get" "Unauth patient conversations should be 401" "GET" "$BASE_URL/api/patient/messages/conversations" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P11_23_doctor_patient_conversations_forbidden" "Doctor blocked from patient conversations API" "GET" "$BASE_URL/api/patient/messages/conversations" "$DOC_COOKIE" "" \
  "403" ".error != null"

run_json_check "P11_24_unauth_doctor_messages_get" "Unauth doctor messages GET should be 401" "GET" "$BASE_URL/api/doctor/messages?patientId=$PATIENT_ID" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P11_25_patient_doctor_messages_forbidden" "Patient blocked from doctor messages API" "GET" "$BASE_URL/api/doctor/messages?patientId=$PATIENT_ID" "$PAT_COOKIE" "" \
  "403" ".error != null"

run_json_check "P11_26_unauth_doctor_conversations_get" "Unauth doctor conversations should be 401" "GET" "$BASE_URL/api/doctor/messages/conversations" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P11_27_patient_doctor_conversations_forbidden" "Patient blocked from doctor conversations API" "GET" "$BASE_URL/api/doctor/messages/conversations" "$PAT_COOKIE" "" \
  "403" ".error != null"

# -----------------------------------------------------------------------------
# Sharing + messaging page route smoke
# -----------------------------------------------------------------------------
run_page_check "P11_28_patient_messages_page" "Patient can open messages page" "$BASE_URL/patient/messages" "$PAT_COOKIE" \
  "200" "" "Messages"

run_page_check "P11_29_doctor_messages_page" "Doctor can open messages page" "$BASE_URL/doctor/messages" "$DOC_COOKIE" \
  "200" "" "Messages"

run_page_check "P11_30_patient_sharing_page" "Patient can open sharing page (SSR shell)" "$BASE_URL/patient/sharing" "$PAT_COOKIE" \
  "200" "" "href=\"/patient/sharing\""

run_page_check "P11_31_unauth_sharing_redirect" "Unauth sharing page redirects to login" "$BASE_URL/patient/sharing" "$NO_COOKIE" \
  "303,307,308" "/login"

run_page_check "P11_32_doctor_sharing_redirect" "Doctor hitting patient sharing redirects to doctor dashboard" "$BASE_URL/patient/sharing" "$DOC_COOKIE" \
  "303,307,308" "/doctor/dashboard"

run_page_check "P11_33_frontdesk_sharing_redirect" "Frontdesk hitting patient sharing redirects to frontdesk dashboard" "$BASE_URL/patient/sharing" "$FD_COOKIE" \
  "303,307,308" "/frontdesk/dashboard"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
{
  echo "Phase 11 Messaging + Sharing Smoke"
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
