'use client'

import { useEffect, useRef } from 'react'

// ============================================================================
// CONFIRM DIALOG COMPONENT (DS-003)
// Confirmation dialogs for destructive actions
// ============================================================================

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string | React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: 'primary' | 'danger' | 'warning'
  onConfirm: () => void
  onCancel: () => void
  isLoading?: boolean
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
  isLoading = false
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel()
      }
    }
    
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onCancel])

  // Focus confirm button when opened
  useEffect(() => {
    if (isOpen && confirmButtonRef.current) {
      confirmButtonRef.current.focus()
    }
  }, [isOpen])

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  const variantStyles = {
    primary: 'bg-primary-600 hover:bg-primary-700 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    warning: 'bg-yellow-600 hover:bg-yellow-700 text-white'
  }

  const variantIcons = {
    primary: (
      <svg className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    danger: (
      <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    warning: (
      <svg className="w-6 h-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    )
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 animate-fade-in"
        onClick={onCancel}
      />
      
      {/* Dialog */}
      <div 
        ref={dialogRef}
        className="relative bg-white rounded-xl shadow-xl max-w-md w-full animate-scale-in"
      >
        <div className="p-6">
          {/* Icon */}
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
            confirmVariant === 'danger' ? 'bg-red-100' :
            confirmVariant === 'warning' ? 'bg-yellow-100' :
            'bg-primary-100'
          }`}>
            {variantIcons[confirmVariant]}
          </div>

          {/* Title */}
          <h3 
            id="confirm-dialog-title"
            className="text-lg font-semibold text-gray-900 text-center mb-2"
          >
            {title}
          </h3>

          {/* Message */}
          <div className="text-gray-600 text-center mb-6">
            {message}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmButtonRef}
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={`flex-1 px-4 py-2 rounded-lg disabled:opacity-50 ${variantStyles[confirmVariant]}`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing...
                </span>
              ) : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// ALERT DIALOG (Simple notification)
// ============================================================================

interface AlertDialogProps {
  isOpen: boolean
  title: string
  message: string | React.ReactNode
  variant?: 'info' | 'success' | 'warning' | 'error'
  onClose: () => void
}

export function AlertDialog({
  isOpen,
  title,
  message,
  variant = 'info',
  onClose
}: AlertDialogProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const variantStyles = {
    info: { bg: 'bg-blue-100', icon: 'text-blue-600', button: 'bg-blue-600 hover:bg-blue-700' },
    success: { bg: 'bg-green-100', icon: 'text-green-600', button: 'bg-green-600 hover:bg-green-700' },
    warning: { bg: 'bg-yellow-100', icon: 'text-yellow-600', button: 'bg-yellow-600 hover:bg-yellow-700' },
    error: { bg: 'bg-red-100', icon: 'text-red-600', button: 'bg-red-600 hover:bg-red-700' }
  }

  const icons = {
    info: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    success: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    error: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }

  const style = variantStyles[variant]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full animate-scale-in p-6">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${style.bg}`}>
          <span className={style.icon}>{icons[variant]}</span>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">{title}</h3>
        <div className="text-gray-600 text-center mb-6">{message}</div>
        <button
          onClick={onClose}
          className={`w-full px-4 py-2 rounded-lg text-white ${style.button}`}
        >
          OK
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// PROMPT DIALOG (Input confirmation)
// ============================================================================

interface PromptDialogProps {
  isOpen: boolean
  title: string
  message: string
  placeholder?: string
  defaultValue?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

export function PromptDialog({
  isOpen,
  title,
  message,
  placeholder = '',
  defaultValue = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, defaultValue])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onConfirm(value)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full animate-scale-in p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-600 mb-4">{message}</p>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 mb-4"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// HOOK FOR EASY USE
// ============================================================================

import { useState, useCallback } from 'react'

interface UseConfirmOptions {
  title: string
  message: string | React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'primary' | 'danger' | 'warning'
}

export function useConfirm() {
  const [state, setState] = useState<{
    isOpen: boolean
    options: UseConfirmOptions | null
    resolve: ((value: boolean) => void) | null
  }>({
    isOpen: false,
    options: null,
    resolve: null
  })

  const confirm = useCallback((options: UseConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        options,
        resolve
      })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    setState((prev) => {
      prev.resolve?.(true)
      return { isOpen: false, options: null, resolve: null }
    })
  }, [])

  const handleCancel = useCallback(() => {
    setState((prev) => {
      prev.resolve?.(false)
      return { isOpen: false, options: null, resolve: null }
    })
  }, [])

  const ConfirmDialogComponent = state.options ? (
    <ConfirmDialog
      isOpen={state.isOpen}
      title={state.options.title}
      message={state.options.message}
      confirmLabel={state.options.confirmLabel}
      cancelLabel={state.options.cancelLabel}
      confirmVariant={state.options.variant}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null

  return { confirm, ConfirmDialog: ConfirmDialogComponent }
}
