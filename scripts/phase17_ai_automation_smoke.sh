#!/usr/bin/env bash
set -u

BASE_URL="${BASE_URL:-http://localhost:3001}"
TS="$(date +%Y%m%d_%H%M%S)"
ARTIFACT_DIR="/tmp/phase17_ai_automation_${TS}"
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

DOC_PHONE="010$(date +%H%M%S)21"
FD_PHONE="011$(date +%H%M%S)22"
PAT_PHONE="012$(date +%H%M%S)23"
DOC_EMAIL="phase17.doctor.${TS}@medassist.test"
FD_EMAIL="phase17.frontdesk.${TS}@medassist.test"
PAT_EMAIL="phase17.patient.${TS}@medassist.test"
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
run_json_check "P17_01_register_doctor" "Register doctor" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"email\":\"$DOC_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"doctor\",\"specialty\":\"general-practitioner\",\"fullName\":\"Phase17 Doctor\"}" \
  "200" ".success == true and .role == \"doctor\""

run_json_check "P17_02_register_frontdesk" "Register frontdesk" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$FD_PHONE\",\"email\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\",\"fullName\":\"Phase17 Frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\""

run_json_check "P17_03_register_patient" "Register patient" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"email\":\"$PAT_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"patient\",\"fullName\":\"Phase17 Patient\"}" \
  "200" ".success == true and .role == \"patient\""

run_json_check "P17_04_login_doctor" "Login doctor" "POST" "$BASE_URL/api/auth/login" "$DOC_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"doctor\"}" \
  "200" ".success == true and .role == \"doctor\"" "readwrite"

run_json_check "P17_05_login_frontdesk" "Login frontdesk" "POST" "$BASE_URL/api/auth/login" "$FD_COOKIE" \
  "{\"phone\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\"" "readwrite"

run_json_check "P17_06_login_patient" "Login patient" "POST" "$BASE_URL/api/auth/login" "$PAT_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"patient\"}" \
  "200" ".success == true and .role == \"patient\"" "readwrite"

run_json_check "P17_07_login_role_mismatch_guard" "Login denies role mismatch (doctor as patient)" "POST" "$BASE_URL/api/auth/login" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"patient\"}" \
  "403" ".error != null"

# -----------------------------------------------------------------------------
# Current AI page surfaces (patient-facing)
# -----------------------------------------------------------------------------
run_page_check "P17_08_patient_ai_symptoms_page" "Patient can open AI symptoms page" "$BASE_URL/patient/ai/symptoms" "$PAT_COOKIE" \
  "200" "" "Symptom Checker"

run_page_check "P17_09_patient_ai_summary_page" "Patient can open AI summary page" "$BASE_URL/patient/ai/summary" "$PAT_COOKIE" \
  "200" "" "AI Health Summary|Analyzing your health data"

run_page_check "P17_10_patient_ai_medications_page" "Patient can open AI medications page" "$BASE_URL/patient/ai/medications" "$PAT_COOKIE" \
  "200" "" "Medication Assistant"

run_page_check "P17_11_doctor_dashboard_page_with_ai_layout" "Doctor dashboard reachable (doctor AI layout active)" "$BASE_URL/doctor/dashboard" "$DOC_COOKIE" \
  "200"

run_page_check "P17_12_doctor_patients_page_with_ai_controls" "Doctor patients page reachable" "$BASE_URL/doctor/patients" "$DOC_COOKIE" \
  "200"

# -----------------------------------------------------------------------------
# AI page role boundaries
# -----------------------------------------------------------------------------
run_page_check "P17_13_unauth_symptoms_redirect" "Unauth access to AI symptoms redirects to login" "$BASE_URL/patient/ai/symptoms" "$NO_COOKIE" \
  "303,307,308" "/login"

run_page_check "P17_14_unauth_summary_redirect" "Unauth access to AI summary redirects to login" "$BASE_URL/patient/ai/summary" "$NO_COOKIE" \
  "303,307,308" "/login"

