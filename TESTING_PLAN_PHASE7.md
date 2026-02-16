# 📋 PHASE 7 ACCEPTANCE TESTING PLAN
**MedAssist Application - Comprehensive Test Validation Strategy**

---

## 🎯 TESTING STRATEGY OVERVIEW

This plan divides the 35 tests into **AUTOMATED** (Claude performs) and **MANUAL** (You perform) categories to optimize token usage while ensuring comprehensive coverage.

### Test Distribution
- **Automated Tests**: 15 tests (Code validation, static analysis, migration check)
- **Manual Tests**: 20 tests (Browser interaction, UI validation, integration flows)

---

## 🤖 PART A: AUTOMATED TESTS (Claude Performs)

### A1. DATABASE MIGRATION VALIDATION (4 tests)
**Status**: ✅ Can be validated by analyzing SQL file

| Test ID | Validation | Method |
|---------|------------|--------|
| DB-1 | Tables exist | Check CREATE TABLE statements |
| DB-2 | Lab tests seeded | Check INSERT statements count |
| DB-3 | Lab categories | Check DISTINCT categories in seed data |
| DB-4 | BMI function exists | Check CREATE FUNCTION statement |

### A2. CODE STRUCTURE VALIDATION (6 tests)
**Status**: ✅ Can be validated by analyzing component files

| Test ID | Component | Validation |
|---------|-----------|------------|
| VS-1 | VitalSignsInput.tsx | Component exports and structure |
| VS-2 | VitalSignsInput.tsx | All input fields present (BP, HR, Temp, RR, SpO2, Weight, Height, Notes) |
| VS-8 | VitalSignsInput.tsx | Reference card with normal ranges exists |
| LAB-1 | LabOrderSelector.tsx | Component exports and structure |
| LAB-2 | LabOrderSelector.tsx | Expand/collapse functionality exists |
| LAB-3 | LabOrderSelector.tsx | API call to /api/clinical/lab-tests |

### A3. API ENDPOINT VALIDATION (3 tests)
**Status**: ✅ Can be validated by checking file existence

| Test ID | Endpoint | File Path |
|---------|----------|-----------|
| INT-3 | Lab tests API | /app/api/clinical/lab-tests/route.ts |
| RX-3 | Prescription page | /app/(doctor)/doctor/prescription/page.tsx |
| - | Clinical API | Check related API routes |

### A4. BUSINESS LOGIC VALIDATION (2 tests)
**Status**: ✅ Can be validated by code inspection

| Test ID | Logic | Component/Function |
|---------|-------|-------------------|
| VS-3 | BMI calculation formula | VitalSignsInput calculateBMI function |
| VS-4 | BMI category logic | VitalSignsInput getBMICategory function |

---

## 👤 PART B: MANUAL TESTS (You Perform)

### B1. VITAL SIGNS UI TESTS (3 tests)
**Prerequisites**:
- App running on `http://localhost:3000`
- Logged in as doctor
- New clinical session started with patient selected

| Test ID | Steps | Expected Result |
|---------|-------|----------------|
| VS-5 | 1. Enter Weight: `50`<br>2. Enter Height: `170` | BMI shows ~17.3, "Underweight" in blue |
| VS-6 | 1. Enter Weight: `85`<br>2. Enter Height: `170` | BMI shows ~29.4, "Overweight" in yellow |
| VS-7 | 1. Enter Weight: `100`<br>2. Enter Height: `170` | BMI shows ~34.6, "Obese" in red |

### B2. LAB ORDERS UI TESTS (7 tests)

| Test ID | Steps | Expected Result |
|---------|-------|----------------|
| LAB-4 | Select "Hematology" from category dropdown | Only 5 hematology tests visible |
| LAB-5 | Check 3 different tests | All 3 show as purple badges |
| LAB-6 | Click × on a badge | Test removed from selection |
| LAB-7 | Click "Routine" button | Shows "24-48 hours" |
| LAB-8 | Click "Urgent" button | Shows "4-6 hours" |
| LAB-9 | Click "STAT" button | Shows "Immediate" |
| LAB-10 | Click "Clear All" | All selections removed |

### B3. PRESCRIPTION TESTS (6 tests)

