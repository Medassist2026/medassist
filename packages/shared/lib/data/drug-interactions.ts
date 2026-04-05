/**
 * Drug Interaction Database for MedAssist
 * Comprehensive interaction data for drugs commonly prescribed in Egyptian private clinics
 *
 * Interaction severity levels:
 * - CONTRAINDICATED: Must not be combined. Doctor must choose one or the other.
 * - MAJOR: Potentially life-threatening. Requires intervention or close monitoring.
 * - MODERATE: May worsen patient condition. Consider alternatives or adjust dose.
 * - MINOR: Minimal clinical significance. Monitor patient.
 *
 * Version: 1.0
 * Last Updated: 2026-02-22
 *
 * NOTE: This is a clinical decision support tool, NOT a substitute for clinical judgment.
 * All interactions should be verified against current pharmacological references.
 */

// ============================================================================
// TYPES
// ============================================================================

export type InteractionSeverity = 'contraindicated' | 'major' | 'moderate' | 'minor'

export interface DrugInteraction {
  /** Generic name of drug A (lowercase) */
  drugA: string
  /** Generic name of drug B (lowercase) */
  drugB: string
  /** Severity level */
  severity: InteractionSeverity
  /** Clinical effect description */
  effect: string
  /** Recommended action for the doctor */
  recommendation: string
  /** Mechanism of interaction (pharmacological basis) */
  mechanism?: string
  /** Whether monitoring can mitigate the risk */
  monitorable?: boolean
}

export interface InteractionCheckResult {
  /** The newly added drug name (brand) */
  newDrug: string
  /** The existing drug name (brand) that it interacts with */
  existingDrug: string
  /** Generic name of the new drug */
  newDrugGeneric: string
  /** Generic name of the existing drug */
  existingDrugGeneric: string
  /** The interaction details */
  interaction: DrugInteraction
}

// ============================================================================
// DRUG CLASS MAPPINGS
// For class-level interactions (e.g. all NSAIDs interact with Warfarin)
// ============================================================================

const DRUG_CLASSES: Record<string, string[]> = {
  'nsaid': [
    'ibuprofen', 'diclofenac potassium', 'diclofenac sodium', 'ketoprofen',
    'celecoxib', 'naproxen', 'etoricoxib', 'lornoxicam', 'mefenamic acid',
    'meloxicam', 'piroxicam'
  ],
  'ace-inhibitor': [
    'ramipril', 'lisinopril', 'perindopril', 'captopril'
  ],
  'arb': [
    'candesartan', 'valsartan'
  ],
  'statin': [
    'atorvastatin', 'rosuvastatin'
  ],
  'beta-blocker': [
    'bisoprolol', 'atenolol', 'carvedilol'
  ],
  'fluoroquinolone': [
    'levofloxacin', 'ciprofloxacin', 'moxifloxacin'
  ],
  'macrolide': [
    'azithromycin', 'clarithromycin'
  ],
  'ppi': [
    'esomeprazole', 'pantoprazole', 'omeprazole', 'rabeprazole'
  ],
  'ssri': [
    'escitalopram', 'fluoxetine'
  ],
  'anticoagulant': [
    'warfarin'
  ],
  'antiplatelet': [
    'acetylsalicylic acid', 'clopidogrel'
  ],
  'corticosteroid': [
    'prednisolone', 'dexamethasone', 'betamethasone'
  ],
  'sulfonylurea': [
    'glimepiride', 'gliclazide'
  ],
  'diuretic': [
    'furosemide', 'spironolactone'
  ],
  'calcium-channel-blocker': [
    'amlodipine'
  ],
  'tetracycline': [
    'doxycycline'
  ],
  'antiepileptic': [
    'carbamazepine', 'valproic acid', 'lamotrigine', 'pregabalin'
  ],
  'benzodiazepine': [
    'alprazolam'
  ],
  'sglt2-inhibitor': [
    'empagliflozin'
  ],
  'insulin': [
    'insulin glargine', 'insulin aspart', 'insulin human (mixed)'
  ],
  'azole-antifungal': [
    'fluconazole', 'itraconazole'
  ],
}

/**
 * Get all drug classes a generic name belongs to
 */
function getDrugClasses(genericName: string): string[] {
  const normalized = genericName.toLowerCase()
  const classes: string[] = []
  for (const [className, members] of Object.entries(DRUG_CLASSES)) {
    if (members.includes(normalized)) {
      classes.push(className)
    }
  }
  return classes
}

// ============================================================================
// INTERACTION DATABASE
// Organized by clinical significance (most dangerous first)
// ============================================================================

