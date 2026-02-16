#!/usr/bin/env bash
set -u

BASE_URL="${BASE_URL:-http://localhost:3001}"
TS="$(date +%Y%m%d_%H%M%S)"
ARTIFACT_DIR="/tmp/phase12_lab_results_display_${TS}"
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

DOC_PHONE="010$(date +%H%M%S)01"
FD_PHONE="011$(date +%H%M%S)02"
PAT_PHONE="012$(date +%H%M%S)03"
DOC_EMAIL="phase12.doctor.${TS}@medassist.test"
FD_EMAIL="phase12.frontdesk.${TS}@medassist.test"
PAT_EMAIL="phase12.patient.${TS}@medassist.test"
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
run_json_check "P12_01_register_doctor" "Register doctor" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"email\":\"$DOC_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"doctor\",\"specialty\":\"general-practitioner\",\"fullName\":\"Phase12 Doctor\"}" \
  "200" ".success == true and .role == \"doctor\""
DOCTOR_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P12_01_register_doctor.json")

run_json_check "P12_02_register_frontdesk" "Register frontdesk" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$FD_PHONE\",\"email\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\",\"fullName\":\"Phase12 Frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\""

run_json_check "P12_03_register_patient" "Register patient" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"email\":\"$PAT_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"patient\",\"fullName\":\"Phase12 Patient\"}" \
  "200" ".success == true and .role == \"patient\""
PATIENT_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P12_03_register_patient.json")

run_json_check "P12_04_login_doctor" "Login doctor" "POST" "$BASE_URL/api/auth/login" "$DOC_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"doctor\"}" \
  "200" ".success == true and .role == \"doctor\"" "readwrite"

run_json_check "P12_05_login_frontdesk" "Login frontdesk" "POST" "$BASE_URL/api/auth/login" "$FD_COOKIE" \
  "{\"phone\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\"" "readwrite"

run_json_check "P12_06_login_patient" "Login patient" "POST" "$BASE_URL/api/auth/login" "$PAT_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"patient\"}" \
  "200" ".success == true and .role == \"patient\"" "readwrite"

# -----------------------------------------------------------------------------
# Lab APIs (core availability + validation)
# -----------------------------------------------------------------------------
run_json_check "P12_07_lab_tests_catalog_public" "Lab tests catalog API reachable without auth" "GET" "$BASE_URL/api/clinical/lab-tests" "$NO_COOKIE" "" \
  "200" ".success == true and (.tests|type==\"array\")"

run_json_check "P12_08_lab_tests_catalog_doctor" "Lab tests catalog API reachable for doctor" "GET" "$BASE_URL/api/clinical/lab-tests" "$DOC_COOKIE" "" \
  "200" ".success == true and (.tests|type==\"array\")"

run_json_check "P12_09_doctor_lab_orders_list" "Doctor can list lab orders" "GET" "$BASE_URL/api/doctor/lab-orders" "$DOC_COOKIE" "" \
  "200" ".success == true and (.orders|type==\"array\")"

run_json_check "P12_10_doctor_lab_orders_status_filter" "Doctor can filter lab orders by status" "GET" "$BASE_URL/api/doctor/lab-orders?status=pending" "$DOC_COOKIE" "" \
  "200" ".success == true and (.orders|type==\"array\")"

run_json_check "P12_11_doctor_lab_orders_post_missing_order_id" "Doctor lab-orders POST validates orderId" "POST" "$BASE_URL/api/doctor/lab-orders" "$DOC_COOKIE" \
  "{\"action\":\"updateStatus\",\"status\":\"processing\"}" \
  "400" ".error != null"

run_json_check "P12_12_doctor_lab_orders_post_missing_status" "Doctor lab-orders POST validates status for updateStatus" "POST" "$BASE_URL/api/doctor/lab-orders" "$DOC_COOKIE" \
  "{\"orderId\":\"00000000-0000-0000-0000-000000000001\",\"action\":\"updateStatus\"}" \
  "400" ".error != null"

run_json_check "P12_13_doctor_lab_orders_post_missing_results" "Doctor lab-orders POST validates results array for submitResults" "POST" "$BASE_URL/api/doctor/lab-orders" "$DOC_COOKIE" \
  "{\"orderId\":\"00000000-0000-0000-0000-000000000001\",\"action\":\"submitResults\"}" \
  "400" ".error != null"

run_json_check "P12_14_doctor_lab_orders_post_invalid_action" "Doctor lab-orders POST rejects invalid action" "POST" "$BASE_URL/api/doctor/lab-orders" "$DOC_COOKIE" \
  "{\"orderId\":\"00000000-0000-0000-0000-000000000001\",\"action\":\"not_valid\"}" \
  "400" ".error != null"

