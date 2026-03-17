/**
 * Drug Interaction Checker Tests
 * Tests the interaction engine against known drug pairs
 */

import {
  checkDrugInteractions,
  checkAllInteractions,
  checkPairInteraction,
  getSeverityDisplay,
  INTERACTIONS,
  DRUG_CLASSES,
} from '../drug-interactions'

// ============================================================================
// TEST: Database Integrity
// ============================================================================

console.log('\n=== Drug Interaction Database Integrity ===\n')

// Count interactions by severity
const bySeverity = INTERACTIONS.reduce((acc, i) => {
  acc[i.severity] = (acc[i.severity] || 0) + 1
  return acc
}, {} as Record<string, number>)

console.log(`Total interactions: ${INTERACTIONS.length}`)
console.log(`  Contraindicated: ${bySeverity['contraindicated'] || 0}`)
console.log(`  Major: ${bySeverity['major'] || 0}`)
console.log(`  Moderate: ${bySeverity['moderate'] || 0}`)
console.log(`  Minor: ${bySeverity['minor'] || 0}`)

// Count drug classes
const classCount = Object.keys(DRUG_CLASSES).length
const totalDrugsInClasses = Object.values(DRUG_CLASSES).reduce((sum, members) => sum + members.length, 0)
console.log(`\nDrug classes: ${classCount}`)
console.log(`Total drugs in classes: ${totalDrugsInClasses}`)

// ============================================================================
// TEST: Known Interactions
// ============================================================================

console.log('\n=== Known Interaction Tests ===\n')

let passed = 0
let failed = 0

function test(name: string, fn: () => boolean) {
  try {
    if (fn()) {
      console.log(`  ✅ ${name}`)
      passed++
    } else {
      console.log(`  ❌ ${name}`)
      failed++
    }
  } catch (e: any) {
    console.log(`  ❌ ${name} — Error: ${e.message}`)
    failed++
  }
}

// Test: Warfarin + NSAIDs (contraindicated)
test('Warfarin + Ibuprofen = contraindicated', () => {
  const result = checkPairInteraction('Warfarin', 'Ibuprofen')
  return result !== null && result.severity === 'contraindicated'
})

test('Warfarin + Diclofenac Potassium = contraindicated', () => {
  const result = checkPairInteraction('Warfarin', 'Diclofenac Potassium')
  return result !== null && result.severity === 'contraindicated'
})

// Test: NSAIDs + ACE inhibitors (major)
test('Ibuprofen + Ramipril = major', () => {
  const result = checkPairInteraction('Ibuprofen', 'Ramipril')
  return result !== null && result.severity === 'major'
})

test('Celecoxib + Lisinopril = major', () => {
  const result = checkPairInteraction('Celecoxib', 'Lisinopril')
  return result !== null && result.severity === 'major'
})

// Test: ACEi + ARB (contraindicated)
test('Ramipril + Candesartan = contraindicated', () => {
  const result = checkPairInteraction('Ramipril', 'Candesartan')
  return result !== null && result.severity === 'contraindicated'
})

// Test: Duplicate NSAIDs (contraindicated)
test('Ibuprofen + Diclofenac = contraindicated (duplicate)', () => {
  const result = checkPairInteraction('Ibuprofen', 'Diclofenac Sodium')
  return result !== null && result.severity === 'contraindicated'
})

// Test: Clopidogrel + Omeprazole (major)
test('Clopidogrel + Omeprazole = major', () => {
  const result = checkPairInteraction('Clopidogrel', 'Omeprazole')
  return result !== null && result.severity === 'major'
})

// Test: Clopidogrel + Pantoprazole = NO interaction (pantoprazole is safe)
test('Clopidogrel + Pantoprazole = no interaction', () => {
  const result = checkPairInteraction('Clopidogrel', 'Pantoprazole')
  return result === null
})

// Test: SSRIs + NSAIDs (major)
test('Escitalopram + Ibuprofen = major', () => {
  const result = checkPairInteraction('Escitalopram', 'Ibuprofen')
  return result !== null && result.severity === 'major'
})

// Test: Insulin + Sulfonylurea (major)
test('Insulin Glargine + Glimepiride = major', () => {
  const result = checkPairInteraction('Insulin Glargine', 'Glimepiride')
  return result !== null && result.severity === 'major'
})

// Test: Beta-blocker + Insulin (moderate — masks hypo)
test('Bisoprolol + Insulin Aspart = moderate', () => {
  const result = checkPairInteraction('Bisoprolol', 'Insulin Aspart')
  return result !== null && result.severity === 'moderate'
})

// Test: Ciprofloxacin + Calcium (moderate)
test('Ciprofloxacin + Calcium/Vitamin D3 = moderate', () => {
  const result = checkPairInteraction('Ciprofloxacin', 'Calcium/Vitamin D3')
  return result !== null && result.severity === 'moderate'
})

// Test: Clarithromycin + Atorvastatin (major)
test('Clarithromycin + Atorvastatin = major', () => {
  const result = checkPairInteraction('Clarithromycin', 'Atorvastatin')
  return result !== null && result.severity === 'major'
})

// Test: Metronidazole + Warfarin (major)
test('Metronidazole + Warfarin = major', () => {
  const result = checkPairInteraction('Metronidazole', 'Warfarin')
  return result !== null && result.severity === 'major'
})