const INTERACTIONS: DrugInteraction[] = [

  // ──────────────────────────────────────────────
  // CONTRAINDICATED COMBINATIONS
  // ──────────────────────────────────────────────

  {
    drugA: 'methotrexate',
    drugB: 'nsaid',
    severity: 'contraindicated',
    effect: 'NSAIDs reduce methotrexate clearance, causing severe bone marrow suppression and organ toxicity',
    recommendation: 'Do NOT combine. Use paracetamol for pain relief instead.',
    mechanism: 'Reduced renal clearance of methotrexate'
  },
  {
    drugA: 'warfarin',
    drugB: 'nsaid',
    severity: 'contraindicated',
    effect: 'Greatly increased risk of life-threatening GI bleeding and hemorrhage',
    recommendation: 'Avoid combination. If pain relief needed, use paracetamol. If NSAID essential, use lowest dose with PPI cover and monitor INR closely.',
    mechanism: 'NSAIDs inhibit platelet function + displace warfarin from protein binding',
    monitorable: true
  },
  {
    drugA: 'warfarin',
    drugB: 'acetylsalicylic acid',
    severity: 'contraindicated',
    effect: 'Greatly increased bleeding risk from dual anticoagulant/antiplatelet effect',
    recommendation: 'Avoid unless cardiologist has specifically indicated dual therapy. Monitor INR very closely.',
    mechanism: 'Additive anticoagulant and antiplatelet effects',
    monitorable: true
  },
  {
    drugA: 'clarithromycin',
    drugB: 'carbamazepine',
    severity: 'contraindicated',
    effect: 'Carbamazepine levels increase dramatically, causing toxicity (dizziness, ataxia, nystagmus)',
    recommendation: 'Use azithromycin instead of clarithromycin. If unavoidable, reduce carbamazepine dose and monitor levels.',
    mechanism: 'Clarithromycin inhibits CYP3A4, blocking carbamazepine metabolism'
  },
  {
    drugA: 'fluconazole',
    drugB: 'warfarin',
    severity: 'contraindicated',
    effect: 'Warfarin levels increase 2-3x, causing dangerous bleeding',
    recommendation: 'Avoid combination. If essential, reduce warfarin dose by 50% and monitor INR every 2-3 days.',
    mechanism: 'Fluconazole inhibits CYP2C9 (warfarin metabolism)',
    monitorable: true
  },
  {
    drugA: 'itraconazole',
    drugB: 'atorvastatin',
    severity: 'contraindicated',
    effect: 'Statin levels increase dramatically, risk of rhabdomyolysis (muscle breakdown)',
    recommendation: 'Stop statin during antifungal treatment. Resume 7 days after completing itraconazole.',
    mechanism: 'Itraconazole inhibits CYP3A4 (statin metabolism)'
  },
  {
    drugA: 'itraconazole',
    drugB: 'rosuvastatin',
    severity: 'major',
    effect: 'Increased statin levels, risk of myopathy',
    recommendation: 'Reduce rosuvastatin dose or temporarily discontinue during antifungal therapy.',
    mechanism: 'CYP3A4 inhibition affecting statin clearance'
  },
  {
    drugA: 'fluconazole',
    drugB: 'atorvastatin',
    severity: 'major',
    effect: 'Increased statin levels, risk of myopathy and rhabdomyolysis',
    recommendation: 'Reduce statin dose during fluconazole course. Monitor for muscle pain.',
    mechanism: 'Fluconazole inhibits CYP3A4'
  },

  // ──────────────────────────────────────────────
  // MAJOR INTERACTIONS
  // ──────────────────────────────────────────────

  // NSAIDs + ACE inhibitors/ARBs
  {
    drugA: 'nsaid',
    drugB: 'ace-inhibitor',
    severity: 'major',
    effect: 'NSAIDs reduce the blood pressure lowering effect of ACE inhibitors and increase risk of acute kidney injury',
    recommendation: 'Avoid if possible. If needed short-term, monitor kidney function and blood pressure. Never combine with diuretic (triple whammy).',
    mechanism: 'NSAIDs block prostaglandin-mediated renal blood flow that ACE inhibitors depend on',
    monitorable: true
  },
  {
    drugA: 'nsaid',
    drugB: 'arb',
    severity: 'major',
    effect: 'NSAIDs reduce blood pressure lowering effect of ARBs and increase risk of acute kidney injury',
    recommendation: 'Avoid if possible. If needed short-term, monitor kidney function and blood pressure.',
    mechanism: 'NSAIDs block prostaglandin-mediated renal blood flow',
    monitorable: true
  },

  // Triple Whammy: NSAID + ACEi/ARB + Diuretic
  {
    drugA: 'nsaid',
    drugB: 'furosemide',
    severity: 'major',
    effect: 'NSAIDs reduce diuretic effect and combined with ACEi/ARB cause "Triple Whammy" — high risk of acute kidney injury',
    recommendation: 'Avoid this combination, especially in elderly or dehydrated patients. Use paracetamol for pain.',
    mechanism: 'NSAIDs block renal prostaglandins needed for diuretic action',
    monitorable: true
  },
  {
    drugA: 'nsaid',
    drugB: 'spironolactone',
    severity: 'major',
    effect: 'NSAIDs reduce diuretic effect. Risk of hyperkalemia and renal impairment.',
    recommendation: 'Avoid combination. Monitor potassium and renal function if unavoidable.',
    mechanism: 'NSAIDs reduce renal blood flow; spironolactone retains potassium',
    monitorable: true
  },

  // ACEi + Spironolactone (hyperkalemia)
  {
    drugA: 'ace-inhibitor',
    drugB: 'spironolactone',
    severity: 'major',
    effect: 'High risk of dangerous hyperkalemia (elevated potassium), potentially fatal cardiac arrhythmias',
    recommendation: 'If used together (as in heart failure), start spironolactone at low dose (25mg). Check potassium within 1 week, then monthly.',
    mechanism: 'Both drugs increase serum potassium through different mechanisms',
    monitorable: true
  },
  {
    drugA: 'arb',
    drugB: 'spironolactone',
    severity: 'major',
    effect: 'High risk of hyperkalemia',
    recommendation: 'Monitor potassium closely within 1 week of starting. Use lowest effective doses.',
    mechanism: 'Both drugs increase serum potassium',
    monitorable: true
  },

  // Fluoroquinolones + NSAIDs (seizure risk)
  {
    drugA: 'fluoroquinolone',
    drugB: 'nsaid',
    severity: 'major',
    effect: 'Increased risk of CNS stimulation and seizures',
    recommendation: 'Avoid combination if patient has seizure history. Use paracetamol for pain during fluoroquinolone course.',
    mechanism: 'Both lower seizure threshold through GABA receptor inhibition'
  },

  // SSRIs + NSAIDs (bleeding risk)
  {
    drugA: 'ssri',
    drugB: 'nsaid',
    severity: 'major',
    effect: 'Significantly increased risk of GI bleeding (8x higher than either alone)',
    recommendation: 'Add PPI cover (omeprazole/esomeprazole) if combination is necessary. Use paracetamol when possible.',
    mechanism: 'SSRIs deplete platelet serotonin + NSAIDs inhibit COX-1 protective prostaglandins',
    monitorable: true
  },

  // SSRIs + Anticoagulants
  {
    drugA: 'ssri',
    drugB: 'warfarin',
    severity: 'major',
    effect: 'Increased bleeding risk. SSRIs also increase INR.',
    recommendation: 'Monitor INR more frequently when starting/stopping SSRI. Add PPI cover.',
    mechanism: 'SSRIs affect platelet function and may inhibit warfarin metabolism',
    monitorable: true
  },
  {
    drugA: 'ssri',
    drugB: 'antiplatelet',
    severity: 'major',
    effect: 'Increased risk of bleeding',
    recommendation: 'Add PPI cover. Monitor for signs of bleeding.',
    mechanism: 'SSRIs deplete platelet serotonin, additive with antiplatelet effect',
    monitorable: true
  },

  // Dual Antiplatelet
  {
    drugA: 'acetylsalicylic acid',
    drugB: 'clopidogrel',
    severity: 'moderate',
    effect: 'Increased bleeding risk with dual antiplatelet therapy',
    recommendation: 'This is often intentional post-ACS/PCI. Ensure PPI cover (not omeprazole with clopidogrel). Monitor for bleeding.',
    mechanism: 'Additive antiplatelet effects through different pathways',
    monitorable: true
  },

  // Clopidogrel + Omeprazole (reduced efficacy)
  {
    drugA: 'clopidogrel',
    drugB: 'omeprazole',
    severity: 'major',
    effect: 'Omeprazole reduces clopidogrel activation by 40-50%, increasing risk of cardiovascular events',
    recommendation: 'Use pantoprazole or esomeprazole instead of omeprazole with clopidogrel.',
    mechanism: 'Omeprazole inhibits CYP2C19 which converts clopidogrel to its active metabolite'
  },

  // Metformin + Contrast / Renal drugs
  {
    drugA: 'metformin',
    drugB: 'furosemide',
    severity: 'moderate',
    effect: 'Furosemide may increase metformin levels. Risk of lactic acidosis in renal impairment.',
    recommendation: 'Monitor renal function. Adjust metformin dose if GFR drops.',
    mechanism: 'Furosemide increases metformin plasma levels by 22%',
    monitorable: true
  },

  // Insulin + Sulfonylureas (hypoglycemia)
  {
    drugA: 'insulin',
    drugB: 'sulfonylurea',
    severity: 'major',
    effect: 'High risk of severe hypoglycemia from dual glucose-lowering effect',
    recommendation: 'Reduce sulfonylurea dose by 50% when adding insulin. Ensure patient has glucometer and knows hypoglycemia signs.',
    mechanism: 'Additive insulin secretion and exogenous insulin',
    monitorable: true
  },

  // Beta-blockers + Insulin (mask hypoglycemia)
  {
    drugA: 'beta-blocker',
    drugB: 'insulin',
    severity: 'moderate',
    effect: 'Beta-blockers mask warning signs of hypoglycemia (tremor, tachycardia). May prolong recovery.',
    recommendation: 'Educate patient that sweating will be the main hypoglycemia symptom. Consider cardioselective beta-blocker (bisoprolol).',
    mechanism: 'Beta-blockers block adrenergic response to hypoglycemia',
    monitorable: true
  },
  {
    drugA: 'beta-blocker',
    drugB: 'sulfonylurea',
    severity: 'moderate',
    effect: 'Beta-blockers may mask hypoglycemia symptoms and prolong recovery',
    recommendation: 'Use cardioselective beta-blocker (bisoprolol). Educate patient about atypical hypoglycemia signs.',
    mechanism: 'Beta-blockade masks adrenergic symptoms of hypoglycemia',
    monitorable: true
  },

  // Carbamazepine interactions
  {
    drugA: 'carbamazepine',
    drugB: 'valproic acid',
    severity: 'major',
    effect: 'Carbamazepine reduces valproic acid levels. Valproic acid increases carbamazepine-epoxide (toxic metabolite).',
    recommendation: 'Monitor levels of both drugs. Adjust doses based on levels and clinical response.',
    mechanism: 'Carbamazepine induces valproate metabolism; valproate inhibits epoxide hydrolase',
    monitorable: true
  },
  {
    drugA: 'carbamazepine',
    drugB: 'lamotrigine',
    severity: 'moderate',
    effect: 'Carbamazepine reduces lamotrigine levels by 40-50%',
    recommendation: 'Higher lamotrigine doses needed. Titrate based on clinical response.',
    mechanism: 'Carbamazepine induces UGT enzymes (lamotrigine metabolism)',
    monitorable: true
  },

  // Valproic acid + Lamotrigine
  {
    drugA: 'valproic acid',
    drugB: 'lamotrigine',
    severity: 'major',
    effect: 'Valproic acid doubles lamotrigine levels. Increased risk of serious skin rash (Stevens-Johnson Syndrome)',
    recommendation: 'Halve the lamotrigine dose. Titrate very slowly (25mg every 2 weeks). Stop immediately if rash appears.',
    mechanism: 'Valproic acid inhibits lamotrigine glucuronidation',
    monitorable: true
  },

  // Ciprofloxacin + Calcium/Antacids
  {
    drugA: 'ciprofloxacin',
    drugB: 'calcium/vitamin d3',
    severity: 'moderate',
    effect: 'Calcium chelates ciprofloxacin in the gut, reducing absorption by up to 50%',
    recommendation: 'Take ciprofloxacin 2 hours before or 6 hours after calcium supplements.',
    mechanism: 'Divalent cation chelation in GI tract'
  },
  {
    drugA: 'levofloxacin',
    drugB: 'calcium/vitamin d3',
    severity: 'moderate',
    effect: 'Calcium reduces fluoroquinolone absorption',
    recommendation: 'Separate doses by at least 2 hours.',
    mechanism: 'Divalent cation chelation'
  },
  {
    drugA: 'ciprofloxacin',
    drugB: 'aluminium/magnesium hydroxide/simethicone',
    severity: 'moderate',
    effect: 'Antacids dramatically reduce ciprofloxacin absorption',
    recommendation: 'Take ciprofloxacin 2 hours before or 6 hours after antacids.',
    mechanism: 'Metal cation chelation in GI tract'
  },
  {
    drugA: 'fluoroquinolone',
    drugB: 'iron/folic acid',
    severity: 'moderate',
    effect: 'Iron reduces fluoroquinolone absorption significantly',
    recommendation: 'Separate doses by at least 2 hours (fluoroquinolone first, iron later).',
    mechanism: 'Ferrous iron chelation with quinolone'
  },

  // Doxycycline + Calcium/Antacids/Iron
  {
    drugA: 'doxycycline',
    drugB: 'calcium/vitamin d3',
    severity: 'moderate',
    effect: 'Calcium reduces doxycycline absorption',
    recommendation: 'Separate doses by at least 2-3 hours.',
    mechanism: 'Divalent cation chelation'
  },
  {
    drugA: 'doxycycline',
    drugB: 'iron/folic acid',
    severity: 'moderate',
    effect: 'Iron reduces doxycycline absorption',
    recommendation: 'Separate doses by at least 2-3 hours.',
    mechanism: 'Iron chelation reduces tetracycline absorption'
  },
  {
    drugA: 'doxycycline',
    drugB: 'aluminium/magnesium hydroxide/simethicone',
    severity: 'moderate',
    effect: 'Antacids reduce doxycycline absorption',
    recommendation: 'Separate doses by 2-3 hours.',
    mechanism: 'Metal cation chelation'
  },

  // Metronidazole + Alcohol warning (can add as drug note)
  {
    drugA: 'metronidazole',
    drugB: 'warfarin',
    severity: 'major',
    effect: 'Metronidazole increases warfarin effect, risk of bleeding',
    recommendation: 'Monitor INR closely. May need to reduce warfarin dose by 25-50%.',
    mechanism: 'Metronidazole inhibits CYP2C9 (S-warfarin metabolism)',
    monitorable: true
  },

  // Clarithromycin interactions
  {
    drugA: 'clarithromycin',
    drugB: 'atorvastatin',
    severity: 'major',
    effect: 'Statin levels increase significantly, risk of rhabdomyolysis',
    recommendation: 'Pause statin during clarithromycin course. Use azithromycin if antibiotic needed long-term.',
    mechanism: 'Clarithromycin inhibits CYP3A4'
  },
  {
    drugA: 'clarithromycin',
    drugB: 'warfarin',
    severity: 'major',
    effect: 'Increased warfarin effect and INR, bleeding risk',
    recommendation: 'Monitor INR within 3 days. Consider azithromycin instead.',
    mechanism: 'CYP3A4 and CYP1A2 inhibition',
    monitorable: true
  },
  {
    drugA: 'clarithromycin',
    drugB: 'amlodipine',
    severity: 'moderate',
    effect: 'Increased amlodipine levels, risk of hypotension',
    recommendation: 'Monitor blood pressure. Use azithromycin if possible.',
    mechanism: 'CYP3A4 inhibition'
  },
  {
    drugA: 'clarithromycin',
    drugB: 'alprazolam',
    severity: 'major',
    effect: 'Alprazolam levels increase dramatically, excessive sedation and respiratory depression',
    recommendation: 'Avoid combination. Use azithromycin or reduce alprazolam dose by 50%.',
    mechanism: 'CYP3A4 inhibition'
  },

  // ──────────────────────────────────────────────
  // MODERATE INTERACTIONS
  // ──────────────────────────────────────────────

  // PPI long-term + Calcium/Iron absorption
  {
    drugA: 'ppi',
    drugB: 'calcium/vitamin d3',
    severity: 'minor',
    effect: 'Long-term PPI use may reduce calcium absorption, increasing fracture risk',
    recommendation: 'Use calcium citrate instead of carbonate (less pH-dependent). Review PPI necessity.',
    mechanism: 'PPIs reduce gastric acid needed for calcium carbonate dissolution'
  },
  {
    drugA: 'ppi',
    drugB: 'iron/folic acid',
    severity: 'moderate',
    effect: 'PPIs reduce iron absorption by raising gastric pH',
    recommendation: 'Take iron 2 hours before PPI. Consider IV iron if oral supplementation fails.',
    mechanism: 'Reduced gastric acid impairs iron salt dissolution'
  },

  // ACEi + ARB (dual RAAS blockade)
  {
    drugA: 'ace-inhibitor',
    drugB: 'arb',
    severity: 'contraindicated',
    effect: 'Dual RAAS blockade increases risk of hypotension, hyperkalemia, and renal failure with no proven benefit',
    recommendation: 'Never combine ACE inhibitor with ARB. Choose one class only.',
    mechanism: 'Dual blockade of renin-angiotensin system'
  },

  // Duplicate NSAIDs
  {
    drugA: 'nsaid',
    drugB: 'nsaid',
    severity: 'contraindicated',
    effect: 'No additional benefit from combining two NSAIDs, only increased side effects (GI bleeding, renal injury)',
    recommendation: 'Use only ONE NSAID at a time. Switch rather than stack.',
    mechanism: 'Duplicate COX inhibition with additive toxicity'
  },

  // Beta-blocker + Calcium channel blocker
  {
    drugA: 'beta-blocker',
    drugB: 'calcium-channel-blocker',
    severity: 'moderate',
    effect: 'Additive heart rate lowering and blood pressure reduction. Risk of bradycardia.',
    recommendation: 'This combination is common and often intentional. Monitor heart rate — hold if HR < 55 bpm.',
    mechanism: 'Additive negative chronotropic and inotropic effects',
    monitorable: true
  },

  // Prednisolone + NSAIDs
  {
    drugA: 'corticosteroid',
    drugB: 'nsaid',
    severity: 'major',
    effect: 'Very high risk of GI ulceration and bleeding (15x increased risk)',
    recommendation: 'Avoid if possible. If essential, add PPI cover (esomeprazole/pantoprazole).',
    mechanism: 'Corticosteroids impair mucosal healing + NSAIDs inhibit protective prostaglandins',
    monitorable: true
  },

  // Prednisolone + Diabetes drugs
  {
    drugA: 'corticosteroid',
    drugB: 'metformin',
    severity: 'moderate',
    effect: 'Corticosteroids raise blood glucose, reducing metformin efficacy',
    recommendation: 'Monitor blood glucose more frequently. May need to increase diabetes medication dose temporarily.',
    mechanism: 'Corticosteroids increase hepatic glucose output and insulin resistance',
    monitorable: true
  },
  {
    drugA: 'corticosteroid',
    drugB: 'insulin',
    severity: 'moderate',
    effect: 'Corticosteroids cause significant hyperglycemia, may need insulin dose adjustment',
    recommendation: 'Increase insulin dose by 20-40% during corticosteroid course. Monitor glucose QID.',
    mechanism: 'Corticosteroids increase insulin resistance',
    monitorable: true
  },
  {
    drugA: 'corticosteroid',
    drugB: 'sulfonylurea',
    severity: 'moderate',
    effect: 'Corticosteroids raise blood glucose, reducing sulfonylurea efficacy',
    recommendation: 'Monitor blood glucose. May need temporary dose increase or addition of insulin.',
    mechanism: 'Corticosteroids increase hepatic gluconeogenesis',
    monitorable: true
  },

  // Fluoxetine interactions (strong CYP2D6 inhibitor)
  {
    drugA: 'fluoxetine',
    drugB: 'amitriptyline',
    severity: 'major',
    effect: 'Fluoxetine dramatically increases amitriptyline levels, risk of cardiac toxicity and serotonin syndrome',
    recommendation: 'Avoid combination. If switching, allow 5-week washout for fluoxetine.',
    mechanism: 'Fluoxetine inhibits CYP2D6 (amitriptyline metabolism)'
  },
  {
    drugA: 'fluoxetine',
    drugB: 'carbamazepine',
    severity: 'moderate',
    effect: 'Fluoxetine may increase carbamazepine levels',
    recommendation: 'Monitor carbamazepine levels when starting/stopping fluoxetine.',
    mechanism: 'CYP3A4 inhibition',
    monitorable: true
  },

  // Escitalopram + Amitriptyline
  {
    drugA: 'escitalopram',
    drugB: 'amitriptyline',
    severity: 'major',
    effect: 'Risk of serotonin syndrome (agitation, tremor, hyperthermia) and increased TCA levels',
    recommendation: 'Avoid combination. Use one antidepressant class only.',
    mechanism: 'Additive serotonergic activity'
  },

  // Alprazolam + Opioids / other sedatives
  {
    drugA: 'alprazolam',
    drugB: 'amitriptyline',
    severity: 'major',
    effect: 'Excessive sedation, respiratory depression, increased fall risk',
    recommendation: 'Avoid if possible. If needed, use lowest doses and monitor closely.',
    mechanism: 'Additive CNS depression'
  },

  // SGLT2i + Diuretics
  {
    drugA: 'sglt2-inhibitor',
    drugB: 'furosemide',
    severity: 'moderate',
    effect: 'Increased risk of dehydration, hypotension, and diabetic ketoacidosis',
    recommendation: 'Ensure adequate hydration. May need to reduce diuretic dose. Monitor volume status.',
    mechanism: 'Additive diuretic/osmotic effect',
    monitorable: true
  },

  // Metformin + Alcohol (already in instructions but important interaction)
  {
    drugA: 'metformin',
    drugB: 'nsaid',
    severity: 'moderate',
    effect: 'NSAIDs may reduce renal function, increasing metformin accumulation and lactic acidosis risk',
    recommendation: 'Short-term use acceptable with normal renal function. Avoid in elderly or renal impairment.',
    mechanism: 'NSAIDs reduce GFR',
    monitorable: true
  },

  // Ciprofloxacin + Theophylline (relevant for respiratory)
  {
    drugA: 'ciprofloxacin',
    drugB: 'acefylline/mucolytics',
    severity: 'major',
    effect: 'Ciprofloxacin increases theophylline levels, risk of seizures and arrhythmias',
    recommendation: 'Reduce theophylline/acefylline dose by 50%. Monitor for toxicity symptoms.',
    mechanism: 'Ciprofloxacin inhibits CYP1A2 (theophylline metabolism)',
    monitorable: true
  },

  // Warfarin + Paracetamol (often overlooked)
  {
    drugA: 'warfarin',
    drugB: 'paracetamol',
    severity: 'moderate',
    effect: 'Regular paracetamol use (>2g/day for >1 week) can increase INR',
    recommendation: 'Safe at normal doses short-term. Monitor INR if using >2g/day regularly.',
    mechanism: 'Paracetamol may interfere with vitamin K-dependent clotting factor synthesis',
    monitorable: true
  },

  // Montelukast + nothing major but worth noting
  // Liraglutide + Sulfonylurea
  {
    drugA: 'liraglutide',
    drugB: 'sulfonylurea',
    severity: 'moderate',
    effect: 'Increased risk of hypoglycemia',
    recommendation: 'Reduce sulfonylurea dose by 50% when starting liraglutide.',
    mechanism: 'Additive glucose-lowering effect',
    monitorable: true
  },

  // Dydrogesterone + nothing clinically significant in this list

  // Empagliflozin + Insulin
  {
    drugA: 'empagliflozin',
    drugB: 'insulin',
    severity: 'moderate',
    effect: 'Increased risk of hypoglycemia and diabetic ketoacidosis',
    recommendation: 'Reduce insulin dose by 20% when adding empagliflozin. Monitor ketones if unwell.',
    mechanism: 'Additive glucose lowering; SGLT2i-related euglycemic DKA risk',
    monitorable: true
  },

  // Duplicate PPI check
  {
    drugA: 'ppi',
    drugB: 'ppi',
    severity: 'contraindicated',
    effect: 'No benefit from two PPIs. Duplicate therapy.',
    recommendation: 'Use only ONE PPI. Switch rather than stack.',
    mechanism: 'Duplicate mechanism of action'
  },

  // Duplicate Statin
  {
    drugA: 'statin',
    drugB: 'statin',
    severity: 'contraindicated',
    effect: 'No benefit from two statins. Increased risk of myopathy.',
    recommendation: 'Use only ONE statin. Switch to higher potency if needed.',
    mechanism: 'Duplicate HMG-CoA reductase inhibition'
  },

  // Duplicate ACEi check
  {
    drugA: 'ace-inhibitor',
    drugB: 'ace-inhibitor',
    severity: 'contraindicated',
    effect: 'No benefit from two ACE inhibitors. Increased side effects.',
    recommendation: 'Use only ONE ACE inhibitor.',
    mechanism: 'Duplicate mechanism'
  },

  // Duplicate Beta-blocker
  {
    drugA: 'beta-blocker',
    drugB: 'beta-blocker',
    severity: 'contraindicated',
    effect: 'No benefit from two beta-blockers. Risk of severe bradycardia.',
    recommendation: 'Use only ONE beta-blocker.',
    mechanism: 'Duplicate mechanism'
  },

  // Flupentixol/Melitracen + SSRI
  {
    drugA: 'flupentixol/melitracen',
    drugB: 'ssri',
    severity: 'major',
    effect: 'Risk of serotonin syndrome due to melitracen (TCA) + SSRI combination',
    recommendation: 'Avoid combination. Choose one antidepressant approach.',
    mechanism: 'Additive serotonergic activity from TCA + SSRI'
  },

  // Chlordiazepoxide/Clidinium + Alprazolam
  {
    drugA: 'chlordiazepoxide/clidinium',
    drugB: 'alprazolam',
    severity: 'major',
    effect: 'Excessive sedation from dual benzodiazepine use',
    recommendation: 'Avoid. Use only one benzodiazepine at a time.',
    mechanism: 'Additive GABA-A receptor potentiation'
  },

  // ACEi dry cough - not an interaction but worth noting
  // Sulpiride + SSRIs
  {
    drugA: 'sulpiride',
    drugB: 'ssri',
    severity: 'moderate',
    effect: 'Increased risk of QT prolongation and extrapyramidal symptoms',
    recommendation: 'Monitor ECG. Watch for movement disorders.',
    mechanism: 'Additive effects on cardiac conduction and dopamine pathways',
    monitorable: true
  },
]

