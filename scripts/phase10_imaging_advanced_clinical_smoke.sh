#!/usr/bin/env bash
set -u

BASE_URL="${BASE_URL:-http://localhost:3001}"
TS="$(date +%Y%m%d_%H%M%S)"
ARTIFACT_DIR="/tmp/phase10_imaging_advanced_clinical_${TS}"
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

DOC_PHONE="010$(date +%H%M%S)41"
FD_PHONE="011$(date +%H%M%S)42"
PAT_PHONE="012$(date +%H%M%S)43"
DOC_EMAIL="phase10.doctor.${TS}@medassist.test"
FD_EMAIL="phase10.frontdesk.${TS}@medassist.test"
PAT_EMAIL="phase10.patient.${TS}@medassist.test"
PASSWORD="Pass1234!"

DOCTOR_ID=""
PATIENT_ID=""
IMAGING_RECORD_ID=""

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
run_json_check "P10_01_register_doctor" "Register doctor" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"email\":\"$DOC_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"doctor\",\"specialty\":\"general-practitioner\",\"fullName\":\"Phase10 Doctor\"}" \
  "200" ".success == true and .role == \"doctor\""
DOCTOR_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P10_01_register_doctor.json")

run_json_check "P10_02_register_frontdesk" "Register frontdesk" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$FD_PHONE\",\"email\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\",\"fullName\":\"Phase10 Frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\""

run_json_check "P10_03_register_patient" "Register patient" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"email\":\"$PAT_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"patient\",\"fullName\":\"Phase10 Patient\"}" \
  "200" ".success == true and .role == \"patient\""
PATIENT_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P10_03_register_patient.json")

run_json_check "P10_04_login_doctor" "Login doctor" "POST" "$BASE_URL/api/auth/login" "$DOC_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"doctor\"}" \
  "200" ".success == true and .role == \"doctor\"" "readwrite"

run_json_check "P10_05_login_frontdesk" "Login frontdesk" "POST" "$BASE_URL/api/auth/login" "$FD_COOKIE" \
  "{\"phone\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\"" "readwrite"

run_json_check "P10_06_login_patient" "Login patient" "POST" "$BASE_URL/api/auth/login" "$PAT_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"patient\"}" \
  "200" ".success == true and .role == \"patient\"" "readwrite"

# -----------------------------------------------------------------------------
# Implemented Phase 10 surfaces (health records summary + records API)
# -----------------------------------------------------------------------------
run_json_check "P10_07_health_summary_patient" "Patient health-summary API returns expected structure" "GET" "$BASE_URL/api/patient/health-summary" "$PAT_COOKIE" "" \
  "200" ".success == true and (.summary|type==\"object\") and (.summary.medications|type==\"object\") and (.summary.labs|type==\"object\") and (.summary.visits|type==\"object\") and (.summary.vitals|type==\"object\") and (.summary.conditions|type==\"array\") and (.summary.allergies|type==\"array\")"

run_json_check "P10_08_patient_records_get_initial" "Patient records API list reachable" "GET" "$BASE_URL/api/patient/records" "$PAT_COOKIE" "" \
  "200" ".success == true and (.records|type==\"array\")"

run_json_check "P10_09_patient_records_post_imaging" "Patient can create imaging-type medical record" "POST" "$BASE_URL/api/patient/records" "$PAT_COOKIE" \
  "{\"record_type\":\"imaging\",\"title\":\"Chest X-ray\",\"description\":\"Phase 10 smoke imaging record\",\"date\":\"2026-02-16\",\"provider_name\":\"Dr Phase10\",\"facility_name\":\"MedAssist Test Center\"}" \
  "200" ".success == true and .record.id != null and .record.record_type == \"imaging\""
IMAGING_RECORD_ID=$(jq -r '.record.id // empty' "$ARTIFACT_DIR/P10_09_patient_records_post_imaging.json")

run_json_check "P10_10_patient_records_get_after_post" "New imaging record appears in patient records list" "GET" "$BASE_URL/api/patient/records" "$PAT_COOKIE" "" \
  "200" ".success == true and (.records|type==\"array\") and ((.records|map(select(.record_type==\"imaging\"))|length) >= 1)"

run_json_check "P10_11_records_invalid_type_guard" "Patient records API rejects invalid record_type" "POST" "$BASE_URL/api/patient/records" "$PAT_COOKIE" \
  "{\"record_type\":\"bad_type\",\"title\":\"Invalid\",\"date\":\"2026-02-16\"}" \
  "400" ".error != null"

run_json_check "P10_12_records_title_guard" "Patient records API validates title length" "POST" "$BASE_URL/api/patient/records" "$PAT_COOKIE" \
  "{\"record_type\":\"imaging\",\"title\":\"A\",\"date\":\"2026-02-16\"}" \
  "400" ".error != null"

