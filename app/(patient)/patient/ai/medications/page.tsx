'use client'

import { useState, useEffect } from 'react'

// ============================================================================
// TYPES
// ============================================================================

interface DrugInfo {
  name: string
  genericName: string
  drugClass: string
  usedFor: string[]
  dosageForm: string
  commonDosages: string[]
  sideEffects: {
    common: string[]
    serious: string[]
  }
  warnings: string[]
  interactions: DrugInteraction[]
}

interface DrugInteraction {
  drug: string
  severity: 'minor' | 'moderate' | 'major'
  description: string
}

interface UserMedication {
  id: string
  name: string
  dosage: string
}

// ============================================================================
// MOCK DATA
// ============================================================================

const MOCK_DRUG_DATABASE: Record<string, DrugInfo> = {
  'metformin': {
    name: 'Metformin',
    genericName: 'Metformin Hydrochloride',
    drugClass: 'Biguanide Antidiabetic',
    usedFor: ['Type 2 Diabetes', 'Prediabetes', 'Polycystic Ovary Syndrome (off-label)'],
    dosageForm: 'Tablet, Extended-release tablet',
    commonDosages: ['500mg twice daily', '850mg twice daily', '1000mg twice daily'],
    sideEffects: {
      common: ['Nausea', 'Diarrhea', 'Stomach upset', 'Metallic taste', 'Loss of appetite'],
      serious: ['Lactic acidosis (rare)', 'Vitamin B12 deficiency', 'Hypoglycemia (with other diabetes drugs)']
    },
    warnings: [
      'Do not use if you have kidney problems',
      'Stop before procedures with contrast dye',
      'Avoid excessive alcohol consumption',
      'May need to stop temporarily during illness'
    ],
    interactions: [
      { drug: 'Alcohol', severity: 'major', description: 'Increases risk of lactic acidosis' },
      { drug: 'Contrast dye', severity: 'major', description: 'May cause kidney problems' },
      { drug: 'Furosemide', severity: 'moderate', description: 'May affect blood sugar control' }
    ]
  },
  'lisinopril': {
    name: 'Lisinopril',
    genericName: 'Lisinopril',
    drugClass: 'ACE Inhibitor',
    usedFor: ['High blood pressure', 'Heart failure', 'Post-heart attack protection', 'Diabetic kidney disease'],
    dosageForm: 'Tablet',
    commonDosages: ['5mg once daily', '10mg once daily', '20mg once daily', '40mg once daily'],
    sideEffects: {
      common: ['Dry cough', 'Dizziness', 'Headache', 'Fatigue', 'Nausea'],
      serious: ['Angioedema (swelling)', 'High potassium levels', 'Kidney problems', 'Low blood pressure']
    },
    warnings: [
      'Do not use if pregnant',
      'May cause persistent dry cough',
      'Avoid potassium supplements without doctor advice',
      'Stay hydrated'
    ],
    interactions: [
      { drug: 'Potassium supplements', severity: 'major', description: 'May cause dangerously high potassium' },
      { drug: 'NSAIDs (ibuprofen, naproxen)', severity: 'moderate', description: 'May reduce effectiveness and affect kidneys' },
      { drug: 'Lithium', severity: 'major', description: 'May increase lithium levels' }
    ]
  },
  'atorvastatin': {
    name: 'Atorvastatin',
    genericName: 'Atorvastatin Calcium',
    drugClass: 'Statin (HMG-CoA Reductase Inhibitor)',
    usedFor: ['High cholesterol', 'Prevention of heart disease', 'Stroke prevention'],
    dosageForm: 'Tablet',
    commonDosages: ['10mg once daily', '20mg once daily', '40mg once daily', '80mg once daily'],
    sideEffects: {
      common: ['Muscle pain', 'Joint pain', 'Diarrhea', 'Nausea', 'Upset stomach'],
      serious: ['Rhabdomyolysis (severe muscle breakdown)', 'Liver problems', 'Memory problems', 'Increased blood sugar']
    },
    warnings: [
      'Report any unexplained muscle pain',
      'Regular liver function tests recommended',
      'Avoid grapefruit juice',
      'May increase blood sugar levels'
    ],
    interactions: [
      { drug: 'Grapefruit juice', severity: 'major', description: 'Increases drug levels significantly' },
      { drug: 'Gemfibrozil', severity: 'major', description: 'Greatly increases risk of muscle problems' },
      { drug: 'Warfarin', severity: 'moderate', description: 'May increase bleeding risk' }
    ]
  }
}