// ============================================================================
// INTERACTION CHECKING ENGINE
// ============================================================================

/**
 * Normalize a generic name for comparison
 */
function normalizeGenericName(name: string): string {
  return name.toLowerCase().trim()
}

/**
 * Check if two drugs interact, considering both direct name matches and drug class matches
 */
function checkPairInteraction(genericA: string, genericB: string): DrugInteraction | null {
  const normA = normalizeGenericName(genericA)
  const normB = normalizeGenericName(genericB)

  // Skip self-comparison
  if (normA === normB) return null

  const classesA = getDrugClasses(normA)
  const classesB = getDrugClasses(normB)

  // Check for same-class duplicates (e.g. two NSAIDs)
  for (const classA of classesA) {
    if (classesB.includes(classA)) {
      // Found same class — check if there's a duplicate class interaction
      const duplicateInteraction = INTERACTIONS.find(
        i => i.drugA === classA && i.drugB === classA
      )
      if (duplicateInteraction) return duplicateInteraction
    }
  }

  // Build all possible name/class combinations to check
  const identifiersA = [normA, ...classesA]
  const identifiersB = [normB, ...classesB]

  // Search for matching interaction (check both directions)
  for (const idA of identifiersA) {
    for (const idB of identifiersB) {
      const match = INTERACTIONS.find(
        i => (i.drugA === idA && i.drugB === idB) || (i.drugA === idB && i.drugB === idA)
      )
      if (match) return match
    }
  }

  return null
}