// Test: Prednisolone + NSAID (major)
test('Prednisolone + Ibuprofen = major', () => {
  const result = checkPairInteraction('Prednisolone', 'Ibuprofen')
  return result !== null && result.severity === 'major'
})

// Test: Corticosteroid + Metformin (moderate)
test('Prednisolone + Metformin = moderate', () => {
  const result = checkPairInteraction('Prednisolone', 'Metformin')
  return result !== null && result.severity === 'moderate'
})

// Test: No interaction (safe combo)
test('Paracetamol + Amoxicillin = no interaction', () => {
  const result = checkPairInteraction('Paracetamol', 'Amoxicillin')
  return result === null
})

test('Omeprazole + Amoxicillin = no interaction', () => {
  const result = checkPairInteraction('Omeprazole', 'Amoxicillin')
  return result === null
})

// Test: Same drug = no interaction (self check)
test('Ibuprofen + Ibuprofen = no interaction (self)', () => {
  const result = checkPairInteraction('Ibuprofen', 'Ibuprofen')
  return result === null
})

// ============================================================================
// TEST: checkDrugInteractions (real-world scenario)
// ============================================================================

console.log('\n=== Prescription Scenario Tests ===\n')

// Scenario 1: Patient on Warfarin, doctor adds Ibuprofen
test('Scenario: Warfarin patient + Ibuprofen → warns contraindicated', () => {
  const results = checkDrugInteractions(
    'Ibuprofen',
    'Cataflam 50mg',
    [{ name: 'Marevan 5mg', genericName: 'Warfarin' }]
  )
  return results.length > 0 && results[0].interaction.severity === 'contraindicated'
})

// Scenario 2: Patient on Ramipril + Furosemide, doctor adds Diclofenac → triple whammy
test('Scenario: Ramipril+Furosemide patient + Diclofenac → warns major (multiple)', () => {
  const results = checkDrugInteractions(
    'Diclofenac Potassium',
    'Cataflam 50mg',
    [
      { name: 'Tritace 5mg', genericName: 'Ramipril' },
      { name: 'Lasix 40mg', genericName: 'Furosemide' },
    ]
  )
  return results.length >= 2 // Should find interaction with both
})

// Scenario 3: Patient on Escitalopram, doctor adds Aspirin + Omeprazole
test('Scenario: Escitalopram patient + Aspirin → warns (bleeding)', () => {
  const results = checkDrugInteractions(
    'Acetylsalicylic Acid',
    'Aspirin 75mg',
    [{ name: 'Cipralex 10mg', genericName: 'Escitalopram' }]
  )
  return results.length > 0 && results[0].interaction.severity === 'major'
})

// Scenario 4: Safe prescription — Augmentin + Panadol
test('Scenario: No existing meds + Augmentin → no warnings', () => {
  const results = checkDrugInteractions(
    'Amoxicillin/Clavulanate',
    'Augmentin 1g',
    []
  )
  return results.length === 0
})

// ============================================================================
// TEST: checkAllInteractions (full prescription review)
// ============================================================================

console.log('\n=== Full Prescription Review Tests ===\n')

test('Full review: Warfarin + Aspirin + Omeprazole → finds interactions', () => {
  const results = checkAllInteractions([
    { name: 'Marevan', genericName: 'Warfarin' },
    { name: 'Aspirin', genericName: 'Acetylsalicylic Acid' },
    { name: 'Omeprazole', genericName: 'Omeprazole' },
  ])
  return results.length >= 1 // Warfarin+Aspirin at minimum
})

test('Full review: Safe prescription → no interactions', () => {
  const results = checkAllInteractions([
    { name: 'Augmentin 1g', genericName: 'Amoxicillin/Clavulanate' },
    { name: 'Panadol', genericName: 'Paracetamol' },
    { name: 'Nexium', genericName: 'Esomeprazole' },
  ])
  return results.length === 0
})

test('Full review: sorted by severity (most dangerous first)', () => {
  const results = checkAllInteractions([
    { name: 'Marevan', genericName: 'Warfarin' },
    { name: 'Brufen', genericName: 'Ibuprofen' },
    { name: 'Panadol', genericName: 'Paracetamol' },
  ])
  if (results.length < 2) return false
  const severityOrder = { contraindicated: 0, major: 1, moderate: 2, minor: 3 }
  for (let i = 1; i < results.length; i++) {
    if (severityOrder[results[i].interaction.severity] < severityOrder[results[i - 1].interaction.severity]) {
      return false // Not sorted
    }
  }
  return true
})

// ============================================================================
// TEST: getSeverityDisplay
// ============================================================================

console.log('\n=== Severity Display Tests ===\n')

test('getSeverityDisplay returns correct config for all severities', () => {
  const levels = ['contraindicated', 'major', 'moderate', 'minor'] as const
  return levels.every(level => {
    const display = getSeverityDisplay(level)
    return display.label && display.icon && display.bg && display.color
  })
})

// ============================================================================
// SUMMARY
// ============================================================================

console.log(`\n${'═'.repeat(50)}`)
console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`)
console.log(`${'═'.repeat(50)}\n`)

if (failed > 0) {
  process.exit(1)
}
