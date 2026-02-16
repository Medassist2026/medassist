# 👤 MANUAL TESTING GUIDE - PHASE 7
**MedAssist Application | Browser UI/UX Tests**

---

## 🎯 OVERVIEW

**Your Role**: Execute 20 browser-based tests
**Estimated Time**: 30-45 minutes (or 5 minutes for Quick Smoke Test only)
**Tools Needed**:
- Browser (Chrome/Safari/Firefox)
- Access to Supabase dashboard
- Developer Tools (F12)

---

## 🚀 PREREQUISITES CHECKLIST

Before starting, ensure:

### 1. Database Setup ✅
```bash
# Open Supabase SQL Editor
# Paste and run: supabase/migrations/007_prescriptions_vitals_labs.sql
# Verify: No errors in execution log
```

### 2. Application Running ✅
```bash
cd ~/medassist
npm install
npm run dev
```
**Expected**: Server running on `http://localhost:3000`

### 3. Login as Doctor ✅
- Navigate to `http://localhost:3000`
- Login with doctor credentials
- Verify: Doctor dashboard loads

---

## ⚡ QUICK SMOKE TEST (5 MINUTES)
**Run this first! If these 5 pass, detailed tests can proceed.**

| # | Test | Steps | Expected | ✓/✗ |
|---|------|-------|----------|-----|
| 1 | Vital Signs appears | 1. New Session<br>2. Select patient | "2. Vital Signs" section visible | ⬜ |
| 2 | BMI auto-calculates | 1. Weight: `70`<br>2. Height: `170` | BMI shows `24.2` | ⬜ |
| 3 | Lab tests load | 1. Scroll to Lab Orders<br>2. Click "Order Lab Tests" | 20+ tests visible grouped by category | ⬜ |
| 4 | Multi-select works | 1. Check 3 tests | 3 purple badges appear | ⬜ |
| 5 | Session saves | 1. Fill all sections<br>2. Click Save | Success message, no errors | ⬜ |

**If ALL 5 pass**: ✅ Proceed to detailed tests
**If ANY fail**: ❌ Stop and report the failure

---

## 📝 DETAILED TEST SUITES

### PART 1: VITAL SIGNS UI TESTS (3 Tests)

#### VS-5: Underweight BMI Category 🔵
**Time**: 1 minute

**Steps**:
1. Open new clinical session
2. Select any patient
3. Scroll to "Vital Signs" section
4. Enter:
   - Weight: `50`
   - Height: `170`

**Expected Result**:
- BMI displays: `17.3` (or similar)
- Category: "Underweight"
- Color: Blue text (`text-blue-600`)

**Pass Criteria**: BMI < 18.5 shown in blue
**Result**: ⬜ PASS / ⬜ FAIL

---

#### VS-6: Overweight BMI Category 🟡
**Time**: 1 minute

**Steps**:
1. Same session as VS-5
2. Update:
   - Weight: `85`
   - Height: `170`

**Expected Result**:
- BMI displays: `29.4` (or similar)
- Category: "Overweight"
- Color: Yellow text (`text-yellow-600`)

**Pass Criteria**: 25 ≤ BMI < 30 shown in yellow
**Result**: ⬜ PASS / ⬜ FAIL

---

#### VS-7: Obese BMI Category 🔴
**Time**: 1 minute

**Steps**:
1. Same session as VS-6
2. Update:
   - Weight: `100`
   - Height: `170`

**Expected Result**:
- BMI displays: `34.6` (or similar)
- Category: "Obese"
- Color: Red text (`text-red-600`)

**Pass Criteria**: BMI ≥ 30 shown in red
**Result**: ⬜ PASS / ⬜ FAIL

---

### PART 2: LAB ORDERS UI TESTS (7 Tests)

#### LAB-4: Category Filter 🔬
**Time**: 1 minute

**Steps**:
1. Scroll to "6. Laboratory Tests" section
2. Click "Order Lab Tests" button
3. Open "Filter by Category" dropdown
4. Select "Hematology"

**Expected Result**:
- Only Hematology tests visible
- Should show ~5 tests:
  - WBC, RBC, Hemoglobin, Hematocrit, Platelet Count

**Pass Criteria**: Filter shows only selected category
**Result**: ⬜ PASS / ⬜ FAIL

---

#### LAB-5: Multi-Select Tests 🟣
**Time**: 1 minute

**Steps**:
1. In Lab Orders section
2. Check these 3 tests:
   - "White Blood Cell Count"
   - "Hemoglobin"
   - "Glucose (Fasting)"

