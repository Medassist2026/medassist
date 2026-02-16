'use client'

import { useState, useEffect } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

// ============================================================================
// TYPES
// ============================================================================

interface DiaryEntry {
  id: string
  date: string
  mood: 1 | 2 | 3 | 4 | 5
  energy: 1 | 2 | 3 | 4 | 5
  sleep_quality: 1 | 2 | 3 | 4 | 5
  sleep_hours: number
  symptoms: string[]
  notes: string
  created_at: string
}

interface SymptomOption {
  id: string
  label: string
  icon: string
  category: 'physical' | 'mental' | 'digestive' | 'respiratory'
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MOOD_OPTIONS = [
  { value: 1, emoji: '😢', label: 'Very Bad' },
  { value: 2, emoji: '😕', label: 'Bad' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😄', label: 'Great' },
]

const ENERGY_OPTIONS = [
  { value: 1, emoji: '🔋', label: 'Exhausted', fill: 'w-1/5' },
  { value: 2, emoji: '🔋', label: 'Low', fill: 'w-2/5' },
  { value: 3, emoji: '🔋', label: 'Moderate', fill: 'w-3/5' },
  { value: 4, emoji: '🔋', label: 'Good', fill: 'w-4/5' },
  { value: 5, emoji: '🔋', label: 'Energized', fill: 'w-full' },
]

const COMMON_SYMPTOMS: SymptomOption[] = [
  { id: 'headache', label: 'Headache', icon: '🤕', category: 'physical' },
  { id: 'fatigue', label: 'Fatigue', icon: '😴', category: 'physical' },
  { id: 'pain', label: 'Body Pain', icon: '💢', category: 'physical' },
  { id: 'fever', label: 'Fever', icon: '🤒', category: 'physical' },
  { id: 'nausea', label: 'Nausea', icon: '🤢', category: 'digestive' },
  { id: 'stomach', label: 'Stomach Issues', icon: '🫃', category: 'digestive' },
  { id: 'cough', label: 'Cough', icon: '😷', category: 'respiratory' },
  { id: 'congestion', label: 'Congestion', icon: '🤧', category: 'respiratory' },
  { id: 'anxiety', label: 'Anxiety', icon: '😰', category: 'mental' },
  { id: 'stress', label: 'Stress', icon: '😓', category: 'mental' },
  { id: 'insomnia', label: 'Insomnia', icon: '🌙', category: 'mental' },
  { id: 'dizziness', label: 'Dizziness', icon: '💫', category: 'physical' },
]

// ============================================================================
// DIARY ENTRY FORM
// ============================================================================

interface DiaryFormProps {
  initialData?: Partial<DiaryEntry>
  onSubmit: (data: Omit<DiaryEntry, 'id' | 'created_at'>) => Promise<void>
  onCancel: () => void
  isSubmitting: boolean
}

function DiaryForm({ initialData, onSubmit, onCancel, isSubmitting }: DiaryFormProps) {
  const [formData, setFormData] = useState({
    date: initialData?.date || new Date().toISOString().split('T')[0],
    mood: initialData?.mood || 3 as 1 | 2 | 3 | 4 | 5,
    energy: initialData?.energy || 3 as 1 | 2 | 3 | 4 | 5,
    sleep_quality: initialData?.sleep_quality || 3 as 1 | 2 | 3 | 4 | 5,
    sleep_hours: initialData?.sleep_hours || 7,
    symptoms: initialData?.symptoms || [] as string[],
    notes: initialData?.notes || ''
  })

  const toggleSymptom = (symptomId: string) => {
    setFormData(prev => ({
      ...prev,
      symptoms: prev.symptoms.includes(symptomId)
        ? prev.symptoms.filter(s => s !== symptomId)
        : [...prev.symptoms, symptomId]
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Date */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Date
        </label>
        <input
          type="date"
          value={formData.date}
          onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          max={new Date().toISOString().split('T')[0]}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Mood */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          How are you feeling today?
        </label>
        <div className="flex justify-between gap-2">
          {MOOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFormData({ ...formData, mood: option.value as any })}
              className={`flex-1 py-3 rounded-xl text-center transition-all ${
                formData.mood === option.value
                  ? 'bg-primary-100 border-2 border-primary-500 scale-105'
                  : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
              }`}
            >
              <div className="text-3xl mb-1">{option.emoji}</div>
              <div className="text-xs text-gray-600">{option.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Energy Level */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Energy Level
        </label>
        <div className="flex justify-between gap-2">
          {ENERGY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFormData({ ...formData, energy: option.value as any })}
              className={`flex-1 py-3 rounded-xl text-center transition-all ${
                formData.energy === option.value
                  ? 'bg-green-100 border-2 border-green-500'
                  : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
              }`}
            >
              <div className="h-6 w-full bg-gray-200 rounded-full overflow-hidden mb-1">
                <div className={`h-full bg-green-500 ${option.fill}`}></div>
              </div>
              <div className="text-xs text-gray-600">{option.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Sleep */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Hours of Sleep
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="12"
              step="0.5"
              value={formData.sleep_hours}
              onChange={(e) => setFormData({ ...formData, sleep_hours: parseFloat(e.target.value) })}
              className="flex-1"
            />
            <span className="w-12 text-center font-medium">{formData.sleep_hours}h</span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Sleep Quality
          </label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setFormData({ ...formData, sleep_quality: val as any })}
                className={`flex-1 py-2 rounded text-lg ${
                  formData.sleep_quality >= val
                    ? 'text-yellow-500'
                    : 'text-gray-300'
                }`}
              >
                ⭐
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Symptoms */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Any symptoms? (select all that apply)
        </label>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {COMMON_SYMPTOMS.map((symptom) => (
            <button
              key={symptom.id}
              type="button"
              onClick={() => toggleSymptom(symptom.id)}
              className={`p-2 rounded-lg text-center transition-all ${
                formData.symptoms.includes(symptom.id)
                  ? 'bg-red-100 border-2 border-red-400'
                  : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
              }`}
            >
              <div className="text-xl">{symptom.icon}</div>
              <div className="text-xs mt-1">{symptom.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Additional Notes (optional)
        </label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="How was your day? Any triggers or concerns?"
          rows={3}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Saving...' : 'Save Entry'}
        </button>
      </div>
    </form>
  )
}

// ============================================================================
// DIARY ENTRY CARD
// ============================================================================

function DiaryEntryCard({ 
  entry, 
  onEdit, 
  onDelete 
}: { 
  entry: DiaryEntry
  onEdit: () => void
  onDelete: () => void
}) {
  const moodOption = MOOD_OPTIONS.find(m => m.value === entry.mood)
  const symptoms = entry.symptoms.map(s => COMMON_SYMPTOMS.find(cs => cs.id === s)).filter(Boolean)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-sm text-gray-500">
            {new Date(entry.date).toLocaleDateString('en-US', { 
              weekday: 'long', 
              month: 'short', 
              day: 'numeric' 
            })}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl">{moodOption?.emoji}</span>
            <span className="font-medium text-gray-900">{moodOption?.label}</span>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={onEdit}
            className="p-2 text-gray-400 hover:text-primary-600 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center p-2 bg-gray-50 rounded-lg">
          <div className="text-xs text-gray-500">Energy</div>
          <div className="font-medium">{entry.energy}/5</div>
        </div>
        <div className="text-center p-2 bg-gray-50 rounded-lg">
          <div className="text-xs text-gray-500">Sleep</div>
          <div className="font-medium">{entry.sleep_hours}h</div>
        </div>
        <div className="text-center p-2 bg-gray-50 rounded-lg">
          <div className="text-xs text-gray-500">Quality</div>
          <div className="font-medium">{entry.sleep_quality}/5 ⭐</div>
        </div>
      </div>

      {symptoms.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {symptoms.map((s) => (
            <span 
              key={s!.id}
              className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 rounded-full text-xs"
            >
              {s!.icon} {s!.label}
            </span>
          ))}
        </div>
      )}

      {entry.notes && (
        <p className="text-sm text-gray-600 italic">"{entry.notes}"</p>
      )}
    </div>
  )
}

// ============================================================================
// MAIN DIARY PAGE
// ============================================================================

export default function DiaryPage() {
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState<DiaryEntry | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Load entries
  useEffect(() => {
    const loadEntries = async () => {
      try {
        const res = await fetch('/api/patient/diary')
        if (res.ok) {
          const data = await res.json()
          setEntries(data.entries || [])
        }
      } catch (error) {
        console.error('Failed to load diary entries:', error)
      } finally {
        setLoading(false)
      }
    }
    loadEntries()
  }, [])

  // Check if today has an entry
  const todayEntry = entries.find(e => e.date === new Date().toISOString().split('T')[0])

  // Handle submit
  const handleSubmit = async (data: Omit<DiaryEntry, 'id' | 'created_at'>) => {
    setIsSubmitting(true)
    try {
      const url = editingEntry 
        ? `/api/patient/diary/${editingEntry.id}`
        : '/api/patient/diary'
      
      const res = await fetch(url, {
        method: editingEntry ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      if (res.ok) {
        const result = await res.json()
        if (editingEntry) {
          setEntries(prev => prev.map(e => e.id === editingEntry.id ? result.entry : e))
        } else {
          setEntries(prev => [result.entry, ...prev])
        }
        setShowForm(false)
        setEditingEntry(null)
      }
    } catch (error) {
      console.error('Failed to save entry:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle delete
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/patient/diary/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setEntries(prev => prev.filter(e => e.id !== id))
      }
    } catch (error) {
      console.error('Failed to delete entry:', error)
    }
    setDeleteConfirm(null)
  }

  // Calculate weekly stats
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const weekEntries = entries.filter(e => new Date(e.date) >= weekAgo)
  const avgMood = weekEntries.length > 0 
    ? (weekEntries.reduce((sum, e) => sum + e.mood, 0) / weekEntries.length).toFixed(1)
    : '-'
  const avgSleep = weekEntries.length > 0
    ? (weekEntries.reduce((sum, e) => sum + e.sleep_hours, 0) / weekEntries.length).toFixed(1)
    : '-'

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">How Do You Feel?</h1>
          <p className="text-gray-600 mt-1">Track your daily health and wellbeing</p>
        </div>
        {!showForm && !todayEntry && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Log Today
          </button>
        )}
      </div>

      {/* Weekly Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-primary-600">{weekEntries.length}</div>
          <div className="text-sm text-gray-600">Entries This Week</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{avgMood}</div>
          <div className="text-sm text-gray-600">Avg Mood</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{avgSleep}h</div>
          <div className="text-sm text-gray-600">Avg Sleep</div>
        </div>
      </div>

      {/* Form */}
      {(showForm || editingEntry) && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">
            {editingEntry ? 'Edit Entry' : "Today's Check-in"}
          </h2>
          <DiaryForm
            initialData={editingEntry || undefined}
            onSubmit={handleSubmit}
            onCancel={() => {
              setShowForm(false)
              setEditingEntry(null)
            }}
            isSubmitting={isSubmitting}
          />
        </div>
      )}

      {/* Today's Entry Prompt */}
      {!showForm && todayEntry && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-3xl">{MOOD_OPTIONS.find(m => m.value === todayEntry.mood)?.emoji}</div>
            <div>
              <div className="font-medium text-green-800">You've logged today!</div>
              <div className="text-sm text-green-600">
                Feeling {MOOD_OPTIONS.find(m => m.value === todayEntry.mood)?.label.toLowerCase()}
              </div>
            </div>
          </div>
          <button
            onClick={() => setEditingEntry(todayEntry)}
            className="text-sm text-green-700 hover:text-green-900"
          >
            Edit
          </button>
        </div>
      )}

      {/* Entries List */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Entries</h2>
        {entries.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl">
            <div className="text-4xl mb-3">📔</div>
            <p className="text-gray-600 mb-4">No entries yet. Start tracking how you feel!</p>
            <button
              onClick={() => setShowForm(true)}
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              Create your first entry →
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <DiaryEntryCard
                key={entry.id}
                entry={entry}
                onEdit={() => setEditingEntry(entry)}
                onDelete={() => setDeleteConfirm(entry.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Delete Entry"
        message="Are you sure you want to delete this diary entry? This action cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  )
}
