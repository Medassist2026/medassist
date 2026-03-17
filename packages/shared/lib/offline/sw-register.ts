'use client'

import { useEffect } from 'react'

export function registerServiceWorker() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
        console.warn('Service worker registration failed:', error)
      })
    })
  }
}

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    registerServiceWorker()
  }, [])
  return null
}
