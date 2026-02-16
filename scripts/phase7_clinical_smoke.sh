#!/usr/bin/env bash
set -u

BASE_URL="${BASE_URL:-http://localhost:3001}"
TS="$(date +%Y%m%d_%H%M%S)"
ARTIFACT_DIR="/tmp/phase7_clinical_smoke_${TS}"
mkdir -p "$ARTIFACT_DIR"

DOC1_COOKIE="$ARTIFACT_DIR/doc1.cookies.txt"
DOC2_COOKIE="$ARTIFACT_DIR/doc2.cookies.txt"
FD_COOKIE="$ARTIFACT_DIR/frontdesk.cookies.txt"
PAT_COOKIE="$ARTIFACT_DIR/patient.cookies.txt"
NO_COOKIE=""

PASS_COUNT=0
FAIL_COUNT=0
TOTAL_COUNT=0
SUMMARY_TSV="$ARTIFACT_DIR/summary.tsv"
SUMMARY_TXT="$ARTIFACT_DIR/summary.txt"
printf "id\tdescription\tresult\thttp_status\tnote\tevidence\n" > "$SUMMARY_TSV"

DOC1_PHONE="010$(date +%H%M%S)61"
DOC2_PHONE="010$(date +%H%M%S)62"
FD_PHONE="011$(date +%H%M%S)63"
PAT_PHONE="012$(date +%H%M%S)64"
DOC1_EMAIL="phase7.doc1.${TS}@medassist.test"
DOC2_EMAIL="phase7.doc2.${TS}@medassist.test"
FD_EMAIL="phase7.frontdesk.${TS}@medassist.test"
PAT_EMAIL="phase7.patient.${TS}@medassist.test"
PASSWORD="Pass1234!"
TODAY="$(date +%Y-%m-%d)"

DOC1_ID=""
DOC2_ID=""
PATIENT_ID=""
NOTE_ID=""

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
# Setup users and sessions
# -----------------------------------------------------------------------------
run_check "P7_01_register_doctor_1" "Register primary doctor" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$DOC1_PHONE\",\"email\":\"$DOC1_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"doctor\",\"specialty\":\"general-practitioner\",\"fullName\":\"Phase7 Doctor One\"}" \
  "200" ".success == true and .role == \"doctor\""
DOC1_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P7_01_register_doctor_1.json")

run_check "P7_02_register_doctor_2" "Register secondary doctor" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$DOC2_PHONE\",\"email\":\"$DOC2_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"doctor\",\"specialty\":\"pediatrics\",\"fullName\":\"Phase7 Doctor Two\"}" \
  "200" ".success == true and .role == \"doctor\""
DOC2_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P7_02_register_doctor_2.json")

run_check "P7_03_register_frontdesk" "Register frontdesk" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$FD_PHONE\",\"email\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\",\"fullName\":\"Phase7 Frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\""

run_check "P7_04_register_patient" "Register patient" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"email\":\"$PAT_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"patient\",\"fullName\":\"Phase7 Patient\"}" \
  "200" ".success == true and .role == \"patient\""
PATIENT_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P7_04_register_patient.json")

run_check "P7_05_login_doctor_1" "Login doctor 1" "POST" "$BASE_URL/api/auth/login" "$DOC1_COOKIE" \
  "{\"phone\":\"$DOC1_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"doctor\"}" \
  "200" ".success == true and .role == \"doctor\"" "readwrite"

run_check "P7_06_login_doctor_2" "Login doctor 2" "POST" "$BASE_URL/api/auth/login" "$DOC2_COOKIE" \
  "{\"phone\":\"$DOC2_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"doctor\"}" \
  "200" ".success == true and .role == \"doctor\"" "readwrite"

run_check "P7_07_login_frontdesk" "Login frontdesk" "POST" "$BASE_URL/api/auth/login" "$FD_COOKIE" \
  "{\"phone\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\"" "readwrite"

run_check "P7_08_login_patient" "Login patient" "POST" "$BASE_URL/api/auth/login" "$PAT_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"patient\"}" \
  "200" ".success == true and .role == \"patient\"" "readwrite"

# -----------------------------------------------------------------------------
# Phase 7 clinical core flow
# -----------------------------------------------------------------------------
run_check "P7_09_lab_tests_catalog_public" "Lab tests catalog returns seeded tests" "GET" "$BASE_URL/api/clinical/lab-tests" "$NO_COOKIE" "" \
  "200" ".success == true and (.tests|type==\"array\") and ((.tests|length) >= 20)"

run_check "P7_10_create_note_success" "Doctor can create clinical note with medications" "POST" "$BASE_URL/api/clinical/notes" "$DOC1_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"noteData\":{\"chief_complaint\":[\"Headache\"],\"diagnosis\":\"R51: Headache\",\"medications\":[{\"name\":\"Paracetamol\",\"frequency\":\"TID\",\"duration\":\"5 days\",\"notes\":\"After food\"}],\"plan\":\"Hydration and follow-up\"},\"keystrokeCount\":120,\"durationSeconds\":420,\"syncToPatient\":true}" \
  "200" ".success == true and (.noteId|type==\"string\")"