/**
 * Check a new drug against a list of existing medications
 * Returns all found interactions sorted by severity
 */
export function checkDrugInteractions(
  newDrugGenericName: string,
  newDrugBrandName: string,
  existingMedications: Array<{ name: string; genericName?: string }>
): InteractionCheckResult[] {
  const results: InteractionCheckResult[] = []

  for (const existing of existingMedications) {
    const existingGeneric = existing.genericName || existing.name
    const interaction = checkPairInteraction(newDrugGenericName, existingGeneric)

    if (interaction) {
      results.push({
        newDrug: newDrugBrandName,
        existingDrug: existing.name,
        newDrugGeneric: newDrugGenericName,
        existingDrugGeneric: existingGeneric,
        interaction,
      })
    }
  }

  // Sort by severity: contraindicated > major > moderate > minor
  const severityOrder: Record<InteractionSeverity, number> = {
    contraindicated: 0,
    major: 1,
    moderate: 2,
    minor: 3,
  }

  results.sort((a, b) => severityOrder[a.interaction.severity] - severityOrder[b.interaction.severity])
  return results
}

/**
 * Check all medications in a list against each other
 * Returns all found interactions (useful for reviewing a full prescription)
 */
export function checkAllInteractions(
  medications: Array<{ name: string; genericName?: string }>
): InteractionCheckResult[] {
  const results: InteractionCheckResult[] = []
  const seen = new Set<string>()

  for (let i = 0; i < medications.length; i++) {
    for (let j = i + 1; j < medications.length; j++) {
      const medA = medications[i]
      const medB = medications[j]
      const genericA = medA.genericName || medA.name
      const genericB = medB.genericName || medB.name
      const pairKey = [genericA, genericB].sort().join('|')

      if (seen.has(pairKey)) continue
      seen.add(pairKey)

      const interaction = checkPairInteraction(genericA, genericB)
      if (interaction) {
        results.push({
          newDrug: medB.name,
          existingDrug: medA.name,
          newDrugGeneric: genericB,
          existingDrugGeneric: genericA,
          interaction,
        })
      }
    }
  }

  const severityOrder: Record<InteractionSeverity, number> = {
    contraindicated: 0,
    major: 1,
    moderate: 2,
    minor: 3,
  }

  results.sort((a, b) => severityOrder[a.interaction.severity] - severityOrder[b.interaction.severity])
  return results
}