**Expected Result**:
- 3 purple badges appear above test list
- Each badge shows test name
- Badge count shows "(3)"

**Pass Criteria**: All selected tests shown as purple badges
**Result**: ⬜ PASS / ⬜ FAIL

**Screenshot Location**: (optional)

---

#### LAB-6: Deselect Badge ❌
**Time**: 30 seconds

**Steps**:
1. Click the `×` button on "Hemoglobin" badge

**Expected Result**:
- Hemoglobin badge disappears
- Badge count updates to "(2)"
- Hemoglobin checkbox unchecks

**Pass Criteria**: Badge removal works
**Result**: ⬜ PASS / ⬜ FAIL

---

#### LAB-7: Routine Priority ⏰
**Time**: 30 seconds

**Steps**:
1. In Priority section
2. Click "Routine" button

**Expected Result**:
- Button highlighted (purple border/background)
- Shows: "24-48 hours"

**Pass Criteria**: Time estimate matches priority
**Result**: ⬜ PASS / ⬜ FAIL

---

#### LAB-8: Urgent Priority 🚨
**Time**: 30 seconds

**Steps**:
1. Click "Urgent" button

**Expected Result**:
- Button highlighted
- Shows: "4-6 hours"
- Summary card updates to "4-6 hours"

**Pass Criteria**: Time estimate is 4-6 hours
**Result**: ⬜ PASS / ⬜ FAIL

---

#### LAB-9: STAT Priority ⚡
**Time**: 30 seconds

**Steps**:
1. Click "STAT" button

**Expected Result**:
- Button highlighted
- Shows: "Immediate"
- Summary card updates to "Immediate"

**Pass Criteria**: Shows immediate processing
**Result**: ⬜ PASS / ⬜ FAIL

---

#### LAB-10: Clear All 🗑️
**Time**: 30 seconds

**Steps**:
1. With 2 tests selected (from LAB-6)
2. Click "Clear All" button

**Expected Result**:
- All purple badges disappear
- Badge count shows "(0)"
- All checkboxes unchecked
- Summary card disappears

**Pass Criteria**: Complete selection reset
**Result**: ⬜ PASS / ⬜ FAIL

---

### PART 3: PRESCRIPTION TESTS (6 Tests)

#### RX-1: Save Note with Medications 💊
**Time**: 3 minutes

**Steps**:
1. Complete a full clinical session:
   - Select patient
   - Add chief complaint
   - Fill diagnosis
   - Add 2 medications:
     - Med 1: "Amoxicillin 500mg, PO TID, 7 days"
     - Med 2: "Ibuprofen 400mg, PO PRN, 5 days"
2. Click "Save Clinical Note"

**Expected Result**:
- Success message appears
- Note saved to database
- No errors in console

**Pass Criteria**: Success message without errors
**Result**: ⬜ PASS / ⬜ FAIL

---

#### RX-2: Get Note ID from Response 🔍
**Time**: 1 minute

**Steps**:
1. Open Browser DevTools (F12)
2. Go to Network tab
3. Find the save request (look for `/api/clinical/notes`)
4. Click on it
5. Look at Response tab

**Expected Result**:
- Response contains `noteId` field
- Value is a UUID format (e.g., `a7b3c4d5-...`)

**Pass Criteria**: Note ID present in response
**Result**: ⬜ PASS / ⬜ FAIL

**Note ID (save for RX-3)**: `___________________________`

---

#### RX-3: Open Prescription Page 📄
**Time**: 1 minute

**Steps**:
1. Copy the Note ID from RX-2
2. Navigate to: `http://localhost:3000/doctor/prescription?noteId=<YOUR_NOTE_ID>`

**Expected Result**:
- Prescription page loads
- No error messages

**Pass Criteria**: Page loads successfully
**Result**: ⬜ PASS / ⬜ FAIL

---

#### RX-4: Doctor Header Info 👨‍⚕️
**Time**: 30 seconds

**Steps**:
1. On prescription page
2. Look at top section

**Expected Result**:
- Doctor's full name visible
- Doctor's specialty visible
- Doctor's license number visible (if set)

**Pass Criteria**: All doctor info displays
**Result**: ⬜ PASS / ⬜ FAIL

---

#### RX-5: Patient Info 👤
**Time**: 30 seconds

**Steps**:
1. Look below doctor header

**Expected Result**:
- Patient name visible
- Patient age visible
- Patient sex visible

**Pass Criteria**: All patient info displays
**Result**: ⬜ PASS / ⬜ FAIL

---

#### RX-6: Rx Symbol ℞
**Time**: 15 seconds

**Steps**:
1. Look at center of prescription

