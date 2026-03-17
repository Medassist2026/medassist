'use client'

import { useState, useEffect, useRef } from 'react'
import { ConfirmDialog } from '@shared/components/ui/ConfirmDialog'
import Image from 'next/image'

// ============================================================================
// TYPES
// ============================================================================

interface LabResult {
  id: string
  test_name: string
  test_date: string
  result_value?: string
  result_unit?: string
  reference_range?: string
  status: 'normal' | 'abnormal' | 'critical' | 'pending'
  lab_name?: string
  notes?: string
  attachments: string[]
  source: 'doctor' | 'manual'
  created_at: string
}

// ============================================================================
// PHOTO UPLOAD COMPONENT
// ============================================================================

interface PhotoUploadProps {
  images: string[]
  onImagesChange: (images: string[]) => void
  maxImages?: number
}

function PhotoUpload({ images, onImagesChange, maxImages = 5 }: PhotoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    const newImages: string[] = []

    for (let i = 0; i < files.length && images.length + newImages.length < maxImages; i++) {
      const file = files[i]
      
      // Validate file type
      if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
        alert('Please upload images or PDF files only')
        continue
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB')
        continue
      }

      try {
        // Convert to base64 for preview (in production, upload to cloud storage)
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.readAsDataURL(file)
        })
        newImages.push(base64)
      } catch (error) {
        console.error('Failed to process file:', error)
      }
    }

    onImagesChange([...images, ...newImages])
    setUploading(false)
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeImage = (index: number) => {
    onImagesChange(images.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      {/* Preview Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((img, index) => (
            <div key={index} className="relative group">
              {img.includes('application/pdf') ? (
                <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center">
                  <svg className="w-8 h-8 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zM6 4h6v6h6v10H6V4z"/>
                  </svg>
                  <span className="text-xs text-gray-500 mt-1">PDF</span>
                </div>
              ) : (
                <div className="relative aspect-square">
                  <Image
                    src={img}
                    alt={`Attachment ${index + 1}`}
                    fill
                    unoptimized
                    className="object-cover rounded-lg"
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="absolute top-1 right-1 w-6 h-6 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload Button */}
      {images.length < maxImages && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full py-6 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-colors flex flex-col items-center gap-2"
          >
            {uploading ? (
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
            ) : (
              <>
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Upload photos or PDF</span>
                <span className="text-xs">Max {maxImages} files, 5MB each</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// ADD LAB RESULT FORM
// ============================================================================

interface AddLabResultFormProps {
  onSubmit: (data: Partial<LabResult>) => Promise<void>
  onCancel: () => void
  isSubmitting: boolean
}

function AddLabResultForm({ onSubmit, onCancel, isSubmitting }: AddLabResultFormProps) {
  const [formData, setFormData] = useState({
    test_name: '',
    test_date: new Date().toISOString().split('T')[0],
    result_value: '',
    result_unit: '',
    reference_range: '',
    status: 'normal' as 'normal' | 'abnormal' | 'critical' | 'pending',
    lab_name: '',
    notes: '',
    attachments: [] as string[]
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const commonTests = [
    'Complete Blood Count (CBC)',
    'Basic Metabolic Panel',
    'Comprehensive Metabolic Panel',
    'Lipid Panel',
    'Thyroid Panel (TSH, T3, T4)',
    'Hemoglobin A1C',
    'Liver Function Tests',
    'Kidney Function Tests',
    'Urinalysis',
    'Vitamin D',
    'Vitamin B12',
    'Iron Panel',
    'COVID-19 PCR',
    'Other'
  ]

  const validate = () => {
    const newErrors: Record<string, string> = {}
    if (!formData.test_name.trim()) newErrors.test_name = 'Test name is required'
    if (!formData.test_date) newErrors.test_date = 'Test date is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    await onSubmit({
      ...formData,
      source: 'manual'
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Test Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Test Name *
        </label>
        <select
          value={commonTests.includes(formData.test_name) ? formData.test_name : 'Other'}
          onChange={(e) => setFormData({ 
            ...formData, 
            test_name: e.target.value === 'Other' ? '' : e.target.value 
          })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 mb-2"
        >
          <option value="">Select a test...</option>
          {commonTests.map(test => (
            <option key={test} value={test}>{test}</option>
          ))}
        </select>
        {(formData.test_name === '' || !commonTests.includes(formData.test_name)) && (
          <input
            type="text"
            value={formData.test_name}
            onChange={(e) => setFormData({ ...formData, test_name: e.target.value })}
            placeholder="Enter custom test name..."
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 ${
              errors.test_name ? 'border-red-300' : 'border-gray-300'
            }`}
          />
        )}
        {errors.test_name && <p className="text-sm text-red-600 mt-1">{errors.test_name}</p>}
      </div>

      {/* Test Date */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Test Date *
        </label>
        <input
          type="date"
          value={formData.test_date}
          onChange={(e) => setFormData({ ...formData, test_date: e.target.value })}
          max={new Date().toISOString().split('T')[0]}
          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 ${
            errors.test_date ? 'border-red-300' : 'border-gray-300'
          }`}
        />
        {errors.test_date && <p className="text-sm text-red-600 mt-1">{errors.test_date}</p>}
      </div>

      {/* Result Value & Unit */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Result Value
          </label>
          <input
            type="text"
            value={formData.result_value}
            onChange={(e) => setFormData({ ...formData, result_value: e.target.value })}
            placeholder="e.g., 120, 5.5, Negative"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Unit
          </label>
          <input
            type="text"
            value={formData.result_unit}
            onChange={(e) => setFormData({ ...formData, result_unit: e.target.value })}
            placeholder="e.g., mg/dL, mmol/L"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Reference Range & Status */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reference Range
          </label>
          <input
            type="text"
            value={formData.reference_range}
            onChange={(e) => setFormData({ ...formData, reference_range: e.target.value })}
            placeholder="e.g., 70-100"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="normal">Normal</option>
            <option value="abnormal">Abnormal</option>
            <option value="critical">Critical</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>

      {/* Lab Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Lab Name (optional)
        </label>
        <input
          type="text"
          value={formData.lab_name}
          onChange={(e) => setFormData({ ...formData, lab_name: e.target.value })}
          placeholder="e.g., Quest Diagnostics, Al Borg Lab"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notes (optional)
        </label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Any additional notes..."
          rows={2}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Photo Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Attachments (optional)
        </label>
        <PhotoUpload
          images={formData.attachments}
          onImagesChange={(images) => setFormData({ ...formData, attachments: images })}
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
          {isSubmitting ? 'Saving...' : 'Save Lab Result'}
        </button>
      </div>
    </form>
  )
}

// ============================================================================
// LAB RESULT CARD
// ============================================================================

function LabResultCard({ 
  result, 
  onEdit, 
  onDelete 
}: { 
  result: LabResult
  onEdit: () => void
  onDelete: () => void
}) {
  const [showAttachments, setShowAttachments] = useState(false)

  const statusStyles = {
    normal: 'bg-green-100 text-green-800',
    abnormal: 'bg-yellow-100 text-yellow-800',
    critical: 'bg-red-100 text-red-800',
    pending: 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold">{result.test_name}</h4>
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusStyles[result.status]}`}>
              {result.status.charAt(0).toUpperCase() + result.status.slice(1)}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {result.source === 'doctor' ? '👨‍⚕️ From Doctor' : '✏️ Manual'}
            </span>
          </div>

          <div className="text-sm text-gray-600 mt-2">
            {result.result_value && (
              <span className="font-medium text-gray-900">
                {result.result_value} {result.result_unit}
              </span>
            )}
            {result.reference_range && (
              <span className="text-gray-500 ml-2">
                (Ref: {result.reference_range})
              </span>
            )}
          </div>

          <div className="text-xs text-gray-500 mt-2">
            {new Date(result.test_date).toLocaleDateString()}
            {result.lab_name && ` · ${result.lab_name}`}
          </div>

          {result.notes && (
            <p className="text-sm text-gray-600 mt-2 italic">"{result.notes}"</p>
          )}

          {/* Attachments */}
          {result.attachments.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setShowAttachments(!showAttachments)}
                className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                {result.attachments.length} attachment{result.attachments.length !== 1 ? 's' : ''}
              </button>
              
              {showAttachments && (
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {result.attachments.map((img, idx) => (
                    <a
                      key={idx}
                      href={img}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <Image
                        src={img}
                        alt={`Attachment ${idx + 1}`}
                        width={120}
                        height={120}
                        unoptimized
                        className="aspect-square object-cover rounded-lg hover:opacity-80 w-full h-auto"
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
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
    </div>
  )
}

// ============================================================================
// MAIN LAB RESULTS PAGE
// ============================================================================

export default function LabResultsPage() {
  const [results, setResults] = useState<LabResult[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<LabResult | null>(null)

  // Load results
  useEffect(() => {
    const loadResults = async () => {
      try {
        const res = await fetch('/api/patient/labs')
        if (res.ok) {
          const data = await res.json()
          setResults(data.results || [])
        }
      } catch (error) {
        console.error('Failed to load lab results:', error)
      } finally {
        setLoading(false)
      }
    }
    loadResults()
  }, [])

  // Handle add
  const handleAdd = async (data: Partial<LabResult>) => {
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/patient/labs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (res.ok) {
        const result = await res.json()
        setResults(prev => [result.lab, ...prev])
        setShowAddForm(false)
      }
    } catch (error) {
      console.error('Failed to add lab result:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle delete
  const handleDelete = async (result: LabResult) => {
    try {
      const res = await fetch(`/api/patient/labs/${result.id}`, { method: 'DELETE' })
      if (res.ok) {
        setResults(prev => prev.filter(r => r.id !== result.id))
      }
    } catch (error) {
      console.error('Failed to delete lab result:', error)
    }
    setDeleteConfirm(null)
  }

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
          <h1 className="text-2xl font-bold text-gray-900">Lab Results</h1>
          <p className="text-gray-600 mt-1">Track your lab tests and results</p>
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Lab Result
          </button>
        )}
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Add Lab Result</h2>
          <AddLabResultForm
            onSubmit={handleAdd}
            onCancel={() => setShowAddForm(false)}
            isSubmitting={isSubmitting}
          />
        </div>
      )}

      {/* Results List */}
      {results.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <div className="text-4xl mb-3">🧪</div>
          <p className="text-gray-600 mb-4">No lab results yet</p>
          <button
            onClick={() => setShowAddForm(true)}
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            Add your first lab result →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {results.map((result) => (
            <LabResultCard
              key={result.id}
              result={result}
              onEdit={() => {/* TODO: Edit */}}
              onDelete={() => setDeleteConfirm(result)}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Delete Lab Result"
        message={`Are you sure you want to delete "${deleteConfirm?.test_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  )
}