/**
 * Get severity display properties
 */
export function getSeverityDisplay(severity: InteractionSeverity) {
  switch (severity) {
    case 'contraindicated':
      return {
        label: 'CONTRAINDICATED',
        color: 'text-white',
        bg: 'bg-red-700',
        border: 'border-red-700',
        lightBg: 'bg-red-50',
        icon: '⛔',
        description: 'Must NOT be combined'
      }
    case 'major':
      return {
        label: 'MAJOR',
        color: 'text-red-800',
        bg: 'bg-red-600',
        border: 'border-red-400',
        lightBg: 'bg-red-50',
        icon: '🔴',
        description: 'Potentially life-threatening'
      }
    case 'moderate':
      return {
        label: 'MODERATE',
        color: 'text-amber-800',
        bg: 'bg-amber-500',
        border: 'border-amber-400',
        lightBg: 'bg-amber-50',
        icon: '🟡',
        description: 'May worsen condition'
      }
    case 'minor':
      return {
        label: 'MINOR',
        color: 'text-blue-800',
        bg: 'bg-blue-500',
        border: 'border-blue-300',
        lightBg: 'bg-blue-50',
        icon: 'ℹ️',
        description: 'Monitor patient'
      }
  }
}

// Export for testing
export { INTERACTIONS, DRUG_CLASSES, checkPairInteraction }

