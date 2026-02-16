'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// ============================================================================
// TYPES
// ============================================================================

interface Symptom {
  id: string
  name: string
  icon: string
  category: 'general' | 'head' | 'chest' | 'abdomen' | 'musculoskeletal' | 'skin' | 'mental'
}

interface SymptomCheckResult {
  severity: 'low' | 'medium' | 'high' | 'emergency'
  possibleConditions: string[]
  recommendations: string[]
  shouldSeeDoctor: boolean
  urgency: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const BODY_PARTS = [
  { id: 'head', label: 'Head & Face', icon: '🧠', color: 'bg-purple-100 border-purple-300' },
  { id: 'chest', label: 'Chest & Heart', icon: '🫁', color: 'bg-red-100 border-red-300' },
  { id: 'abdomen', label: 'Abdomen', icon: '🫃', color: 'bg-yellow-100 border-yellow-300' },
  { id: 'musculoskeletal', label: 'Muscles & Joints', icon: '🦴', color: 'bg-blue-100 border-blue-300' },
  { id: 'skin', label: 'Skin', icon: '🤚', color: 'bg-orange-100 border-orange-300' },
  { id: 'mental', label: 'Mental Health', icon: '🧘', color: 'bg-green-100 border-green-300' },
  { id: 'general', label: 'General/Other', icon: '🌡️', color: 'bg-gray-100 border-gray-300' },
]

const SYMPTOMS_BY_CATEGORY: Record<string, Symptom[]> = {
  head: [
    { id: 'headache', name: 'Headache', icon: '🤕', category: 'head' },
    { id: 'dizziness', name: 'Dizziness', icon: '💫', category: 'head' },
    { id: 'blurred-vision', name: 'Blurred Vision', icon: '👀', category: 'head' },
    { id: 'ear-pain', name: 'Ear Pain', icon: '👂', category: 'head' },
    { id: 'sore-throat', name: 'Sore Throat', icon: '🗣️', category: 'head' },
    { id: 'congestion', name: 'Nasal Congestion', icon: '🤧', category: 'head' },
  ],
  chest: [
    { id: 'chest-pain', name: 'Chest Pain', icon: '💔', category: 'chest' },
    { id: 'shortness-breath', name: 'Shortness of Breath', icon: '😮‍💨', category: 'chest' },
    { id: 'palpitations', name: 'Heart Palpitations', icon: '💓', category: 'chest' },
    { id: 'cough', name: 'Cough', icon: '😷', category: 'chest' },
    { id: 'wheezing', name: 'Wheezing', icon: '🌬️', category: 'chest' },
  ],
  abdomen: [
    { id: 'nausea', name: 'Nausea', icon: '🤢', category: 'abdomen' },
    { id: 'vomiting', name: 'Vomiting', icon: '🤮', category: 'abdomen' },
    { id: 'stomach-pain', name: 'Stomach Pain', icon: '😣', category: 'abdomen' },
    { id: 'diarrhea', name: 'Diarrhea', icon: '🚽', category: 'abdomen' },
    { id: 'constipation', name: 'Constipation', icon: '😫', category: 'abdomen' },
    { id: 'bloating', name: 'Bloating', icon: '🎈', category: 'abdomen' },
  ],
  musculoskeletal: [
    { id: 'back-pain', name: 'Back Pain', icon: '🔙', category: 'musculoskeletal' },
    { id: 'joint-pain', name: 'Joint Pain', icon: '🦵', category: 'musculoskeletal' },
    { id: 'muscle-aches', name: 'Muscle Aches', icon: '💪', category: 'musculoskeletal' },
    { id: 'stiffness', name: 'Stiffness', icon: '🪨', category: 'musculoskeletal' },
    { id: 'swelling', name: 'Swelling', icon: '🎈', category: 'musculoskeletal' },
  ],
  skin: [
    { id: 'rash', name: 'Rash', icon: '🔴', category: 'skin' },
    { id: 'itching', name: 'Itching', icon: '🤏', category: 'skin' },
    { id: 'bruising', name: 'Bruising', icon: '🟣', category: 'skin' },
    { id: 'dry-skin', name: 'Dry Skin', icon: '🏜️', category: 'skin' },
    { id: 'wounds', name: 'Cuts/Wounds', icon: '🩹', category: 'skin' },
  ],
  mental: [
    { id: 'anxiety', name: 'Anxiety', icon: '😰', category: 'mental' },
    { id: 'depression', name: 'Low Mood', icon: '😔', category: 'mental' },
    { id: 'insomnia', name: 'Sleep Problems', icon: '🌙', category: 'mental' },
    { id: 'stress', name: 'Stress', icon: '😓', category: 'mental' },
    { id: 'fatigue', name: 'Mental Fatigue', icon: '🧠', category: 'mental' },
  ],
  general: [
    { id: 'fever', name: 'Fever', icon: '🤒', category: 'general' },
    { id: 'fatigue', name: 'Fatigue', icon: '😴', category: 'general' },
    { id: 'weight-loss', name: 'Weight Loss', icon: '⚖️', category: 'general' },
    { id: 'weight-gain', name: 'Weight Gain', icon: '📈', category: 'general' },
    { id: 'loss-appetite', name: 'Loss of Appetite', icon: '🍽️', category: 'general' },
    { id: 'night-sweats', name: 'Night Sweats', icon: '💦', category: 'general' },
  ],
}

const DURATION_OPTIONS = [
  { id: 'hours', label: 'Less than 24 hours', value: 1 },
  { id: '1-3days', label: '1-3 days', value: 2 },
  { id: '4-7days', label: '4-7 days', value: 3 },
  { id: '1-2weeks', label: '1-2 weeks', value: 4 },
  { id: 'longer', label: 'More than 2 weeks', value: 5 },
]

const SEVERITY_OPTIONS = [
  { id: 'mild', label: 'Mild - I can continue normal activities', value: 1, color: 'bg-green-100 border-green-400' },
  { id: 'moderate', label: 'Moderate - It affects some activities', value: 2, color: 'bg-yellow-100 border-yellow-400' },
  { id: 'severe', label: 'Severe - Significantly impacts my day', value: 3, color: 'bg-orange-100 border-orange-400' },
  { id: 'very-severe', label: 'Very Severe - I cannot function normally', value: 4, color: 'bg-red-100 border-red-400' },
]

// ============================================================================
// SYMPTOM CHECKER PAGE
// ============================================================================

export default function SymptomCheckerPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [selectedBodyPart, setSelectedBodyPart] = useState<string | null>(null)
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([])
  const [duration, setDuration] = useState<string | null>(null)
  const [severity, setSeverity] = useState<string | null>(null)
  const [additionalInfo, setAdditionalInfo] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState<SymptomCheckResult | null>(null)

