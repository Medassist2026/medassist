#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
ENV_FILE="${ENV_FILE:-.env.local}"
TS="$(date +%Y%m%d_%H%M%S)"
ARTIFACT_DIR="/tmp/privacy_tenant_abuse_${TS}"
mkdir -p "$ARTIFACT_DIR"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
  exit 1
fi

DOC_A_COOKIE="$ARTIFACT_DIR/doctor_a.cookies.txt"
DOC_B_COOKIE="$ARTIFACT_DIR/doctor_b.cookies.txt"
FD_COOKIE="$ARTIFACT_DIR/frontdesk.cookies.txt"
NO_COOKIE=""

PASS=0
FAIL=0
SUMMARY="$ARTIFACT_DIR/summary.tsv"
printf "id\tresult\thttp_status\tnote\tevidence\n" > "$SUMMARY"

record_result() {
  local id="$1"
  local result="$2"
  local status="$3"
  local note="$4"
  local evidence="$5"
  printf "%s\t%s\t%s\t%s\t%s\n" "$id" "$result" "$status" "$note" "$evidence" >> "$SUMMARY"
  if [[ "$result" == "PASS" ]]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
}

run_json_check() {
  local id="$1"
  local method="$2"
  local url="$3"
  local cookie_file="$4"
  local payload="${5:-}"
  local expected_status="$6"
  local jq_assert="${7:-}"
  local extra_header="${8:-}"

  local outfile="$ARTIFACT_DIR/${id}.json"
  local status=""
  local -a args
  args=(-sS -X "$method" "$url" -o "$outfile" -w "%{http_code}")

  if [[ -n "$cookie_file" ]]; then
    args+=(-b "$cookie_file")
  fi
  if [[ "$method" == "POST" || "$method" == "PATCH" || "$method" == "PUT" ]]; then
    args+=(-H "Content-Type: application/json")
  fi
  if [[ -n "$payload" ]]; then
    args+=(--data "$payload")
  fi
  if [[ -n "$extra_header" ]]; then
    args+=(-H "$extra_header")
  fi

  status=$(curl "${args[@]}" || echo "000")
  local ok="true"
  local note="ok"

  if [[ "$status" != "$expected_status" ]]; then
    ok="false"
    note="expected $expected_status got $status"
  fi

  if [[ "$ok" == "true" && -n "$jq_assert" ]]; then
    if ! jq -e "$jq_assert" "$outfile" >/dev/null 2>&1; then
      ok="false"
      note="jq assertion failed: $jq_assert"
    fi
  fi

  if [[ "$ok" == "true" ]]; then
    record_result "$id" "PASS" "$status" "$note" "$outfile"
  else
    record_result "$id" "FAIL" "$status" "$note" "$outfile"
  fi
}

rest_insert() {
  local table="$1"
  local json_payload="$2"
  local out="$3"
  curl -sS "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    --data "$json_payload" > "$out"
}

rest_update() {
  local table="$1"
  local filter="$2"
  local json_payload="$3"
  local out="$4"
  curl -sS "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?${filter}" \
    -X PATCH \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    --data "$json_payload" > "$out"
}

DOC_A_LOCAL="010$(date +%H%M%S)71"
DOC_B_LOCAL="010$(date +%H%M%S)72"
FD_LOCAL="011$(date +%H%M%S)73"
PAT_LOCAL="012$(date +%H%M%S)74"
DOC_A_PHONE="+2${DOC_A_LOCAL}"
DOC_B_PHONE="+2${DOC_B_LOCAL}"
FD_PHONE="+2${FD_LOCAL}"
PAT_PHONE="20${PAT_LOCAL#0}"
PASSWORD="Pass1234!"
DOC_A_EMAIL="privacy.doca.${TS}@medassist.test"
DOC_B_EMAIL="privacy.docb.${TS}@medassist.test"
FD_EMAIL="privacy.frontdesk.${TS}@medassist.test"
PAT_EMAIL="privacy.patient.${TS}@medassist.test"

run_json_check "T01_register_doctor_a" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_A_PHONE\",\"email\":\"$DOC_A_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"doctor\",\"specialty\":\"general-practitioner\",\"fullName\":\"Privacy Doctor A\"}" \
  "200" ".success == true and .role == \"doctor\""
DOC_A_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/T01_register_doctor_a.json")