run_json_check "P12_15_patient_lab_results_list" "Patient can load completed lab results list" "GET" "$BASE_URL/api/patient/lab-results" "$PAT_COOKIE" "" \
  "200" ".success == true and (.orders|type==\"array\")"

# -----------------------------------------------------------------------------
# API auth boundaries
# -----------------------------------------------------------------------------
run_json_check "P12_16_unauth_patient_lab_results_api" "Unauth access to patient lab-results API should be 401" "GET" "$BASE_URL/api/patient/lab-results" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P12_17_doctor_patient_lab_results_api_forbidden" "Doctor blocked from patient lab-results API" "GET" "$BASE_URL/api/patient/lab-results" "$DOC_COOKIE" "" \
  "403" ".error != null"

run_json_check "P12_18_frontdesk_patient_lab_results_api_forbidden" "Frontdesk blocked from patient lab-results API" "GET" "$BASE_URL/api/patient/lab-results" "$FD_COOKIE" "" \
  "403" ".error != null"

run_json_check "P12_19_unauth_doctor_lab_orders_api" "Unauth access to doctor lab-orders API should be 401" "GET" "$BASE_URL/api/doctor/lab-orders" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P12_20_patient_doctor_lab_orders_api_forbidden" "Patient blocked from doctor lab-orders API" "GET" "$BASE_URL/api/doctor/lab-orders" "$PAT_COOKIE" "" \
  "403" ".error != null"

run_json_check "P12_21_frontdesk_doctor_lab_orders_api_forbidden" "Frontdesk blocked from doctor lab-orders API" "GET" "$BASE_URL/api/doctor/lab-orders" "$FD_COOKIE" "" \
  "403" ".error != null"

# -----------------------------------------------------------------------------
# Page route smoke
# -----------------------------------------------------------------------------
run_page_check "P12_22_doctor_lab_orders_page" "Doctor can open lab orders page (SSR shell)" "$BASE_URL/doctor/lab-orders" "$DOC_COOKIE" \
  "200" "" "href=\"/doctor/dashboard\""

run_page_check "P12_23_patient_lab_results_page" "Patient can open lab-results page" "$BASE_URL/patient/lab-results" "$PAT_COOKIE" \
  "200" "" "href=\"/patient/dashboard\""

run_page_check "P12_24_patient_labs_page" "Patient can open manual labs page" "$BASE_URL/patient/labs" "$PAT_COOKIE" \
  "200" "" "href=\"/patient/labs\""

run_page_check "P12_25_unauth_doctor_lab_orders_redirect" "Unauth lab-orders page redirects to login" "$BASE_URL/doctor/lab-orders" "$NO_COOKIE" \
  "303,307,308" "/login"

run_page_check "P12_26_patient_doctor_lab_orders_redirect" "Patient hitting doctor lab-orders redirects to patient dashboard" "$BASE_URL/doctor/lab-orders" "$PAT_COOKIE" \
  "303,307,308" "/patient/dashboard"

run_page_check "P12_27_unauth_patient_lab_results_redirect" "Unauth patient lab-results page redirects to login" "$BASE_URL/patient/lab-results" "$NO_COOKIE" \
  "303,307,308" "/login"

run_page_check "P12_28_doctor_patient_lab_results_redirect" "Doctor hitting patient lab-results redirects to doctor dashboard" "$BASE_URL/patient/lab-results" "$DOC_COOKIE" \
  "303,307,308" "/doctor/dashboard"

run_page_check "P12_29_frontdesk_patient_lab_results_redirect" "Frontdesk hitting patient lab-results redirects to frontdesk dashboard" "$BASE_URL/patient/lab-results" "$FD_COOKIE" \
  "303,307,308" "/frontdesk/dashboard"

run_page_check "P12_30_unauth_patient_labs_redirect" "Unauth patient labs page redirects to login" "$BASE_URL/patient/labs" "$NO_COOKIE" \
  "303,307,308" "/login"

run_page_check "P12_31_doctor_patient_labs_redirect" "Doctor hitting patient labs page redirects to doctor dashboard" "$BASE_URL/patient/labs" "$DOC_COOKIE" \
  "303,307,308" "/doctor/dashboard"

run_page_check "P12_32_frontdesk_patient_labs_redirect" "Frontdesk hitting patient labs page redirects to frontdesk dashboard" "$BASE_URL/patient/labs" "$FD_COOKIE" \
  "303,307,308" "/frontdesk/dashboard"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
{
  echo "Phase 12 Lab Results Display Smoke"
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
