/**
 * useClinicPeers — React hook for LAN peer management
 *
 * Provides list of connected clinic devices, their roles,
 * and sync status with each peer.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  getOnlinePeers,
  onPeersChanged,
  getPeersByRole,
  registerManualPeer,
  type PeerDevice,
} from '@shared/lib/offline/lan-discovery'
import { syncWithPeer } from '@shared/lib/offline/lan-sync'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ClinicPeer {
  deviceId: string
  name: string
  role: string
  roleLabel: string // Arabic role label
  ipAddress: string
  isOnline: boolean
  lastSeen: string
  lastSeenLabel: string // "منذ ٣ دقائق"
}

export interface UseClinicPeersReturn {
  /** All online peers */
  peers: ClinicPeer[]
  /** Number of online peers */
  peerCount: number
  /** Doctors currently online */
  doctors: ClinicPeer[]
  /** Front desk staff currently online */
  frontDesk: ClinicPeer[]
  /** Assistants currently online */
  assistants: ClinicPeer[]
  /** Sync with a specific peer */
  syncWithDevice: (deviceId: string) => Promise<void>
  /** Add a peer manually by IP */
  addPeerByIP: (ip: string, port?: number) => void
  /** Whether any peer is available */
  hasPeers: boolean
}

// ─── Arabic Labels ───────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  doctor: 'طبيب',
  frontdesk: 'استقبال',
  front_desk: 'استقبال',
  assistant: 'مساعد',
  admin: 'مدير',
  owner: 'مالك',
  patient: 'مريض',
}

function getRoleLabel(role: string): string {
  return ROLE_LABELS[role.toLowerCase()] || role
}

function getTimeSinceLabel(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)

  if (seconds < 10) return 'الآن'
  if (seconds < 60) return `منذ ${seconds} ثانية`
  if (minutes < 60) return `منذ ${minutes} دقيقة`
  return `منذ أكثر من ساعة`
}

function mapPeer(peer: PeerDevice): ClinicPeer {
  return {
    deviceId: peer.deviceId,
    name: peer.userName,
    role: peer.role,
    roleLabel: getRoleLabel(peer.role),
    ipAddress: peer.ipAddress,
    isOnline: peer.isOnline,
    lastSeen: peer.lastSeen,
    lastSeenLabel: getTimeSinceLabel(peer.lastSeen),
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useClinicPeers(): UseClinicPeersReturn {
  const [peers, setPeers] = useState<ClinicPeer[]>([])

  useEffect(() => {
    // Initial load
    setPeers(getOnlinePeers().map(mapPeer))

    // Subscribe to changes
    const unsubscribe = onPeersChanged((peerDevices) => {
      setPeers(peerDevices.map(mapPeer))
    })

    // Update time labels every 10 seconds
    const timer = setInterval(() => {
      setPeers((current) =>
        current.map((p) => ({
          ...p,
          lastSeenLabel: getTimeSinceLabel(p.lastSeen),
        }))
      )
    }, 10_000)

    return () => {
      unsubscribe()
      clearInterval(timer)
    }
  }, [])

  const syncWithDevice = useCallback(async (deviceId: string) => {
    await syncWithPeer(deviceId)
  }, [])

  const addPeerByIP = useCallback((ip: string, port?: number) => {
    registerManualPeer(ip, port)
  }, [])

  const doctors = peers.filter((p) => p.role === 'doctor')
  const frontDesk = peers.filter((p) => ['frontdesk', 'front_desk'].includes(p.role))
  const assistants = peers.filter((p) => p.role === 'assistant')

  return {
    peers,
    peerCount: peers.length,
    doctors,
    frontDesk,
    assistants,
    syncWithDevice,
    addPeerByIP,
    hasPeers: peers.length > 0,
  }
}

export default useClinicPeers