run_json_check "T02_register_doctor_b" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_B_PHONE\",\"email\":\"$DOC_B_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"doctor\",\"specialty\":\"general-practitioner\",\"fullName\":\"Privacy Doctor B\"}" \
  "200" ".success == true and .role == \"doctor\""
DOC_B_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/T02_register_doctor_b.json")

run_json_check "T03_register_frontdesk" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$FD_PHONE\",\"email\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\",\"fullName\":\"Privacy Frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\""
FD_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/T03_register_frontdesk.json")

run_json_check "T04_register_patient" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"email\":\"$PAT_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"patient\",\"fullName\":\"Privacy Patient\"}" \
  "200" ".success == true and .role == \"patient\""
PATIENT_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/T04_register_patient.json")
PATIENT_CODE=$(jq -r '.uniqueId // empty' "$ARTIFACT_DIR/T04_register_patient.json")

run_json_check "T05_login_doctor_a" "POST" "$BASE_URL/api/auth/login" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_A_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"doctor\"}" \
  "200" ".success == true and .role == \"doctor\""
curl -sS -X POST "$BASE_URL/api/auth/login" -H "Content-Type: application/json" -c "$DOC_A_COOKIE" \
  --data "{\"phone\":\"$DOC_A_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"doctor\"}" > "$ARTIFACT_DIR/T05_login_doctor_a_cookie.json"
curl -sS -X POST "$BASE_URL/api/auth/login" -H "Content-Type: application/json" -c "$DOC_B_COOKIE" \
  --data "{\"phone\":\"$DOC_B_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"doctor\"}" > "$ARTIFACT_DIR/T05_login_doctor_b_cookie.json"
curl -sS -X POST "$BASE_URL/api/auth/login" -H "Content-Type: application/json" -c "$FD_COOKIE" \
  --data "{\"phone\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\"}" > "$ARTIFACT_DIR/T05_login_frontdesk_cookie.json"

CLINIC_A_UID="CLNA${TS}"
CLINIC_B_UID="CLNB${TS}"
rest_insert "clinics" "[{\"unique_id\":\"$CLINIC_A_UID\",\"name\":\"Privacy Clinic A\"},{\"unique_id\":\"$CLINIC_B_UID\",\"name\":\"Privacy Clinic B\"}]" "$ARTIFACT_DIR/T06_clinics.json"
CLINIC_A_ID=$(jq -r '.[0].id // empty' "$ARTIFACT_DIR/T06_clinics.json")
CLINIC_B_ID=$(jq -r '.[1].id // empty' "$ARTIFACT_DIR/T06_clinics.json")

rest_insert "clinic_doctors" \
  "[{\"clinic_id\":\"$CLINIC_A_ID\",\"doctor_id\":\"$DOC_A_ID\",\"role\":\"doctor\"},{\"clinic_id\":\"$CLINIC_B_ID\",\"doctor_id\":\"$DOC_B_ID\",\"role\":\"doctor\"}]" \
  "$ARTIFACT_DIR/T07_clinic_doctors.json"
rest_update "front_desk_staff" "id=eq.${FD_ID}" "{\"clinic_id\":\"$CLINIC_A_ID\"}" "$ARTIFACT_DIR/T08_frontdesk_scope.json"

run_json_check "T09_frontdesk_doctors_scoped" "GET" "$BASE_URL/api/doctors/list" "$FD_COOKIE" "" \
  "200" ".success == true and (.doctors|map(.id)|index(\"$DOC_A_ID\") != null) and (.doctors|map(.id)|index(\"$DOC_B_ID\") == null)"

run_json_check "T10_frontdesk_reject_outside_clinic_doctor" "POST" "$BASE_URL/api/frontdesk/appointments/create" "$FD_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOC_B_ID\",\"startTime\":\"2026-12-02T10:00:00Z\",\"durationMinutes\":30,\"appointmentType\":\"regular\"}" \
  "403" ".error != null"

run_json_check "T11_onboard_invalid_code_no_upgrade" "POST" "$BASE_URL/api/patients/onboard" "$DOC_A_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"fullName\":\"Privacy Patient\",\"age\":30,\"sex\":\"Male\",\"patientCode\":\"WRONGCODE1\"}" \
  "400" ".success == false and .access_level == \"walk_in_limited\" and .consent_state == \"pending\""