**Expected Result**:
- Large ℞ symbol visible
- Clearly distinguishable

**Pass Criteria**: Rx symbol present
**Result**: ⬜ PASS / ⬜ FAIL

---

#### RX-7: Medications List 💊
**Time**: 1 minute

**Steps**:
1. Look at main content area

**Expected Result**:
- Numbered list (1, 2)
- Each medication shows:
  - Medication name (Amoxicillin 500mg, Ibuprofen 400mg)
  - Sig (instructions): PO TID, PO PRN
  - Duration: 7 days, 5 days

**Pass Criteria**: All med details display correctly
**Result**: ⬜ PASS / ⬜ FAIL

---

### PART 4: INTEGRATION TESTS (4 Tests)

#### INT-1: Full Session Flow 🔄
**Time**: 5 minutes

**Steps**:
1. Start new session
2. Complete all 7 steps:
   - Patient Selection
   - Vital Signs (enter BP, HR, etc.)
   - Chief Complaint
   - Diagnosis
   - Medications (2 drugs)
   - Lab Orders (2 tests)
   - Treatment Plan
3. Click Save

**Expected Result**:
- All sections accept input
- No errors during flow
- Save succeeds
- Success message appears

**Pass Criteria**: Complete flow works end-to-end
**Result**: ⬜ PASS / ⬜ FAIL

---

#### INT-2: Session Steps Count 🔢
**Time**: 30 seconds

**Steps**:
1. On new session page
2. Count numbered sections

**Expected Result**:
- 7 numbered steps visible:
  1. Patient & Chief Complaint
  2. Vital Signs
  3. Clinical History
  4. Diagnosis
  5. Medications
  6. Laboratory Tests
  7. Treatment Plan

**Pass Criteria**: Exactly 7 steps present
**Result**: ⬜ PASS / ⬜ FAIL

---

#### RX-8: Print Button 🖨️
**Time**: 30 seconds

**Steps**:
1. On prescription page
2. Look for "Print Prescription" button
3. Click it

**Expected Result**:
- Browser print dialog opens
- Prescription formatted for printing
- Can preview in print view

**Pass Criteria**: Print dialog opens
**Result**: ⬜ PASS / ⬜ FAIL

---

#### INT-4: No Console Errors ✅
**Time**: 2 minutes

**Steps**:
1. Open DevTools Console (F12 → Console tab)
2. Refresh page
3. Navigate through:
   - Dashboard
   - New Session
   - Fill one complete session
   - Save
   - Open prescription

**Expected Result**:
- No RED error messages
- Yellow warnings acceptable
- Info messages acceptable

**Pass Criteria**: No red/critical errors
**Result**: ⬜ PASS / ⬜ FAIL

**Errors Found** (if any):
```
(paste console errors here)
```

---

## 📊 RESULTS SUMMARY

### Test Completion Tracker

**Vital Signs Tests**: ⬜⬜⬜ (0/3)
**Lab Orders Tests**: ⬜⬜⬜⬜⬜⬜⬜ (0/7)
**Prescription Tests**: ⬜⬜⬜⬜⬜⬜ (0/6)
**Integration Tests**: ⬜⬜⬜⬜ (0/4)

**Total**: 0/20 completed

---

## 🐛 BUG REPORT FORM

If any test fails, fill this out:

### Bug #1
**Test ID**: ___________
**Expected**: _________________________________
**Actual**: ___________________________________
**Steps to Reproduce**:
1.
2.
3.

**Screenshot**: (attach file or paste path)
**Console Errors**:
```
(paste any errors)
```

### Bug #2
(repeat as needed)

---

## ✅ FINAL VERDICT

After completing all tests:

**Quick Smoke Test**: ⬜ PASS / ⬜ FAIL
**Detailed Tests Passed**: ____ / 20
**Critical Failures**: ____
**Minor Issues**: ____

**Overall Status**:
- ⬜ ✅ PASS (All tests pass)
- ⬜ ⚠️ PARTIAL (Minor issues, core functionality works)
- ⬜ ❌ FAIL (Critical issues blocking usage)

**Recommendation**:
⬜ Ready for production
⬜ Needs minor fixes
⬜ Needs significant rework

---

## 📞 NEXT STEPS

1. ✅ Complete all 20 tests
2. 📸 Take screenshots of failures
3. 📝 Fill bug report forms
4. 🤖 Share results with Claude for analysis
5. 🔧 Fix identified issues (if any)

---

**Tester Name**: ___________________________
**Test Date**: ___________________________
**Browser**: ___________________________
**OS**: ___________________________

---

*Happy Testing! 🚀*