const MOCK_USER_MEDICATIONS: UserMedication[] = [
  { id: '1', name: 'Metformin', dosage: '500mg twice daily' },
  { id: '2', name: 'Lisinopril', dosage: '10mg once daily' },
  { id: '3', name: 'Vitamin D', dosage: '1000 IU daily' }
]

// ============================================================================
// MEDICATION ASSISTANT PAGE
// ============================================================================

export default function MedicationAssistantPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDrug, setSelectedDrug] = useState<DrugInfo | null>(null)
  const [userMedications, setUserMedications] = useState<UserMedication[]>(MOCK_USER_MEDICATIONS)
  const [interactionResults, setInteractionResults] = useState<DrugInteraction[] | null>(null)
  const [activeTab, setActiveTab] = useState<'search' | 'interactions' | 'reminders'>('search')

  const handleSearch = () => {
    const normalizedQuery = searchQuery.toLowerCase().trim()
    const drug = MOCK_DRUG_DATABASE[normalizedQuery]
    if (drug) {
      setSelectedDrug(drug)
    } else {
      // Mock response for unknown drugs
      setSelectedDrug({
        name: searchQuery,
        genericName: searchQuery,
        drugClass: 'Information not available',
        usedFor: ['Please consult your pharmacist or doctor for accurate information'],
        dosageForm: 'Various',
        commonDosages: ['As prescribed by your doctor'],
        sideEffects: {
          common: ['Information not available in our database'],
          serious: ['Please consult your pharmacist']
        },
        warnings: ['Always follow your doctor\'s instructions'],
        interactions: []
      })
    }
  }

  const checkInteractions = () => {
    // Mock interaction check
    const interactions: DrugInteraction[] = []
    
    // Check Metformin + Alcohol
    if (userMedications.some(m => m.name.toLowerCase() === 'metformin')) {
      interactions.push({
        drug: 'Alcohol',
        severity: 'major',
        description: 'Metformin with alcohol increases the risk of lactic acidosis. Limit alcohol consumption.'
      })
    }
    
    // Check Lisinopril + NSAIDs
    if (userMedications.some(m => m.name.toLowerCase() === 'lisinopril')) {
      interactions.push({
        drug: 'NSAIDs (Ibuprofen, Aspirin)',
        severity: 'moderate',
        description: 'NSAIDs may reduce the effectiveness of Lisinopril and affect kidney function.'
      })
    }

    setInteractionResults(interactions)
    setActiveTab('interactions')
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          💊 Medication Assistant
        </h1>
        <p className="text-gray-600 mt-1">
          Get drug information, check interactions, and manage reminders
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { id: 'search', label: 'Drug Search', icon: '🔍' },
          { id: 'interactions', label: 'Interactions', icon: '⚠️' },
          { id: 'reminders', label: 'Reminders', icon: '⏰' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === tab.id
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Drug Search Tab */}
      {activeTab === 'search' && (
        <div className="space-y-6">
          {/* Search Box */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Search for a medication</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Enter drug name (e.g., Metformin, Lisinopril)"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={handleSearch}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                Search
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Try: Metformin, Lisinopril, or Atorvastatin
            </p>
          </div>

          {/* Drug Info */}
          {selectedDrug && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
              {/* Header */}
              <div className="border-b pb-4">
                <h2 className="text-xl font-bold text-gray-900">{selectedDrug.name}</h2>
                <p className="text-gray-600">{selectedDrug.genericName}</p>
                <span className="inline-block mt-2 px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm">
                  {selectedDrug.drugClass}
                </span>
              </div>

              {/* Used For */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Used For</h3>
                <ul className="space-y-1">
                  {selectedDrug.usedFor.map((use, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                      {use}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Dosage Info */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Common Dosages</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedDrug.commonDosages.map((dose, i) => (
                    <span key={i} className="px-3 py-1 bg-gray-100 rounded-lg text-sm">
                      {dose}
                    </span>
                  ))}
                </div>
              </div>

              {/* Side Effects */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Common Side Effects</h3>
                  <ul className="space-y-1">
                    {selectedDrug.sideEffects.common.map((effect, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="text-yellow-500">•</span>
                        {effect}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">⚠️ Serious Side Effects</h3>
                  <ul className="space-y-1">
                    {selectedDrug.sideEffects.serious.map((effect, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-red-600">
                        <span>•</span>
                        {effect}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Warnings */}
              <div className="bg-yellow-50 rounded-lg p-4">
                <h3 className="font-semibold text-yellow-800 mb-2 flex items-center gap-2">
                  <span>⚠️</span> Important Warnings
                </h3>
                <ul className="space-y-1">
                  {selectedDrug.warnings.map((warning, i) => (
                    <li key={i} className="text-sm text-yellow-700">• {warning}</li>
                  ))}
                </ul>
              </div>

              {/* Known Interactions */}
              {selectedDrug.interactions.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Known Interactions</h3>
                  <div className="space-y-2">
                    {selectedDrug.interactions.map((interaction, i) => (
                      <div 
                        key={i} 
                        className={`p-3 rounded-lg ${
                          interaction.severity === 'major' ? 'bg-red-50 border border-red-200' :
                          interaction.severity === 'moderate' ? 'bg-yellow-50 border border-yellow-200' :
                          'bg-gray-50 border border-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            interaction.severity === 'major' ? 'bg-red-200 text-red-800' :
                            interaction.severity === 'moderate' ? 'bg-yellow-200 text-yellow-800' :
                            'bg-gray-200 text-gray-800'
                          }`}>
                            {interaction.severity.toUpperCase()}
                          </span>
                          <span className="font-medium">{interaction.drug}</span>
                        </div>
                        <p className="text-sm mt-1">{interaction.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Disclaimer */}
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
                <p className="font-medium mb-1">⚕️ Disclaimer</p>
                <p>
                  This information is for educational purposes only. Always consult your 
                  doctor or pharmacist before making any changes to your medications.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Interactions Tab */}
      {activeTab === 'interactions' && (
        <div className="space-y-6">
          {/* Current Medications */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Your Current Medications</h2>
            <div className="space-y-2 mb-4">
              {userMedications.map(med => (
                <div key={med.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <span className="font-medium">{med.name}</span>
                    <span className="text-sm text-gray-500 ml-2">{med.dosage}</span>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={checkInteractions}
              className="w-full py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center justify-center gap-2"
            >
              <span>⚠️</span>
              Check for Interactions
            </button>
          </div>

          {/* Interaction Results */}
          {interactionResults !== null && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Interaction Check Results</h2>
              
              {interactionResults.length === 0 ? (
                <div className="text-center py-8">
                  <span className="text-4xl">✅</span>
                  <h3 className="font-semibold text-green-700 mt-2">No Major Interactions Found</h3>
                  <p className="text-gray-600 mt-1">
                    Your current medications appear to be safe together.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {interactionResults.map((interaction, i) => (
                    <div 
                      key={i}
                      className={`p-4 rounded-lg ${
                        interaction.severity === 'major' ? 'bg-red-50 border-2 border-red-200' :
                        interaction.severity === 'moderate' ? 'bg-yellow-50 border-2 border-yellow-200' :
                        'bg-gray-50 border border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          interaction.severity === 'major' ? 'bg-red-200 text-red-800' :
                          interaction.severity === 'moderate' ? 'bg-yellow-200 text-yellow-800' :
                          'bg-gray-200 text-gray-800'
                        }`}>
                          {interaction.severity === 'major' ? '⚠️ MAJOR' : 
                           interaction.severity === 'moderate' ? '⚡ MODERATE' : 'ℹ️ MINOR'}
                        </span>
                        <span className="font-semibold">{interaction.drug}</span>
                      </div>
                      <p className="text-sm">{interaction.description}</p>
                    </div>
                  ))}
                  
                  <div className="bg-blue-50 rounded-lg p-4 mt-4">
                    <p className="text-sm text-blue-800">
                      💡 <strong>Tip:</strong> Discuss these interactions with your doctor or pharmacist 
                      to ensure your medications are being used safely.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reminders Tab */}
      {activeTab === 'reminders' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-center py-12">
            <span className="text-4xl">⏰</span>
            <h2 className="font-semibold text-gray-900 mt-4">Medication Reminders</h2>
            <p className="text-gray-600 mt-2 max-w-md mx-auto">
              Set up reminders to take your medications on time. 
              This feature will be available soon!
            </p>
            <button className="mt-6 px-6 py-2 bg-gray-200 text-gray-600 rounded-lg cursor-not-allowed">
              Coming Soon
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