run_page_check "P17_15_unauth_medications_redirect" "Unauth access to AI medications redirects to login" "$BASE_URL/patient/ai/medications" "$NO_COOKIE" \
  "303,307,308" "/login"

run_page_check "P17_16_doctor_symptoms_redirect" "Doctor hitting patient AI symptoms redirects to doctor dashboard" "$BASE_URL/patient/ai/symptoms" "$DOC_COOKIE" \
  "303,307,308" "/doctor/dashboard"

run_page_check "P17_17_doctor_summary_redirect" "Doctor hitting patient AI summary redirects to doctor dashboard" "$BASE_URL/patient/ai/summary" "$DOC_COOKIE" \
  "303,307,308" "/doctor/dashboard"

run_page_check "P17_18_doctor_medications_redirect" "Doctor hitting patient AI medications redirects to doctor dashboard" "$BASE_URL/patient/ai/medications" "$DOC_COOKIE" \
  "303,307,308" "/doctor/dashboard"

run_page_check "P17_19_frontdesk_symptoms_redirect" "Frontdesk hitting patient AI symptoms redirects to frontdesk dashboard" "$BASE_URL/patient/ai/symptoms" "$FD_COOKIE" \
  "303,307,308" "/frontdesk/dashboard"

run_page_check "P17_20_frontdesk_summary_redirect" "Frontdesk hitting patient AI summary redirects to frontdesk dashboard" "$BASE_URL/patient/ai/summary" "$FD_COOKIE" \
  "303,307,308" "/frontdesk/dashboard"

run_page_check "P17_21_frontdesk_medications_redirect" "Frontdesk hitting patient AI medications redirects to frontdesk dashboard" "$BASE_URL/patient/ai/medications" "$FD_COOKIE" \
  "303,307,308" "/frontdesk/dashboard"

# -----------------------------------------------------------------------------
# AI support APIs (implemented baseline)
# -----------------------------------------------------------------------------
run_json_check "P17_22_drug_search_success" "Drug search API accepts valid query" "GET" "$BASE_URL/api/drugs/search?q=met" "$NO_COOKIE" "" \
  "200" "(.results|type==\"array\") and (.count|type==\"number\")"

run_json_check "P17_23_drug_search_min_query" "Drug search enforces minimum query length" "GET" "$BASE_URL/api/drugs/search?q=a" "$NO_COOKIE" "" \
  "400" ".error != null"

run_json_check "P17_24_icd10_search_success" "ICD10 search API accepts valid query" "GET" "$BASE_URL/api/icd10/search?q=diab" "$NO_COOKIE" "" \
  "200" "(.results|type==\"array\") and (.count|type==\"number\")"

run_json_check "P17_25_icd10_search_min_query" "ICD10 search enforces minimum query length" "GET" "$BASE_URL/api/icd10/search?q=a" "$NO_COOKIE" "" \
  "400" ".error != null"

run_json_check "P17_26_patient_health_summary_ai_api" "Patient AI summary API reachable for patient" "GET" "$BASE_URL/api/patient/health-summary" "$PAT_COOKIE" "" \
  "200" ".success == true and (.summary|type==\"object\")"

run_json_check "P17_27_unauth_health_summary_guard" "Unauth health-summary API returns 401" "GET" "$BASE_URL/api/patient/health-summary" "$NO_COOKIE" "" \
  "401" ".error != null"

run_json_check "P17_28_doctor_health_summary_forbidden" "Doctor blocked from patient health-summary API" "GET" "$BASE_URL/api/patient/health-summary" "$DOC_COOKIE" "" \
  "403" ".error != null"

run_json_check "P17_29_frontdesk_health_summary_forbidden" "Frontdesk blocked from patient health-summary API" "GET" "$BASE_URL/api/patient/health-summary" "$FD_COOKIE" "" \
  "403" ".error != null"