NOTE_ID=$(jq -r '.noteId // empty' "$ARTIFACT_DIR/P7_10_create_note_success.json")

run_check "P7_11_fetch_prescription_success" "Doctor can fetch prescription payload by noteId" "GET" "$BASE_URL/api/clinical/prescription?noteId=$NOTE_ID" "$DOC1_COOKIE" "" \
  "200" ".success == true and .note.id == \"$NOTE_ID\" and (.note.medications|type==\"array\")"

run_check "P7_12_mark_printed_success" "Doctor can mark prescription printed" "POST" "$BASE_URL/api/clinical/prescription/mark-printed" "$DOC1_COOKIE" \
  "{\"noteId\":\"$NOTE_ID\"}" \
  "200" ".success == true"

# -----------------------------------------------------------------------------
# Validation and authorization guards
# -----------------------------------------------------------------------------
run_check "P7_13_note_missing_patient" "Create note missing patient returns 400" "POST" "$BASE_URL/api/clinical/notes" "$DOC1_COOKIE" \
  "{\"noteData\":{\"chief_complaint\":[\"Headache\"],\"diagnosis\":\"R51: Headache\",\"medications\":[],\"plan\":\"rest\"}}" \
  "400" ".error != null"

run_check "P7_14_note_empty_complaint" "Create note with empty complaint returns 400" "POST" "$BASE_URL/api/clinical/notes" "$DOC1_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"noteData\":{\"chief_complaint\":[],\"diagnosis\":\"R51: Headache\",\"medications\":[],\"plan\":\"rest\"}}" \
  "400" ".error != null"

run_check "P7_15_patient_create_note_forbidden" "Patient cannot create doctor clinical note" "POST" "$BASE_URL/api/clinical/notes" "$PAT_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"noteData\":{\"chief_complaint\":[\"Headache\"],\"diagnosis\":\"R51: Headache\",\"medications\":[],\"plan\":\"rest\"}}" \
  "401" ".error != null"

run_check "P7_16_prescription_missing_noteid" "Prescription endpoint requires noteId" "GET" "$BASE_URL/api/clinical/prescription" "$DOC1_COOKIE" "" \
  "400" ".error != null"

run_check "P7_17_patient_fetch_prescription_forbidden" "Patient blocked from doctor prescription endpoint" "GET" "$BASE_URL/api/clinical/prescription?noteId=$NOTE_ID" "$PAT_COOKIE" "" \
  "403" ".error != null"

run_check "P7_18_frontdesk_fetch_prescription_forbidden" "Frontdesk blocked from doctor prescription endpoint" "GET" "$BASE_URL/api/clinical/prescription?noteId=$NOTE_ID" "$FD_COOKIE" "" \
  "403" ".error != null"

run_check "P7_19_other_doctor_note_isolated" "Doctor 2 cannot access Doctor 1 prescription" "GET" "$BASE_URL/api/clinical/prescription?noteId=$NOTE_ID" "$DOC2_COOKIE" "" \
  "404" ".error != null"

run_check "P7_20_mark_printed_missing_noteid" "Mark printed requires noteId" "POST" "$BASE_URL/api/clinical/prescription/mark-printed" "$DOC1_COOKIE" \
  "{}" \
  "400" ".error != null"

run_check "P7_21_unauth_mark_printed_guard" "Unauthenticated mark-printed returns 401" "POST" "$BASE_URL/api/clinical/prescription/mark-printed" "$NO_COOKIE" \
  "{\"noteId\":\"$NOTE_ID\"}" \
  "401" ".error != null"

run_check "P7_22_patient_mark_printed_forbidden" "Patient cannot mark doctor prescription printed" "POST" "$BASE_URL/api/clinical/prescription/mark-printed" "$PAT_COOKIE" \
  "{\"noteId\":\"$NOTE_ID\"}" \
  "403" ".error != null"

run_check "P7_23_other_doctor_mark_printed_isolated" "Doctor 2 cannot mark Doctor 1 prescription printed" "POST" "$BASE_URL/api/clinical/prescription/mark-printed" "$DOC2_COOKIE" \
  "{\"noteId\":\"$NOTE_ID\"}" \
  "404" ".error != null"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
{
  echo "Phase 7 Clinical Smoke (Doctor Core + Auth Boundaries)"
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
  --arg doctor_1_id "$DOC1_ID" \
  --arg doctor_2_id "$DOC2_ID" \
  --arg patient_id "$PATIENT_ID" \
  --arg note_id "$NOTE_ID" \
  '{artifacts:$artifacts, ids:{doctor_1:$doctor_1_id, doctor_2:$doctor_2_id, patient:$patient_id, note:$note_id}}' \
  > "$ARTIFACT_DIR/context.json"

echo "$ARTIFACT_DIR"