  const toggleSymptom = (symptomId: string) => {
    setSelectedSymptoms(prev => 
      prev.includes(symptomId) 
        ? prev.filter(s => s !== symptomId)
        : [...prev, symptomId]
    )
  }

  const canProceed = () => {
    switch (step) {
      case 1: return selectedBodyPart !== null
      case 2: return selectedSymptoms.length > 0
      case 3: return duration !== null
      case 4: return severity !== null
      default: return true
    }
  }

  const handleNext = () => {
    if (step < 5) {
      setStep(step + 1)
    } else {
      analyzeSymptoms()
    }
  }

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1)
    }
  }

  const analyzeSymptoms = async () => {
    setIsAnalyzing(true)

    // Simulate AI analysis
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Generate mock result based on inputs
    const severityValue = SEVERITY_OPTIONS.find(s => s.id === severity)?.value || 2
    const durationValue = DURATION_OPTIONS.find(d => d.id === duration)?.value || 2
    
    let resultSeverity: SymptomCheckResult['severity'] = 'low'
    let shouldSeeDoctor = false
    let urgency = 'No immediate action needed'

    if (severityValue >= 4 || (severityValue >= 3 && durationValue >= 4)) {
      resultSeverity = 'high'
      shouldSeeDoctor = true
      urgency = 'Schedule an appointment this week'
    } else if (severityValue >= 3 || durationValue >= 4) {
      resultSeverity = 'medium'
      shouldSeeDoctor = true
      urgency = 'Consider seeing a doctor if symptoms persist'
    }

    // Check for emergency symptoms
    if (selectedSymptoms.includes('chest-pain') || selectedSymptoms.includes('shortness-breath')) {
      if (severityValue >= 3) {
        resultSeverity = 'emergency'
        urgency = '⚠️ Seek immediate medical attention'
      }
    }

    setResult({
      severity: resultSeverity,
      possibleConditions: generatePossibleConditions(),
      recommendations: generateRecommendations(resultSeverity),
      shouldSeeDoctor,
      urgency
    })

    setIsAnalyzing(false)
    setStep(6)
  }

  const generatePossibleConditions = (): string[] => {
    // Mock conditions based on symptoms
    const conditions: string[] = []
    
    if (selectedSymptoms.some(s => ['headache', 'fever', 'fatigue'].includes(s))) {
      conditions.push('Common Cold/Flu')
    }
    if (selectedSymptoms.some(s => ['stomach-pain', 'nausea', 'diarrhea'].includes(s))) {
      conditions.push('Gastroenteritis')
    }
    if (selectedSymptoms.includes('headache') && selectedSymptoms.includes('stress')) {
      conditions.push('Tension Headache')
    }
    if (selectedSymptoms.includes('anxiety') || selectedSymptoms.includes('insomnia')) {
      conditions.push('Stress-Related Symptoms')
    }
    
    if (conditions.length === 0) {
      conditions.push('General discomfort - monitoring recommended')
    }
    
    return conditions
  }

  const generateRecommendations = (severity: string): string[] => {
    const recs: string[] = []
    
    recs.push('Stay hydrated and get adequate rest')
    
    if (selectedSymptoms.includes('fever')) {
      recs.push('Monitor temperature regularly')
    }
    if (severity === 'high' || severity === 'emergency') {
      recs.push('Contact your healthcare provider')
    }
    if (selectedSymptoms.some(s => ['anxiety', 'stress', 'insomnia'].includes(s))) {
      recs.push('Practice relaxation techniques')
    }
    
    recs.push('Log this in your health diary for tracking')
    
    return recs
  }

  const startOver = () => {
    setStep(1)
    setSelectedBodyPart(null)
    setSelectedSymptoms([])
    setDuration(null)
    setSeverity(null)
    setAdditionalInfo('')
    setResult(null)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            🩺 Symptom Checker
          </h1>
          <p className="text-gray-600 mt-1">
            {step < 6 ? 'Tell us about your symptoms' : 'Your symptom analysis'}
          </p>
        </div>
        {step > 1 && step < 6 && (
          <button
            onClick={startOver}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Start Over
          </button>
        )}
      </div>

      {/* Progress */}
      {step < 6 && (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(s => (
            <div
              key={s}
              className={`flex-1 h-2 rounded-full ${
                s <= step ? 'bg-primary-500' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
      )}

      {/* Step Content */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {/* Step 1: Body Part */}
        {step === 1 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Where are you experiencing symptoms?</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {BODY_PARTS.map(part => (
                <button
                  key={part.id}
                  onClick={() => setSelectedBodyPart(part.id)}
                  className={`p-4 rounded-xl border-2 text-center transition-all ${
                    selectedBodyPart === part.id
                      ? `${part.color} border-primary-500 scale-105`
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-3xl mb-2">{part.icon}</div>
                  <div className="text-sm font-medium">{part.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Symptoms */}
        {step === 2 && selectedBodyPart && (
          <div>
            <h2 className="text-lg font-semibold mb-4">
              Select your symptoms (select all that apply)
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {SYMPTOMS_BY_CATEGORY[selectedBodyPart]?.map(symptom => (
                <button
                  key={symptom.id}
                  onClick={() => toggleSymptom(symptom.id)}
                  className={`p-3 rounded-lg border-2 text-left flex items-center gap-3 transition-all ${
                    selectedSymptoms.includes(symptom.id)
                      ? 'bg-primary-50 border-primary-500'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-xl">{symptom.icon}</span>
                  <span className="text-sm font-medium">{symptom.name}</span>
                  {selectedSymptoms.includes(symptom.id) && (
                    <span className="ml-auto text-primary-500">✓</span>
                  )}
                </button>
              ))}
            </div>
            
            {/* Also show general symptoms */}
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-gray-500 mb-2">General symptoms:</p>
              <div className="grid grid-cols-2 gap-2">
                {SYMPTOMS_BY_CATEGORY.general.slice(0, 4).map(symptom => (
                  <button
                    key={symptom.id}
                    onClick={() => toggleSymptom(symptom.id)}
                    className={`p-3 rounded-lg border-2 text-left flex items-center gap-3 transition-all ${
                      selectedSymptoms.includes(symptom.id)
                        ? 'bg-primary-50 border-primary-500'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-xl">{symptom.icon}</span>
                    <span className="text-sm font-medium">{symptom.name}</span>
                    {selectedSymptoms.includes(symptom.id) && (
                      <span className="ml-auto text-primary-500">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Duration */}
        {step === 3 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">How long have you had these symptoms?</h2>
            <div className="space-y-2">
              {DURATION_OPTIONS.map(option => (
                <button
                  key={option.id}
                  onClick={() => setDuration(option.id)}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                    duration === option.id
                      ? 'bg-primary-50 border-primary-500'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Severity */}
        {step === 4 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">How severe are your symptoms?</h2>
            <div className="space-y-2">
              {SEVERITY_OPTIONS.map(option => (
                <button
                  key={option.id}
                  onClick={() => setSeverity(option.id)}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                    severity === option.id
                      ? `${option.color} border-2`
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Additional Info */}
        {step === 5 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Anything else we should know? (Optional)</h2>
            <textarea
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
              placeholder="Describe any other details about your symptoms, recent activities, or concerns..."
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-sm text-gray-500 mt-2">
              Include details like: when symptoms started, what makes them better or worse, any recent changes in diet or activity.
            </p>
          </div>
        )}

        {/* Step 6: Results */}
        {step === 6 && result && (
          <div>
            {/* Severity Banner */}
            <div className={`p-4 rounded-lg mb-6 ${
              result.severity === 'emergency' ? 'bg-red-100 border-2 border-red-400' :
              result.severity === 'high' ? 'bg-orange-100 border-2 border-orange-400' :
              result.severity === 'medium' ? 'bg-yellow-100 border-2 border-yellow-400' :
              'bg-green-100 border-2 border-green-400'
            }`}>
              <div className="flex items-center gap-3">
                <span className="text-3xl">
                  {result.severity === 'emergency' ? '🚨' :
                   result.severity === 'high' ? '⚠️' :
                   result.severity === 'medium' ? '📋' : '✅'}
                </span>
                <div>
                  <h3 className="font-semibold">
                    {result.severity === 'emergency' ? 'Seek Immediate Care' :
                     result.severity === 'high' ? 'Medical Attention Recommended' :
                     result.severity === 'medium' ? 'Monitor Closely' : 'Self-Care Appropriate'}
                  </h3>
                  <p className="text-sm">{result.urgency}</p>
                </div>
              </div>
            </div>

            {/* Selected Symptoms Summary */}
            <div className="mb-6">
              <h3 className="font-semibold text-gray-900 mb-2">Your Symptoms</h3>
              <div className="flex flex-wrap gap-2">
                {selectedSymptoms.map(symptomId => {
                  const symptom = Object.values(SYMPTOMS_BY_CATEGORY)
                    .flat()
                    .find(s => s.id === symptomId)
                  return symptom ? (
                    <span key={symptomId} className="px-3 py-1 bg-gray-100 rounded-full text-sm">
                      {symptom.icon} {symptom.name}
                    </span>
                  ) : null
                })}
              </div>
            </div>

            {/* Possible Conditions */}
            <div className="mb-6">
              <h3 className="font-semibold text-gray-900 mb-2">Possible Conditions</h3>
              <ul className="space-y-1">
                {result.possibleConditions.map((condition, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-1.5 h-1.5 bg-primary-500 rounded-full"></span>
                    {condition}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-500 mt-2 italic">
                *These are possibilities based on your symptoms, not diagnoses.
              </p>
            </div>

            {/* Recommendations */}
            <div className="mb-6">
              <h3 className="font-semibold text-gray-900 mb-2">Recommendations</h3>
              <ul className="space-y-2">
                {result.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-green-500 mt-0.5">✓</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>

            {/* Disclaimer */}
            <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
              <p className="font-medium mb-1">⚕️ Important Disclaimer</p>
              <p>
                This symptom checker provides general information only and is not a substitute 
                for professional medical advice, diagnosis, or treatment. Always consult a 
                qualified healthcare provider for medical concerns.
              </p>
            </div>
          </div>
        )}

        {/* Analyzing State */}
        {isAnalyzing && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold text-gray-900">Analyzing your symptoms...</h3>
            <p className="text-gray-500 mt-2">This will only take a moment</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      {!isAnalyzing && step < 6 && (
        <div className="flex gap-3">
          {step > 1 && (
            <button
              onClick={handleBack}
              className="flex-1 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={!canProceed()}
            className={`flex-1 px-6 py-3 rounded-lg ${
              canProceed()
                ? 'bg-primary-600 text-white hover:bg-primary-700'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            }`}
          >
            {step === 5 ? 'Analyze Symptoms' : 'Next'}
          </button>
        </div>
      )}

      {/* Result Actions */}
      {step === 6 && result && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => router.push('/patient/diary')}
            className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
          >
            <span>📔</span> Log to Diary
          </button>
          {result.shouldSeeDoctor && (
            <button
              onClick={() => router.push('/patient/appointments')}
              className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center justify-center gap-2"
            >
              <span>📅</span> Book Appointment
            </button>
          )}
          {!result.shouldSeeDoctor && (
            <button
              onClick={startOver}
              className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Check Another Symptom
            </button>
          )}
        </div>
      )}
    </div>
  )
}