run_json_check "P17_30_doctor_drug_search_access" "Doctor can access drug search API" "GET" "$BASE_URL/api/drugs/search?q=met" "$DOC_COOKIE" "" \
  "200" "(.results|type==\"array\")"

run_json_check "P17_31_frontdesk_drug_search_access" "Frontdesk can access drug search API" "GET" "$BASE_URL/api/drugs/search?q=met" "$FD_COOKIE" "" \
  "200" "(.results|type==\"array\")"

run_json_check "P17_32_patient_icd10_search_access" "Patient can access ICD10 search API" "GET" "$BASE_URL/api/icd10/search?q=dia" "$PAT_COOKIE" "" \
  "200" "(.results|type==\"array\")"

# -----------------------------------------------------------------------------
# Phase 17 roadmap gaps (expected, currently unimplemented)
# -----------------------------------------------------------------------------
run_json_check "P17_33_gap_voice_transcribe_api" "GAP: voice transcription API currently missing" "POST" "$BASE_URL/api/ai/voice-transcribe" "$DOC_COOKIE" \
  "{\"audio\":\"dummy\"}" \
  "404"

run_json_check "P17_34_gap_voice_stream_api" "GAP: realtime speech stream API currently missing" "POST" "$BASE_URL/api/ai/voice-stream" "$DOC_COOKIE" \
  "{\"chunk\":\"dummy\"}" \
  "404"

run_json_check "P17_35_gap_diagnosis_suggestions_api" "GAP: diagnosis suggestions API currently missing" "POST" "$BASE_URL/api/ai/diagnosis-suggestions" "$DOC_COOKIE" \
  "{\"symptoms\":[\"fever\"]}" \
  "404"

run_json_check "P17_36_gap_differential_api" "GAP: differential diagnosis API currently missing" "POST" "$BASE_URL/api/ai/differential-diagnosis" "$DOC_COOKIE" \
  "{\"symptoms\":[\"cough\",\"fever\"]}" \
  "404"

run_json_check "P17_37_gap_drug_interactions_api" "GAP: AI drug interactions API currently missing" "POST" "$BASE_URL/api/ai/drug-interactions" "$PAT_COOKIE" \
  "{\"drugs\":[\"metformin\",\"ibuprofen\"]}" \
  "404"

run_json_check "P17_38_gap_allergy_alerts_api" "GAP: allergy alerts AI API currently missing" "POST" "$BASE_URL/api/ai/allergy-alerts" "$DOC_COOKIE" \
  "{\"patientId\":\"dummy\"}" \
  "404"

run_json_check "P17_39_gap_medical_kb_search_api" "GAP: medical knowledge search API currently missing" "GET" "$BASE_URL/api/ai/medical-knowledge/search?q=hypertension" "$DOC_COOKIE" "" \
  "404"

run_json_check "P17_40_gap_note_automation_api" "GAP: AI note automation API currently missing" "POST" "$BASE_URL/api/ai/automation/summarize-note" "$DOC_COOKIE" \
  "{\"note\":\"dummy\"}" \
  "404"

run_page_check "P17_41_gap_doctor_ai_assistant_page" "GAP: dedicated doctor AI assistant page currently missing" "$BASE_URL/doctor/ai/assistant" "$DOC_COOKIE" \
  "404"

run_page_check "P17_42_gap_doctor_voice_dictation_page" "GAP: doctor voice dictation page currently missing" "$BASE_URL/doctor/ai/voice-dictation" "$DOC_COOKIE" \
  "404"

run_page_check "P17_43_gap_patient_ai_differential_page" "GAP: patient differential page currently missing" "$BASE_URL/patient/ai/differential" "$PAT_COOKIE" \
  "404"

run_page_check "P17_44_gap_patient_ai_voice_page" "GAP: patient AI voice page currently missing" "$BASE_URL/patient/ai/voice" "$PAT_COOKIE" \
  "404"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
{
  echo "Phase 17 AI + Automation Smoke"
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