// ============================================================================
// B16: ARABIC BRAND-NAME SUPPORT + ARABIC UI MESSAGES
// Extends the English engine above for Arabic brand names and Arabic messages.
// Does NOT modify the existing INTERACTIONS or DRUG_CLASSES structures.
// ============================================================================

/**
 * Arabic brand names → English generic names.
 * Used to resolve Arabic-named drugs before passing to checkPairInteraction.
 */
const ARABIC_BRAND_TO_GENERIC: Record<string, string> = {
  // Anticoagulants
  'وارفارين': 'warfarin',        'كومادين': 'warfarin',
  // NSAIDs
  'بروفين': 'ibuprofen',         'أدفيل': 'ibuprofen',
  'فولتارين': 'diclofenac sodium', 'كاتافلام': 'diclofenac potassium',
  'كيتوفان': 'ketoprofen',
  'نابروكسين': 'naproxen',
  'موبيك': 'meloxicam',
  'بريكسين': 'piroxicam',        'فيلدين': 'piroxicam',
  'سيليبركس': 'celecoxib',
  'أركوكسيا': 'etoricoxib',
  // Aspirin / antiplatelet
  'أسبرين': 'acetylsalicylic acid', 'أسبوسيد': 'acetylsalicylic acid',
  'جوسبرين': 'acetylsalicylic acid', 'ريفو': 'acetylsalicylic acid',
  'بلافيكس': 'clopidogrel',      'كلوبيد': 'clopidogrel',
  // SSRIs
  'برستيق': 'escitalopram',      'سيبرالكس': 'escitalopram',
  'زولوفت': 'sertraline',        'ليبرام': 'fluoxetine',
  'باروكستين': 'paroxetine',
  // Tramadol
  'ترامال': 'tramadol',          'زيدول': 'tramadol',  'دولوسان': 'tramadol',
  // Statins
  'ليبيتور': 'atorvastatin',     'أتوروس': 'atorvastatin',
  'كرستور': 'rosuvastatin',
  'زوكور': 'simvastatin',        'ليبوفاكس': 'simvastatin',
  // Macrolides
  'زيثروماكس': 'azithromycin',   'زيثرو': 'azithromycin',
  'كلاسيد': 'clarithromycin',
  'إريثرومايسين': 'erythromycin',
  // Fluoroquinolones
  'سيبرو': 'ciprofloxacin',
  'تافانيك': 'levofloxacin',
  'أفالوكس': 'moxifloxacin',
  // ACE inhibitors
  'كابوتين': 'captopril',
  'تريتاس': 'ramipril',
  'زيستريل': 'lisinopril',
  'كوفيريل': 'perindopril',
  // ARBs
  'كوزار': 'losartan',
  'ديوفان': 'valsartan',
  'ميكارديس': 'telmisartan',
  // Diuretics
  'ألداكتون': 'spironolactone',
  'ميدامور': 'amiloride',
  'لاسيكس': 'furosemide',
  // Antiepileptics
  'تيجريتول': 'carbamazepine',
  'تريليبتال': 'oxcarbazepine',
  'ديباكين': 'valproic acid',
  'لاميكتال': 'lamotrigine',
  // Antifungals
  'ديفلوكان': 'fluconazole',
  // PPIs
  'لوسيك': 'omeprazole',
  'باريت': 'pantoprazole',
  'نيكسيوم': 'esomeprazole',
  // Beta-blockers
  'كونكور': 'bisoprolol',
  // Corticosteroids
  'ديكسادرون': 'dexamethasone',
  'ميدرول': 'methylprednisolone',
  // Benzodiazepines
  'زاناكس': 'alprazolam',
  'فاليوم': 'diazepam',
  'ريفوتريل': 'clonazepam',
  'لكسوتانيل': 'bromazepam',
}