curl -sS "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/doctor_patient_relationships?select=access_level,consent_state,access_type&doctor_id=eq.${DOC_A_ID}&patient_id=eq.${PATIENT_ID}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" > "$ARTIFACT_DIR/T12_relationship.json"
if jq -e 'length == 0 or (.[0].access_level != "verified_consented" and .[0].consent_state != "granted")' "$ARTIFACT_DIR/T12_relationship.json" >/dev/null; then
  record_result "T12_relationship_pending_after_invalid_code" "PASS" "200" "relationship remains non-verified" "$ARTIFACT_DIR/T12_relationship.json"
else
  record_result "T12_relationship_pending_after_invalid_code" "FAIL" "200" "relationship unexpectedly verified" "$ARTIFACT_DIR/T12_relationship.json"
fi

run_json_check "T13_message_blocked_without_consent" "POST" "$BASE_URL/api/doctor/messages" "$DOC_A_COOKIE" \
  "{\"patient_id\":\"$PATIENT_ID\",\"content\":\"hello\"}" \
  "403" ".error != null"

run_json_check "T14_login_unknown_is_generic_401" "POST" "$BASE_URL/api/auth/login" "$NO_COOKIE" \
  "{\"phone\":\"01000000000\",\"password\":\"WrongPass1!\",\"role\":\"doctor\"}" \
  "401" ".error == \"Invalid credentials\""

run_json_check "T15_login_role_probe_is_generic_401" "POST" "$BASE_URL/api/auth/login" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_A_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"patient\"}" \
  "401" ".error == \"Invalid credentials\""

for i in $(seq 1 13); do
  run_json_check "T16_verify_code_rate_${i}" "POST" "$BASE_URL/api/patients/verify-code" "$DOC_A_COOKIE" \
    "{\"phone\":\"$PAT_PHONE\",\"code\":\"BAD${i}\"}" \
    "$([[ $i -le 12 ]] && echo 200 || echo 429)" \
    "$([[ $i -le 12 ]] && echo '.valid == false' || echo '.error != null')" \
    "x-forwarded-for: 198.51.100.26"
done

for i in $(seq 1 9); do
  expected_status="401"
  login_assert='.error == "Invalid credentials"'
  if [[ $i -gt 8 ]]; then
    expected_status="429"
    login_assert='.error != null'
  fi
  run_json_check "T17_login_rate_${i}" "POST" "$BASE_URL/api/auth/login" "$NO_COOKIE" \
    "{\"phone\":\"01099999999\",\"password\":\"WrongPass1!\",\"role\":\"doctor\"}" \
    "$expected_status" \
    "$login_assert" \
    "x-forwarded-for: 198.51.100.27"
done

run_json_check "T18A_onboard_without_code_creates_relationship" "POST" "$BASE_URL/api/patients/onboard" "$DOC_A_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"fullName\":\"Privacy Patient\",\"age\":30,\"sex\":\"Male\"}" \
  "200" ".success == true and .access_level == \"walk_in_limited\" and .consent_state == \"pending\""

run_json_check "T18_upgrade_with_valid_code" "POST" "$BASE_URL/api/patients/${PATIENT_ID}/relationship" "$DOC_A_COOKIE" \
  "{\"code\":\"$PATIENT_CODE\"}" \
  "200" ".success == true and .access_level == \"verified_consented\" and .consent_state == \"granted\""

rest_insert "appointments" \
  "[{\"doctor_id\":\"$DOC_A_ID\",\"patient_id\":\"$PATIENT_ID\",\"start_time\":\"2026-12-03T09:00:00Z\",\"duration_minutes\":20,\"status\":\"completed\",\"created_by_role\":\"doctor\"}]" \
  "$ARTIFACT_DIR/T19_completed_visit.json"

run_json_check "T20_message_allowed_after_consent_and_visit" "POST" "$BASE_URL/api/doctor/messages" "$DOC_A_COOKIE" \
  "{\"patient_id\":\"$PATIENT_ID\",\"content\":\"post-consent message\"}" \
  "200" ".success == true and .message.id != null"

run_json_check "T21_other_doctor_blocked_from_messaging" "POST" "$BASE_URL/api/doctor/messages" "$DOC_B_COOKIE" \
  "{\"patient_id\":\"$PATIENT_ID\",\"content\":\"unauthorized\"}" \
  "403" ".error != null"

echo "Artifacts: $ARTIFACT_DIR"
echo "PASS=$PASS FAIL=$FAIL"
cat "$SUMMARY"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