run_json_check "P10_13_records_date_guard" "Patient records API requires date" "POST" "$BASE_URL/api/patient/records" "$PAT_COOKIE" \
  "{\"record_type\":\"imaging\",\"title\":\"CT Scan\"}" \
  "400" ".error != null"

# -----------------------------------------------------------------------------
# Auth boundaries for Phase 10 APIs
# -----------------------------------------------------------------------------
run_json_check "P10_14_unauth_health_summary_guard" "Unauth health-summary API returns 401" "GET" "$BASE_URL/api/patient/health-summary" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P10_15_doctor_health_summary_forbidden" "Doctor blocked from patient health-summary API" "GET" "$BASE_URL/api/patient/health-summary" "$DOC_COOKIE" "" \
  "403" ".error != null"

run_json_check "P10_16_unauth_records_get_guard" "Unauth patient records API returns 401" "GET" "$BASE_URL/api/patient/records" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P10_17_doctor_records_get_forbidden" "Doctor blocked from patient records API" "GET" "$BASE_URL/api/patient/records" "$DOC_COOKIE" "" \
  "403" ".error != null"

run_json_check "P10_18_frontdesk_records_get_forbidden" "Frontdesk blocked from patient records API" "GET" "$BASE_URL/api/patient/records" "$FD_COOKIE" "" \
  "403" ".error != null"

run_json_check "P10_19_unauth_records_post_guard" "Unauth patient records POST returns 401" "POST" "$BASE_URL/api/patient/records" "$NO_COOKIE" \
  "{\"record_type\":\"imaging\",\"title\":\"MRI\",\"date\":\"2026-02-16\"}" \
  "401" ".error != null"

# -----------------------------------------------------------------------------
# Page route smoke
# -----------------------------------------------------------------------------
run_page_check "P10_20_patient_records_page" "Patient can open health records page (SSR shell)" "$BASE_URL/patient/records" "$PAT_COOKIE" \
  "200" "" "href=\"/patient/records\""

run_page_check "P10_21_unauth_records_page_redirect" "Unauth patient records page redirects to login" "$BASE_URL/patient/records" "$NO_COOKIE" \
  "303,307,308" "/login"

run_page_check "P10_22_doctor_records_page_redirect" "Doctor hitting patient records page redirects to doctor dashboard" "$BASE_URL/patient/records" "$DOC_COOKIE" \
  "303,307,308" "/doctor/dashboard"

run_page_check "P10_23_frontdesk_records_page_redirect" "Frontdesk hitting patient records page redirects to frontdesk dashboard" "$BASE_URL/patient/records" "$FD_COOKIE" \
  "303,307,308" "/frontdesk/dashboard"

# -----------------------------------------------------------------------------
# Phase 10 extended surfaces (imaging + records drill-down APIs/pages)
# -----------------------------------------------------------------------------
run_page_check "P10_24_doctor_imaging_orders_page" "Doctor can open imaging orders page (SSR shell)" "$BASE_URL/doctor/imaging-orders" "$DOC_COOKIE" \
  "200" "" "href=\"/doctor/imaging-orders\""

run_json_check "P10_25_doctor_imaging_orders_api" "Doctor imaging orders API reachable" "GET" "$BASE_URL/api/doctor/imaging-orders" "$DOC_COOKIE" "" \
  "200" ".success == true and (.orders|type==\"array\")"

run_page_check "P10_26_patient_vitals_page" "Patient can open vitals page (SSR shell)" "$BASE_URL/patient/vitals" "$PAT_COOKIE" \
  "200" "" "href=\"/patient/records\""

run_page_check "P10_27_patient_conditions_page" "Patient can open conditions page (SSR shell)" "$BASE_URL/patient/conditions" "$PAT_COOKIE" \
  "200" "" "href=\"/patient/records\""

run_json_check "P10_28_patient_allergies_api" "Patient allergies API reachable" "GET" "$BASE_URL/api/patient/allergies" "$PAT_COOKIE" "" \
  "200" ".success == true and (.allergies|type==\"array\")"

run_json_check "P10_29_patient_conditions_api" "Patient conditions API reachable" "GET" "$BASE_URL/api/patient/conditions" "$PAT_COOKIE" "" \
  "200" ".success == true and (.conditions|type==\"array\")"

run_json_check "P10_30_patient_immunizations_api" "Patient immunizations API reachable" "GET" "$BASE_URL/api/patient/immunizations" "$PAT_COOKIE" "" \
  "200" ".success == true and (.immunizations|type==\"array\")"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
{
  echo "Phase 10 Imaging + Advanced Clinical Smoke"
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
  --arg imaging_record_id "$IMAGING_RECORD_ID" \
  '{artifacts:$artifacts, ids:{doctor:$doctor_id, patient:$patient_id, imaging_record:$imaging_record_id}}' \
  > "$ARTIFACT_DIR/context.json"

echo "$ARTIFACT_DIR"