/**
 * Arabic messages for critical interactions.
 * Key = alphabetically sorted pair of generic names or drug-class identifiers, joined by '|'.
 * The identifiers must match what INTERACTIONS database and DRUG_CLASSES use.
 */
const ARABIC_INTERACTION_MESSAGES: Record<string, string> = {
  // Warfarin combinations
  'nsaid|warfarin':                  'مضاد الالتهاب يزيد خطر النزيف مع الوارفارين — تثبيط الصفائح ورفع مستوى الوارفارين في الدم',
  'anticoagulant|nsaid':             'مضاد الالتهاب يزيد خطر النزيف مع الوارفارين — تثبيط الصفائح ورفع مستوى الوارفارين في الدم',
  'acetylsalicylic acid|warfarin':   'الجمع يزيد خطر النزيف الهضمي بشكل كبير — راجع مؤشر INR بانتظام',
  'anticoagulant|antiplatelet':      'الجمع يزيد خطر النزيف بشكل كبير — راجع مؤشر INR بانتظام',
  'anticoagulant|azole-antifungal':  'مضاد الفطريات يرفع مستوى الوارفارين للضعف تقريباً — خطر نزيف شديد',
  'fluconazole|warfarin':            'الفلوكونازول يرفع الوارفارين للضعف تقريباً — خطر نزيف شديد',
  // Statin + azole antifungal
  'azole-antifungal|statin':         'مضاد الفطريات يرفع مستوى الستاتين بشدة — خطر انهيار عضلي (Rhabdomyolysis)',
  'atorvastatin|itraconazole':       'الإيتراكونازول يرفع مستوى الأتورفاستاتين بشدة — خطر انهيار عضلي',
  'itraconazole|rosuvastatin':       'الإيتراكونازول يرفع مستوى الروزوفاستاتين — خطر انهيار عضلي',
  // Methotrexate
  'methotrexate|nsaid':              'مضاد الالتهاب يقلل إفراز الميثوتريكسات ويرفع سميته بشكل خطير',
  // Macrolide + carbamazepine
  'carbamazepine|clarithromycin':    'الكلاريثروميسين يرفع مستوى الكاربامازيبين بشدة — خطر تسمم (دوخة، رأرأة، ترنح)',
  'antiepileptic|macrolide':         'الماكروليد يرفع مستوى مضاد الاختلاج — راجع الجرعة وراقب أعراض التسمم',
  // SSRIs + tramadol
  'escitalopram|tramadol':           'خطر متلازمة السيروتونين — أعراض: هياج، ارتفاع حرارة، تشنجات. خطير',
  'fluoxetine|tramadol':             'خطر متلازمة السيروتونين — أعراض: هياج، ارتفاع حرارة، تشنجات. خطير',
  'ssri|tramadol':                   'خطر متلازمة السيروتونين — أعراض: هياج، ارتفاع حرارة، تشنجات. خطير',
  // Clopidogrel + PPI
  'antiplatelet|ppi':                'بعض مثبطات المضخة (الأوميبرازول) يقللون فاعلية الكلوبيدوجريل — فضّل البانتوبرازول',
  'clopidogrel|omeprazole':          'الأوميبرازول يقلل فاعلية الكلوبيدوجريل — فضّل البانتوبرازول أو الرابيبرازول',
  // RAAS combinations
  'ace-inhibitor|arb':               'الجمع لا يُنصح به — خطر فشل كلوي وارتفاع بوتاسيوم في الدم',
  'ace-inhibitor|diuretic':          'قد يزيد خطر ارتفاع بوتاسيوم الدم مع مدرات حافظة للبوتاسيوم — راجع البوتاسيوم',
  // Corticosteroid + NSAID
  'corticosteroid|nsaid':            'الجمع يضاعف خطر قرحة المعدة والنزيف الهضمي — أضف حماية معدة',
  // Opioid/BZD
  'alprazolam|tramadol':             'الجمع يزيد خطر اكتئاب مركز التنفس — راقب المريض',
  'benzodiazepine|opioid':           'الجمع يزيد خطر اكتئاب مركز التنفس — قلّل الجرعة وراقب المريض',
  // Warfarin + macrolide/fluoroquinolone
  'anticoagulant|fluoroquinolone':   'الفلوروكينولون يرفع مستوى الوارفارين في الدم — راجع INR وعدّل الجرعة',
  'anticoagulant|macrolide':         'الماكروليد يثبط CYP2C9 ويرفع تركيز الوارفارين — خطر نزيف',
  // Warfarin + corticosteroid
  'anticoagulant|corticosteroid':    'الكورتيزون يزيد خطر النزيف مع الوارفارين — راجع INR',
  // Lithium + NSAIDs
  'lithium|nsaid':                   'مضاد الالتهاب يرفع مستوى الليثيوم في الدم — خطر تسمم بالليثيوم',
}