| Test ID | Steps | Expected Result |
|---------|-------|----------------|
| RX-1 | Complete session with 2 meds → Save | Success message, note saved |
| RX-2 | DevTools → Network → check response | Note ID (UUID) in response |
| RX-4 | Open prescription → Check header | Doctor name, specialty, license |
| RX-5 | Check patient info section | Patient name, age, sex |
| RX-6 | Check middle of page | Large ℞ symbol visible |
| RX-7 | Check medications list | Numbered list with med names, sig, duration |

### B4. INTEGRATION TESTS (4 tests)

| Test ID | Steps | Expected Result |
|---------|-------|----------------|
| INT-1 | Complete full session flow | All sections work, saves successfully |
| INT-2 | Count numbered sections | 7 steps total (1-7) |
| RX-8 | Click "Print Prescription" | Browser print dialog opens |
| INT-4 | Open DevTools → Console | No red errors |

---

## 📝 EXECUTION PLAN

### Phase 1: Claude Automated Tests (15 mins)
1. ✅ Validate migration SQL structure
2. ✅ Validate VitalSignsInput component code
3. ✅ Validate LabOrderSelector component code
4. ✅ Check API endpoints exist
5. ✅ Verify BMI calculation logic
6. ✅ Generate automated test report

### Phase 2: Your Manual Tests (30-45 mins)
1. 🔧 Start dev server: `npm run dev`
2. 🗄️ Run migration 007 in Supabase (if not done)
3. 🧪 Execute Quick Smoke Test (5 tests - 5 mins)
4. 🧪 Execute detailed manual tests (20 tests - 25-40 mins)
5. 📊 Report any failures

---

## 🎯 QUICK SMOKE TEST (Priority)
**Time**: 5 minutes | **Tests**: 5 critical path tests

| # | Test | Pass? |
|---|------|-------|
| 1 | Vital Signs section appears after selecting patient | ⬜ |
| 2 | BMI auto-calculates (70kg, 170cm = 24.2) | ⬜ |
| 3 | Lab Orders expand and show 20 tests | ⬜ |
| 4 | Can select multiple tests and see badges | ⬜ |
| 5 | Full session saves without errors | ⬜ |

---

## ✅ PASS CRITERIA

| Level | Requirement | Status |
|-------|-------------|--------|
| ✅ PASS | All automated tests + Quick Smoke Test passes | - |
| ⚠️ PARTIAL | Quick Smoke passes but some detailed tests fail | - |
| ❌ FAIL | Quick Smoke Test fails | - |

---

## 📊 TEST TRACKING

### Automated Tests (Claude)
- [ ] DB-1: Tables exist
- [ ] DB-2: Lab tests seeded (20 tests)
- [ ] DB-3: Lab categories (5 categories)
- [ ] DB-4: BMI function exists
- [ ] VS-1: Vital Signs component structure
- [ ] VS-2: All vital fields present
- [ ] VS-3: BMI calculation formula
- [ ] VS-4: BMI category logic
- [ ] VS-8: Reference card exists
- [ ] LAB-1: Lab selector component structure
- [ ] LAB-2: Expand functionality
- [ ] LAB-3: API endpoint exists
- [ ] INT-3: API routes exist
- [ ] RX-3: Prescription page exists

### Manual Tests (You)
- [ ] VS-5: Underweight BMI (blue)
- [ ] VS-6: Overweight BMI (yellow)
- [ ] VS-7: Obese BMI (red)
- [ ] LAB-4: Category filter (Hematology)
- [ ] LAB-5: Multi-select (3 tests)
- [ ] LAB-6: Deselect badge
- [ ] LAB-7: Routine priority
- [ ] LAB-8: Urgent priority
- [ ] LAB-9: STAT priority
- [ ] LAB-10: Clear all
- [ ] RX-1: Save note with meds
- [ ] RX-2: Get note ID from response
- [ ] RX-4: Doctor header
- [ ] RX-5: Patient info
- [ ] RX-6: Rx symbol
- [ ] RX-7: Medications list
- [ ] RX-8: Print button
- [ ] INT-1: Full session flow
- [ ] INT-2: Session steps count
- [ ] INT-4: No console errors

---

## 🐛 BUG REPORTING TEMPLATE

If a test fails, use this format:

```
Test ID: VS-3
Expected: BMI shows 24.2
Actual: BMI shows 24.22
Browser: Chrome 120
Screenshot: [attach if possible]
Console Errors: [any errors from DevTools]
```

---

**Next Step**: Claude will now execute automated tests and generate a detailed report.
