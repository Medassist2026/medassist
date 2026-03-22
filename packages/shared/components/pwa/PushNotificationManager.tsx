'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * PushNotificationManager
 *
 * Handles Web Push API subscription lifecycle:
 * 1. Checks if push is supported
 * 2. Requests notification permission
 * 3. Subscribes to push via VAPID
 * 4. Sends subscription to backend for storage
 *
 * The VAPID public key should be set as NEXT_PUBLIC_VAPID_PUBLIC_KEY env var.
 * Generate a VAPID key pair with: npx web-push generate-vapid-keys
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray as Uint8Array<ArrayBuffer>
}

interface PushNotificationManagerProps {
  /** User ID to associate the subscription with */
  userId?: string
  /** API endpoint to save the subscription */
  subscriptionEndpoint?: string
}

export function PushNotificationManager({
  userId,
  subscriptionEndpoint = '/api/push/subscribe',
}: PushNotificationManagerProps) {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return
    setPermission(Notification.permission)

    // Check existing subscription
    navigator.serviceWorker.ready.then((registration) => {
      registration.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(!!sub)
      })
    })

    // Show notification opt-in after delay if not decided
    if (Notification.permission === 'default') {
      const dismissed = localStorage.getItem('push-banner-dismissed')
      if (!dismissed || Date.now() - parseInt(dismissed, 10) > 14 * 24 * 60 * 60 * 1000) {
        setTimeout(() => setShowBanner(true), 30000) // Show after 30s
      }
    }
  }, [])

  const subscribe = useCallback(async () => {
    try {
      const result = await Notification.requestPermission()
      setPermission(result)

      if (result !== 'granted') {
        setShowBanner(false)
        return
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        console.warn('[Push] No VAPID public key configured')
        setShowBanner(false)
        return
      }

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      // Send subscription to backend
      await fetch(subscriptionEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userId,
        }),
      })

      setIsSubscribed(true)
      setShowBanner(false)
    } catch (err) {
      console.error('[Push] Subscription failed:', err)
    }
  }, [userId, subscriptionEndpoint])

  const dismissBanner = useCallback(() => {
    setShowBanner(false)
    localStorage.setItem('push-banner-dismissed', Date.now().toString())
  }, [])

  // Don't show if already subscribed, denied, or not supported
  if (!showBanner || isSubscribed || permission === 'denied') return null

  return (
    <div dir="rtl" className="fixed top-4 left-4 right-4 z-50 animate-slide-down">
      <div className="mx-auto max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 p-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 text-sm font-cairo">
              تفعيل الإشعارات
            </h3>
            <p className="text-xs text-gray-500 mt-1 font-cairo">
              احصل على تنبيهات فورية عند وصول مريض جديد أو تحديث مواعيد
            </p>
          </div>

          <button
            onClick={dismissBanner}
            className="shrink-0 p-1 text-gray-400 hover:text-gray-600"
            aria-label="إغلاق"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-2 mt-3">
          <button
            onClick={subscribe}
            className="flex-1 py-2 bg-[#22C55E] text-white rounded-xl font-semibold text-sm hover:bg-[#16A34A] transition-colors font-cairo"
          >
            تفعيل
          </button>
          <button
            onClick={dismissBanner}
            className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors font-cairo"
          >
            لاحقاً
          </button>
        </div>
      </div>
    </div>
  )
}
