#!/usr/bin/env bash
set -u

BASE_URL="${BASE_URL:-http://localhost:3001}"
TS="$(date +%Y%m%d_%H%M%S)"
ARTIFACT_DIR="/tmp/phase9_shefa_ai_${TS}"
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

DOC_PHONE="010$(date +%H%M%S)81"
FD_PHONE="011$(date +%H%M%S)82"
PAT_PHONE="012$(date +%H%M%S)83"
DOC_EMAIL="phase9.doctor.${TS}@medassist.test"
FD_EMAIL="phase9.frontdesk.${TS}@medassist.test"
PAT_EMAIL="phase9.patient.${TS}@medassist.test"
PASSWORD="Pass1234!"

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
run_json_check "P9_01_register_doctor" "Register doctor" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"email\":\"$DOC_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"doctor\",\"specialty\":\"general-practitioner\",\"fullName\":\"Phase9 Doctor\"}" \
  "200" ".success == true and .role == \"doctor\""

run_json_check "P9_02_register_frontdesk" "Register frontdesk" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$FD_PHONE\",\"email\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\",\"fullName\":\"Phase9 Frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\""

run_json_check "P9_03_register_patient" "Register patient" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"email\":\"$PAT_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"patient\",\"fullName\":\"Phase9 Patient\"}" \
  "200" ".success == true and .role == \"patient\""

run_json_check "P9_04_login_doctor" "Login doctor" "POST" "$BASE_URL/api/auth/login" "$DOC_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"doctor\"}" \
  "200" ".success == true and .role == \"doctor\"" "readwrite"

run_json_check "P9_05_login_frontdesk" "Login frontdesk" "POST" "$BASE_URL/api/auth/login" "$FD_COOKIE" \
  "{\"phone\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\"" "readwrite"

run_json_check "P9_06_login_patient" "Login patient" "POST" "$BASE_URL/api/auth/login" "$PAT_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"patient\"}" \
  "200" ".success == true and .role == \"patient\"" "readwrite"

# -----------------------------------------------------------------------------
# Patient AI pages (core availability)
# -----------------------------------------------------------------------------
run_page_check "P9_07_patient_ai_symptoms_page" "Patient can open AI symptoms page" "$BASE_URL/patient/ai/symptoms" "$PAT_COOKIE" \
  "200" "" "Symptom Checker"

run_page_check "P9_08_patient_ai_summary_page" "Patient can open AI summary page" "$BASE_URL/patient/ai/summary" "$PAT_COOKIE" \
  "200" "" "AI Health Summary|Analyzing your health data"

run_page_check "P9_09_patient_ai_medications_page" "Patient can open AI medications page" "$BASE_URL/patient/ai/medications" "$PAT_COOKIE" \
  "200" "" "Medication Assistant"

# -----------------------------------------------------------------------------
# Page auth boundaries for AI pages
# -----------------------------------------------------------------------------
run_page_check "P9_10_unauth_symptoms_redirect" "Unauth access to AI symptoms redirects to login" "$BASE_URL/patient/ai/symptoms" "$NO_COOKIE" \
  "303,307,308" "/login"

run_page_check "P9_11_unauth_summary_redirect" "Unauth access to AI summary redirects to login" "$BASE_URL/patient/ai/summary" "$NO_COOKIE" \
  "303,307,308" "/login"

run_page_check "P9_12_unauth_medications_redirect" "Unauth access to AI medications redirects to login" "$BASE_URL/patient/ai/medications" "$NO_COOKIE" \
  "303,307,308" "/login"

run_page_check "P9_13_doctor_symptoms_redirect" "Doctor hitting patient AI symptoms redirects to doctor dashboard" "$BASE_URL/patient/ai/symptoms" "$DOC_COOKIE" \
  "303,307,308" "/doctor/dashboard"

run_page_check "P9_14_doctor_summary_redirect" "Doctor hitting patient AI summary redirects to doctor dashboard" "$BASE_URL/patient/ai/summary" "$DOC_COOKIE" \
  "303,307,308" "/doctor/dashboard"

run_page_check "P9_15_doctor_medications_redirect" "Doctor hitting patient AI medications redirects to doctor dashboard" "$BASE_URL/patient/ai/medications" "$DOC_COOKIE" \
  "303,307,308" "/doctor/dashboard"

run_page_check "P9_16_frontdesk_symptoms_redirect" "Frontdesk hitting patient AI symptoms redirects to frontdesk dashboard" "$BASE_URL/patient/ai/symptoms" "$FD_COOKIE" \
  "303,307,308" "/frontdesk/dashboard"

run_page_check "P9_17_frontdesk_summary_redirect" "Frontdesk hitting patient AI summary redirects to frontdesk dashboard" "$BASE_URL/patient/ai/summary" "$FD_COOKIE" \
  "303,307,308" "/frontdesk/dashboard"

run_page_check "P9_18_frontdesk_medications_redirect" "Frontdesk hitting patient AI medications redirects to frontdesk dashboard" "$BASE_URL/patient/ai/medications" "$FD_COOKIE" \
  "303,307,308" "/frontdesk/dashboard"

# -----------------------------------------------------------------------------
# Supporting APIs for AI pages
# -----------------------------------------------------------------------------
run_json_check "P9_19_drug_search_success" "Drug search API accepts valid query" "GET" "$BASE_URL/api/drugs/search?q=met" "$NO_COOKIE" "" \
  "200" "(.results|type==\"array\") and (.count|type==\"number\")"

run_json_check "P9_20_drug_search_min_query" "Drug search enforces minimum query length" "GET" "$BASE_URL/api/drugs/search?q=a" "$NO_COOKIE" "" \
  "400" ".error != null"

run_json_check "P9_21_patient_health_summary_api" "Patient AI health-summary API reachable for patient" "GET" "$BASE_URL/api/patient/health-summary" "$PAT_COOKIE" "" \
  "200" ".success == true and (.summary|type==\"object\")"

run_json_check "P9_22_unauth_health_summary_api" "Unauth health-summary API returns 401" "GET" "$BASE_URL/api/patient/health-summary" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P9_23_doctor_health_summary_api_forbidden" "Doctor blocked from patient health-summary API" "GET" "$BASE_URL/api/patient/health-summary" "$DOC_COOKIE" "" \
  "403" ".error != null"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
{
  echo "Phase 9 Shefa AI Smoke"
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
  '{artifacts:$artifacts}' \
  > "$ARTIFACT_DIR/context.json"

echo "$ARTIFACT_DIR"