/**
 * UI-ready DDI result — two severity tiers only (major / moderate)
 */
export type DDISeverityUI = 'major' | 'moderate'

export interface DDIResultUI {
  severity: DDISeverityUI
  /** Arabic message for the doctor */
  messageAr: string
  /** Display name of the new drug being added */
  drugA: string
  /** Display name of the existing drug it conflicts with */
  drugB: string
}

/**
 * Resolve an English generic name from Arabic brand name fallback.
 */
function resolveGenericForUI(name: string, genericName?: string): string {
  if (genericName && genericName.trim()) return genericName.toLowerCase().trim()
  const trimmed = name.trim()
  return ARABIC_BRAND_TO_GENERIC[trimmed]
    ?? ARABIC_BRAND_TO_GENERIC[trimmed.replace(/\s+/g, '')]
    ?? name.toLowerCase().trim()
}

/**
 * B16: UI-ready DDI check for MedicationChips / SessionForm.
 *
 * Wraps the existing English engine with:
 *   - Arabic brand-name → English generic resolution
 *   - Arabic message lookup
 *   - Two-tier severity: 'contraindicated' | 'major' → 'major', 'moderate' → 'moderate'
 *
 * Returns the single highest-severity conflict found, or null.
 */
export function checkDrugInteractionForUI(
  newDrug: { name: string; genericName?: string },
  existingMeds: Array<{ name: string; genericName?: string }>,
): DDIResultUI | null {
  const resolvedGeneric = resolveGenericForUI(newDrug.name, newDrug.genericName)

  const results = checkDrugInteractions(
    resolvedGeneric,
    newDrug.name,
    existingMeds.map(m => ({
      name: m.name,
      genericName: resolveGenericForUI(m.name, m.genericName),
    })),
  )

  if (results.length === 0) return null

  // Already sorted highest→lowest by checkDrugInteractions
  const top = results[0]
  const severity: DDISeverityUI = top.interaction.severity === 'moderate' ? 'moderate' : 'major'

  // Look up Arabic message — try several key forms
  const pairKey = [top.newDrugGeneric, top.existingDrugGeneric].sort().join('|')
  const classKey1 = `${top.interaction.drugA}|${top.interaction.drugB}`
  const classKey2 = `${top.interaction.drugB}|${top.interaction.drugA}`

  const messageAr =
    ARABIC_INTERACTION_MESSAGES[pairKey] ??
    ARABIC_INTERACTION_MESSAGES[classKey1] ??
    ARABIC_INTERACTION_MESSAGES[classKey2] ??
    top.interaction.recommendation  // fallback: English recommendation

  return {
    severity,
    messageAr,
    drugA: newDrug.name,
    drugB: top.existingDrug,
  }
}
