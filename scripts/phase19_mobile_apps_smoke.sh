#!/usr/bin/env bash
set -u

BASE_URL="${BASE_URL:-http://localhost:3001}"
TS="$(date +%Y%m%d_%H%M%S)"
ARTIFACT_DIR="/tmp/phase19_mobile_apps_${TS}"
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
DOC_EMAIL="phase19.doctor.${TS}@medassist.test"
FD_EMAIL="phase19.frontdesk.${TS}@medassist.test"
PAT_EMAIL="phase19.patient.${TS}@medassist.test"
PASSWORD="Pass1234!"

MOBILE_UA="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

APPT_DATE="2026-12-03"
APPT_START="2026-12-03T10:00:00Z"
TODAY="$(date +%Y-%m-%d)"

DOCTOR_ID=""
PATIENT_ID=""
APPOINTMENT_ID=""
MEDICATION_ID=""

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
  local user_agent="${10:-}"

  TOTAL_COUNT=$((TOTAL_COUNT + 1))
  local outfile="$ARTIFACT_DIR/${id}.json"
  local status=""
  local ua_args=()
  if [[ -n "$user_agent" ]]; then
    ua_args=(-A "$user_agent")
  fi

  if [[ -n "$cookie_file" && -n "$payload" ]]; then
    if [[ "$cookie_mode" == "readwrite" ]]; then
      status=$(curl -sS -X "$method" "$url" \
        ${ua_args[@]+"${ua_args[@]}"} \
        -H "Content-Type: application/json" \
        -b "$cookie_file" -c "$cookie_file" \
        --data "$payload" \
        -o "$outfile" -w "%{http_code}" || echo "000")
    else
      status=$(curl -sS -X "$method" "$url" \
        ${ua_args[@]+"${ua_args[@]}"} \
        -H "Content-Type: application/json" \
        -b "$cookie_file" \
        --data "$payload" \
        -o "$outfile" -w "%{http_code}" || echo "000")
    fi
  elif [[ -n "$cookie_file" ]]; then
    if [[ "$cookie_mode" == "readwrite" ]]; then
      status=$(curl -sS -X "$method" "$url" \
        ${ua_args[@]+"${ua_args[@]}"} \
        -b "$cookie_file" -c "$cookie_file" \
        -o "$outfile" -w "%{http_code}" || echo "000")
    else
      status=$(curl -sS -X "$method" "$url" \
        ${ua_args[@]+"${ua_args[@]}"} \
        -b "$cookie_file" \
        -o "$outfile" -w "%{http_code}" || echo "000")
    fi
  elif [[ -n "$payload" ]]; then
    status=$(curl -sS -X "$method" "$url" \
      ${ua_args[@]+"${ua_args[@]}"} \
      -H "Content-Type: application/json" \
      --data "$payload" \
      -o "$outfile" -w "%{http_code}" || echo "000")
  else
    status=$(curl -sS -X "$method" "$url" \
      ${ua_args[@]+"${ua_args[@]}"} \
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
  local user_agent="${8:-}"

  TOTAL_COUNT=$((TOTAL_COUNT + 1))
  local body_out="$ARTIFACT_DIR/${id}.html"
  local headers_out="$ARTIFACT_DIR/${id}.headers.txt"
  local status
  local ua_args=()
  if [[ -n "$user_agent" ]]; then
    ua_args=(-A "$user_agent")
  fi

  if [[ -n "$cookie_file" ]]; then
    status=$(curl -sS ${ua_args[@]+"${ua_args[@]}"} -D "$headers_out" -o "$body_out" -w "%{http_code}" -X GET "$url" -b "$cookie_file" || echo "000")
  else
    status=$(curl -sS ${ua_args[@]+"${ua_args[@]}"} -D "$headers_out" -o "$body_out" -w "%{http_code}" -X GET "$url" || echo "000")
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
run_json_check "P19_01_register_doctor" "Register doctor" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"email\":\"$DOC_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"doctor\",\"specialty\":\"general-practitioner\",\"fullName\":\"Phase19 Doctor\"}" \
  "200" ".success == true and .role == \"doctor\""
DOCTOR_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P19_01_register_doctor.json")

run_json_check "P19_02_register_frontdesk" "Register frontdesk" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$FD_PHONE\",\"email\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\",\"fullName\":\"Phase19 Frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\""

run_json_check "P19_03_register_patient" "Register patient" "POST" "$BASE_URL/api/auth/register" "$NO_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"email\":\"$PAT_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"patient\",\"fullName\":\"Phase19 Patient\"}" \
  "200" ".success == true and .role == \"patient\""
PATIENT_ID=$(jq -r '.userId // empty' "$ARTIFACT_DIR/P19_03_register_patient.json")

run_json_check "P19_04_login_doctor" "Login doctor" "POST" "$BASE_URL/api/auth/login" "$DOC_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"doctor\"}" \
  "200" ".success == true and .role == \"doctor\"" "readwrite"

run_json_check "P19_05_login_frontdesk" "Login frontdesk" "POST" "$BASE_URL/api/auth/login" "$FD_COOKIE" \
  "{\"phone\":\"$FD_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"frontdesk\"}" \
  "200" ".success == true and .role == \"frontdesk\"" "readwrite"

run_json_check "P19_06_login_patient" "Login patient" "POST" "$BASE_URL/api/auth/login" "$PAT_COOKIE" \
  "{\"phone\":\"$PAT_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"patient\"}" \
  "200" ".success == true and .role == \"patient\"" "readwrite"

run_json_check "P19_07_login_role_mismatch_guard" "Login denies role mismatch (doctor as patient)" "POST" "$BASE_URL/api/auth/login" "$NO_COOKIE" \
  "{\"phone\":\"$DOC_PHONE\",\"password\":\"$PASSWORD\",\"role\":\"patient\"}" \
  "403" ".error != null"

# -----------------------------------------------------------------------------
# Mobile-UA baseline on implemented routes/APIs
# -----------------------------------------------------------------------------
run_json_check "P19_08_create_mobile_consultation_appointment" "Frontdesk creates appointment used by mobile clients" "POST" "$BASE_URL/api/frontdesk/appointments/create" "$FD_COOKIE" \
  "{\"patientId\":\"$PATIENT_ID\",\"doctorId\":\"$DOCTOR_ID\",\"startTime\":\"$APPT_START\",\"durationMinutes\":30,\"appointmentType\":\"consultation\",\"notes\":\"Phase19 mobile scheduling baseline\"}" \
  "200" ".success == true and (.appointment.id|type==\"string\") and .appointment.appointment_type == \"consultation\""
APPOINTMENT_ID=$(jq -r '.appointment.id // empty' "$ARTIFACT_DIR/P19_08_create_mobile_consultation_appointment.json")

run_json_check "P19_09_doctor_appointments_mobile_api" "Doctor appointments API works under mobile user-agent" "GET" "$BASE_URL/api/doctor/appointments?date=$APPT_DATE" "$DOC_COOKIE" "" \
  "200" "(.appointments|type==\"array\") and ((.appointments|map(select(.id==\"$APPOINTMENT_ID\"))|length) >= 1)" "readonly" "$MOBILE_UA"

run_json_check "P19_10_frontdesk_appointments_mobile_api" "Frontdesk appointments API works under mobile user-agent" "GET" "$BASE_URL/api/frontdesk/appointments?date=$APPT_DATE&doctorId=$DOCTOR_ID" "$FD_COOKIE" "" \
  "200" ".success == true and (.appointments|type==\"array\") and ((.appointments|map(select(.id==\"$APPOINTMENT_ID\"))|length) >= 1)" "readonly" "$MOBILE_UA"

run_json_check "P19_11_create_patient_medication_mobile_api" "Patient can create medication from mobile user-agent" "POST" "$BASE_URL/api/patient/medications" "$PAT_COOKIE" \
  "{\"medication_name\":\"Omega 3\",\"dosage\":\"1000 mg\",\"frequency\":\"daily\",\"start_date\":\"$TODAY\",\"purpose\":\"Phase19 mobile check\"}" \
  "200" ".success == true and (.medication.id|type==\"string\")" "readonly" "$MOBILE_UA"
MEDICATION_ID=$(jq -r '.medication.id // empty' "$ARTIFACT_DIR/P19_11_create_patient_medication_mobile_api.json")

run_json_check "P19_12_list_patient_medications_mobile_api" "Patient medications list works under mobile user-agent" "GET" "$BASE_URL/api/patient/medications" "$PAT_COOKIE" "" \
  "200" ".success == true and (.medications|type==\"array\") and ((.medications|map(select(.id==\"$MEDICATION_ID\"))|length) >= 1)" "readonly" "$MOBILE_UA"

run_json_check "P19_13_health_summary_mobile_api" "Patient health summary API works under mobile user-agent" "GET" "$BASE_URL/api/patient/health-summary" "$PAT_COOKIE" "" \
  "200" ".success == true and (.summary|type==\"object\")" "readonly" "$MOBILE_UA"

run_page_check "P19_14_patient_dashboard_mobile_page" "Patient dashboard reachable on mobile user-agent" "$BASE_URL/patient/dashboard" "$PAT_COOKIE" \
  "200" "" "" "$MOBILE_UA"

run_page_check "P19_15_patient_medications_mobile_page" "Patient medications page reachable on mobile user-agent" "$BASE_URL/patient/medications" "$PAT_COOKIE" \
  "200" "" "" "$MOBILE_UA"

run_page_check "P19_16_patient_records_mobile_page" "Patient records page reachable on mobile user-agent" "$BASE_URL/patient/records" "$PAT_COOKIE" \
  "200" "" "" "$MOBILE_UA"

run_page_check "P19_17_patient_messages_mobile_page" "Patient messages page reachable on mobile user-agent" "$BASE_URL/patient/messages" "$PAT_COOKIE" \
  "200" "" "" "$MOBILE_UA"

run_page_check "P19_18_doctor_dashboard_mobile_page" "Doctor dashboard reachable on mobile user-agent" "$BASE_URL/doctor/dashboard" "$DOC_COOKIE" \
  "200" "" "" "$MOBILE_UA"

run_page_check "P19_19_doctor_patients_mobile_page" "Doctor patients page reachable on mobile user-agent" "$BASE_URL/doctor/patients" "$DOC_COOKIE" \
  "200" "" "" "$MOBILE_UA"

run_page_check "P19_20_doctor_messages_mobile_page" "Doctor messages page reachable on mobile user-agent" "$BASE_URL/doctor/messages" "$DOC_COOKIE" \
  "200" "" "" "$MOBILE_UA"

run_page_check "P19_21_frontdesk_dashboard_mobile_page" "Frontdesk dashboard reachable on mobile user-agent" "$BASE_URL/frontdesk/dashboard" "$FD_COOKIE" \
  "200" "" "" "$MOBILE_UA"

run_page_check "P19_22_frontdesk_checkin_mobile_page" "Frontdesk check-in page reachable on mobile user-agent" "$BASE_URL/frontdesk/checkin" "$FD_COOKIE" \
  "200" "" "" "$MOBILE_UA"

run_page_check "P19_23_frontdesk_new_appointment_mobile_page" "Frontdesk appointment creation page reachable on mobile user-agent" "$BASE_URL/frontdesk/appointments/new" "$FD_COOKIE" \
  "200" "" "" "$MOBILE_UA"

# -----------------------------------------------------------------------------
# Auth/RBAC boundaries under mobile user-agent
# -----------------------------------------------------------------------------
run_json_check "P19_24_unauth_patient_medications_guard" "Unauthenticated patient medications returns 401" "GET" "$BASE_URL/api/patient/medications" "$NO_COOKIE" "" \
  "401" ".error != null" "readonly" "$MOBILE_UA"

run_json_check "P19_25_doctor_patient_medications_forbidden" "Doctor blocked from patient medications API" "GET" "$BASE_URL/api/patient/medications" "$DOC_COOKIE" "" \
  "403" ".error != null" "readonly" "$MOBILE_UA"

run_json_check "P19_26_frontdesk_patient_medications_forbidden" "Frontdesk blocked from patient medications API" "GET" "$BASE_URL/api/patient/medications" "$FD_COOKIE" "" \
  "403" ".error != null" "readonly" "$MOBILE_UA"

run_json_check "P19_27_unauth_doctor_appointments_guard" "Unauthenticated doctor appointments returns 401" "GET" "$BASE_URL/api/doctor/appointments?date=$APPT_DATE" "$NO_COOKIE" "" \
  "401" ".error != null" "readonly" "$MOBILE_UA"

run_json_check "P19_28_patient_doctor_appointments_forbidden" "Patient blocked from doctor appointments API" "GET" "$BASE_URL/api/doctor/appointments?date=$APPT_DATE" "$PAT_COOKIE" "" \
  "403" ".error != null" "readonly" "$MOBILE_UA"

run_json_check "P19_29_frontdesk_doctor_appointments_forbidden" "Frontdesk blocked from doctor appointments API" "GET" "$BASE_URL/api/doctor/appointments?date=$APPT_DATE" "$FD_COOKIE" "" \
  "403" ".error != null" "readonly" "$MOBILE_UA"

run_json_check "P19_30_unauth_frontdesk_appointments_guard" "Unauthenticated frontdesk appointments returns 401" "GET" "$BASE_URL/api/frontdesk/appointments?date=$APPT_DATE&doctorId=$DOCTOR_ID" "$NO_COOKIE" "" \
  "401" ".error != null" "readonly" "$MOBILE_UA"

run_json_check "P19_31_patient_frontdesk_appointments_forbidden" "Patient blocked from frontdesk appointments API" "GET" "$BASE_URL/api/frontdesk/appointments?date=$APPT_DATE&doctorId=$DOCTOR_ID" "$PAT_COOKIE" "" \
  "403" ".error != null" "readonly" "$MOBILE_UA"

run_json_check "P19_32_doctor_frontdesk_appointments_forbidden" "Doctor blocked from frontdesk appointments API" "GET" "$BASE_URL/api/frontdesk/appointments?date=$APPT_DATE&doctorId=$DOCTOR_ID" "$DOC_COOKIE" "" \
  "403" ".error != null" "readonly" "$MOBILE_UA"

run_page_check "P19_33_unauth_patient_dashboard_redirect" "Unauthenticated patient dashboard redirects to login (mobile)" "$BASE_URL/patient/dashboard" "$NO_COOKIE" \
  "303,307,308" "/login" "" "$MOBILE_UA"

run_page_check "P19_34_doctor_patient_dashboard_redirect" "Doctor hitting patient dashboard redirects to doctor dashboard (mobile)" "$BASE_URL/patient/dashboard" "$DOC_COOKIE" \
  "303,307,308" "/doctor/dashboard" "" "$MOBILE_UA"

run_page_check "P19_35_frontdesk_patient_dashboard_redirect" "Frontdesk hitting patient dashboard redirects to frontdesk dashboard (mobile)" "$BASE_URL/patient/dashboard" "$FD_COOKIE" \
  "303,307,308" "/frontdesk/dashboard" "" "$MOBILE_UA"

# -----------------------------------------------------------------------------
# Phase 19 roadmap gaps (expected, currently unimplemented)
# -----------------------------------------------------------------------------
run_page_check "P19_36_gap_mobile_landing_page" "GAP: mobile app landing page currently missing" "$BASE_URL/mobile" "$NO_COOKIE" \
  "404" "" "" "$MOBILE_UA"

run_page_check "P19_37_gap_mobile_download_page" "GAP: mobile app download page currently missing" "$BASE_URL/mobile/download" "$NO_COOKIE" \
  "404" "" "" "$MOBILE_UA"

run_page_check "P19_38_gap_patient_mobile_shell_page" "GAP: patient native shell page currently missing" "$BASE_URL/patient/mobile" "$PAT_COOKIE" \
  "404" "" "" "$MOBILE_UA"

run_page_check "P19_39_gap_doctor_mobile_shell_page" "GAP: doctor native shell page currently missing" "$BASE_URL/doctor/mobile" "$DOC_COOKIE" \
  "404" "" "" "$MOBILE_UA"

run_page_check "P19_40_gap_frontdesk_mobile_shell_page" "GAP: frontdesk native shell page currently missing" "$BASE_URL/frontdesk/mobile" "$FD_COOKIE" \
  "404" "" "" "$MOBILE_UA"

run_json_check "P19_41_gap_mobile_app_versions_api" "GAP: mobile app versioning API currently missing" "GET" "$BASE_URL/api/mobile/apps/versions" "$PAT_COOKIE" "" \
  "404" "" "readonly" "$MOBILE_UA"

run_json_check "P19_42_gap_mobile_push_register_api" "GAP: mobile push registration API currently missing" "POST" "$BASE_URL/api/mobile/push/register" "$PAT_COOKIE" \
  "{\"token\":\"dummy-device-token\",\"platform\":\"ios\"}" \
  "404" "" "readonly" "$MOBILE_UA"

run_json_check "P19_43_gap_mobile_push_delivery_api" "GAP: mobile push delivery API currently missing" "POST" "$BASE_URL/api/mobile/push/delivery" "$PAT_COOKIE" \
  "{\"messageId\":\"dummy\",\"status\":\"delivered\"}" \
  "404" "" "readonly" "$MOBILE_UA"

run_json_check "P19_44_gap_mobile_offline_bootstrap_api" "GAP: mobile offline bootstrap API currently missing" "GET" "$BASE_URL/api/mobile/offline/bootstrap" "$PAT_COOKIE" "" \
  "404" "" "readonly" "$MOBILE_UA"

run_json_check "P19_45_gap_mobile_offline_sync_api" "GAP: mobile offline sync API currently missing" "POST" "$BASE_URL/api/mobile/offline/sync" "$PAT_COOKIE" \
  "{\"changes\":[]}" \
  "404" "" "readonly" "$MOBILE_UA"

run_json_check "P19_46_gap_mobile_biometric_challenge_api" "GAP: mobile biometric challenge API currently missing" "POST" "$BASE_URL/api/mobile/biometric/challenge" "$PAT_COOKIE" \
  "{\"deviceId\":\"dummy-device\"}" \
  "404" "" "readonly" "$MOBILE_UA"

run_json_check "P19_47_gap_mobile_biometric_verify_api" "GAP: mobile biometric verify API currently missing" "POST" "$BASE_URL/api/mobile/biometric/verify" "$PAT_COOKIE" \
  "{\"challengeId\":\"dummy\",\"signature\":\"dummy\"}" \
  "404" "" "readonly" "$MOBILE_UA"

run_json_check "P19_48_gap_mobile_camera_upload_api" "GAP: mobile camera upload API currently missing" "POST" "$BASE_URL/api/mobile/camera/upload" "$PAT_COOKIE" \
  "{\"image\":\"dummy-base64\"}" \
  "404" "" "readonly" "$MOBILE_UA"

run_json_check "P19_49_gap_mobile_performance_metrics_api" "GAP: mobile native performance metrics API currently missing" "POST" "$BASE_URL/api/mobile/performance/metrics" "$PAT_COOKIE" \
  "{\"metric\":\"startup_time\",\"value\":1300}" \
  "404" "" "readonly" "$MOBILE_UA"

run_page_check "P19_50_gap_manifest_webmanifest" "GAP: PWA manifest currently missing" "$BASE_URL/manifest.webmanifest" "$NO_COOKIE" \
  "404" "" "" "$MOBILE_UA"

run_page_check "P19_51_gap_service_worker" "GAP: service worker currently missing" "$BASE_URL/sw.js" "$NO_COOKIE" \
  "404" "" "" "$MOBILE_UA"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
{
  echo "Phase 19 Mobile Applications Smoke"
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
  --arg medication_id "$MEDICATION_ID" \
  '{artifacts:$artifacts, ids:{doctor:$doctor_id, patient:$patient_id, appointment:$appointment_id, medication:$medication_id}}' \
  > "$ARTIFACT_DIR/context.json"

echo "$ARTIFACT_DIR"
