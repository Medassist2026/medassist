/**
 * lan-discovery.ts — LAN Peer Discovery
 *
 * Discovers other MedAssist devices on the same clinic WiFi network.
 * Uses Capacitor's UDP plugin for broadcast-based discovery on native,
 * and falls back to a registration endpoint on web.
 *
 * Each device broadcasts its presence every 10 seconds with:
 * - Device ID (unique per installation)
 * - Clinic ID (to filter same-clinic peers)
 * - Role (doctor / frontdesk / assistant)
 * - HTTP port (for LAN sync API)
 * - Timestamp
 *
 * Peers that haven't been seen in 30 seconds are considered offline.
 */

import { Capacitor } from '@capacitor/core'
import { generateId, now } from './local-db'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PeerDevice {
  deviceId: string
  clinicId: string
  role: string
  userName: string
  ipAddress: string
  httpPort: number
  lastSeen: string
  isOnline: boolean
  syncCapabilities: string[] // ['queue', 'patients', 'appointments', ...]
}

export interface DiscoveryConfig {
  clinicId: string
  role: string
  userName: string
  httpPort: number
  broadcastIntervalMs: number
  peerTimeoutMs: number
}

export interface DiscoveryMessage {
  type: 'MEDASSIST_PEER_ANNOUNCE' | 'MEDASSIST_PEER_GOODBYE'
  deviceId: string
  clinicId: string
  role: string
  userName: string
  httpPort: number
  syncCapabilities: string[]
  timestamp: string
  version: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BROADCAST_PORT = 41234
const DISCOVERY_PROTOCOL_VERSION = '1.0'
const DEFAULT_HTTP_PORT = 8384
const BROADCAST_INTERVAL = 10_000 // 10 seconds
const PEER_TIMEOUT = 30_000 // 30 seconds — peer considered offline
const SYNC_CAPABILITIES = [
  'queue',
  'patients',
  'appointments',
  'clinical_notes',
  'payments',
  'doctor_availability',
]

// ─── State ───────────────────────────────────────────────────────────────────

let deviceId: string | null = null
let config: DiscoveryConfig | null = null
let broadcastTimer: ReturnType<typeof setInterval> | null = null
let cleanupTimer: ReturnType<typeof setInterval> | null = null
let isRunning = false

// Peer registry — key is deviceId
const peers = new Map<string, PeerDevice>()
const peerListeners = new Set<(peers: PeerDevice[]) => void>()

// ─── Device Identity ─────────────────────────────────────────────────────────

/**
 * Get or create a persistent device ID.
 * Stored in localStorage for web, Preferences plugin for native.
 */
function getDeviceId(): string {
  if (deviceId) return deviceId

  const STORAGE_KEY = 'medassist_device_id'

  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      deviceId = stored
      return stored
    }
  }

  deviceId = `device_${generateId()}`

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, deviceId)
  }

  return deviceId
}

// ─── Peer Management ─────────────────────────────────────────────────────────

function notifyListeners(): void {
  const peerList = getOnlinePeers()
  peerListeners.forEach((fn) => fn(peerList))
}

/**
 * Process an incoming discovery message.
 */
function handlePeerMessage(message: DiscoveryMessage, senderIp: string): void {
  if (!config) return
  if (message.type === 'MEDASSIST_PEER_GOODBYE') {
    peers.delete(message.deviceId)
    notifyListeners()
    return
  }

  // Only accept peers from same clinic
  if (message.clinicId !== config.clinicId) return

  // Don't track ourselves
  if (message.deviceId === getDeviceId()) return

  const peer: PeerDevice = {
    deviceId: message.deviceId,
    clinicId: message.clinicId,
    role: message.role,
    userName: message.userName,
    ipAddress: senderIp,
    httpPort: message.httpPort,
    lastSeen: now(),
    isOnline: true,
    syncCapabilities: message.syncCapabilities,
  }

  const isNew = !peers.has(message.deviceId)
  peers.set(message.deviceId, peer)

  if (isNew) {
    console.log(`[LAN] New peer discovered: ${peer.userName} (${peer.role}) at ${peer.ipAddress}:${peer.httpPort}`)
  }

  notifyListeners()
}

/**
 * Remove peers that haven't been seen recently.
 */
function cleanupStalePeers(): void {
  const cutoff = Date.now() - (config?.peerTimeoutMs || PEER_TIMEOUT)
  let changed = false

  for (const [id, peer] of peers) {
    const lastSeenMs = new Date(peer.lastSeen).getTime()
    if (lastSeenMs < cutoff) {
      peer.isOnline = false
      // Remove if offline for more than 2 minutes
      if (lastSeenMs < cutoff - 90_000) {
        peers.delete(id)
      }
      changed = true
    }
  }

  if (changed) notifyListeners()
}

// ─── Native UDP Discovery (Capacitor) ────────────────────────────────────────

/**
 * Start UDP broadcast discovery for native platforms.
 * Uses @anthropic-ai/capacitor-udp (alias for capacitor-udp plugin).
 */
async function startNativeDiscovery(): Promise<void> {
  // UDP plugin will be loaded dynamically on native platforms
  // This is a placeholder — actual implementation requires:
  // 1. @anthropic-ai/capacitor-udp plugin
  // 2. Network permissions in AndroidManifest.xml / Info.plist
  // 3. WiFi multicast lock on Android

  console.log('[LAN] Native UDP discovery — using HTTP fallback for now')
  await startWebDiscovery()
}

/**
 * Send a UDP broadcast announce message.
 */
function createAnnounceMessage(): DiscoveryMessage {
  return {
    type: 'MEDASSIST_PEER_ANNOUNCE',
    deviceId: getDeviceId(),
    clinicId: config!.clinicId,
    role: config!.role,
    userName: config!.userName,
    httpPort: config!.httpPort,
    syncCapabilities: SYNC_CAPABILITIES,
    timestamp: now(),
    version: DISCOVERY_PROTOCOL_VERSION,
  }
}

// ─── Web-Based Discovery (Fallback) ─────────────────────────────────────────

/**
 * Web fallback: Use a local HTTP polling approach.
 * Each device registers itself with a known endpoint,
 * and polls for other registered devices.
 *
 * This works when devices can reach each other via HTTP
 * but can't do UDP broadcast (browser limitation).
 */
async function startWebDiscovery(): Promise<void> {
  // In web mode, we'll use a simple approach:
  // 1. Try to reach known LAN IPs (configured or from last session)
  // 2. Each device exposes GET /api/lan/announce on its HTTP port
  // 3. Poll known peers every broadcast interval

  const knownPeers = getKnownPeerIPs()

  broadcastTimer = setInterval(async () => {
    for (const peerUrl of knownPeers) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 2000)

        const res = await fetch(`${peerUrl}/api/lan/announce`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createAnnounceMessage()),
          signal: controller.signal,
        })
        clearTimeout(timeout)

        if (res.ok) {
          const peerData = await res.json() as DiscoveryMessage
          const url = new URL(peerUrl)
          handlePeerMessage(peerData, url.hostname)
        }
      } catch {
        // Peer not reachable — will be cleaned up by stalePeers timer
      }
    }
  }, config?.broadcastIntervalMs || BROADCAST_INTERVAL)
}

/**
 * Get known peer IPs from localStorage.
 * These are IPs that were discovered in previous sessions.
 */
function getKnownPeerIPs(): string[] {
  if (typeof localStorage === 'undefined') return []

  try {
    const stored = localStorage.getItem('medassist_known_peers')
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

/**
 * Save discovered peer IPs for future sessions.
 */
function saveKnownPeerIPs(): void {
  if (typeof localStorage === 'undefined') return

  const ips = Array.from(peers.values())
    .filter((p) => p.isOnline)
    .map((p) => `http://${p.ipAddress}:${p.httpPort}`)

  localStorage.setItem('medassist_known_peers', JSON.stringify(ips))
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Start peer discovery.
 */
export async function startDiscovery(discoveryConfig: DiscoveryConfig): Promise<void> {
  if (isRunning) return

  config = discoveryConfig
  isRunning = true
  getDeviceId()

  console.log(`[LAN] Starting discovery for clinic ${config.clinicId} as ${config.role}`)

  // Start peer cleanup timer
  cleanupTimer = setInterval(cleanupStalePeers, 5000)

  // Start platform-specific discovery
  if (Capacitor.isNativePlatform()) {
    await startNativeDiscovery()
  } else {
    await startWebDiscovery()
  }
}

/**
 * Stop peer discovery and announce departure.
 */
export async function stopDiscovery(): Promise<void> {
  if (!isRunning) return

  // Save known peers before stopping
  saveKnownPeerIPs()

  // Send goodbye to known peers
  const goodbyeMsg: DiscoveryMessage = {
    ...createAnnounceMessage(),
    type: 'MEDASSIST_PEER_GOODBYE',
  }

  for (const peer of peers.values()) {
    try {
      await fetch(`http://${peer.ipAddress}:${peer.httpPort}/api/lan/announce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(goodbyeMsg),
      }).catch(() => {}) // Best effort
    } catch {
      // Ignore
    }
  }

  if (broadcastTimer) {
    clearInterval(broadcastTimer)
    broadcastTimer = null
  }
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }

  peers.clear()
  isRunning = false
  console.log('[LAN] Discovery stopped')
}

/**
 * Get all currently online peers.
 */
export function getOnlinePeers(): PeerDevice[] {
  return Array.from(peers.values()).filter((p) => p.isOnline)
}

/**
 * Get peers by role.
 */
export function getPeersByRole(role: string): PeerDevice[] {
  return getOnlinePeers().filter((p) => p.role === role)
}

/**
 * Check if any peers are available.
 */
export function hasLANPeers(): boolean {
  return getOnlinePeers().length > 0
}

/**
 * Get a specific peer's HTTP base URL.
 */
export function getPeerUrl(deviceId: string): string | null {
  const peer = peers.get(deviceId)
  if (!peer || !peer.isOnline) return null
  return `http://${peer.ipAddress}:${peer.httpPort}`
}

/**
 * Subscribe to peer list changes.
 */
export function onPeersChanged(listener: (peers: PeerDevice[]) => void): () => void {
  peerListeners.add(listener)
  return () => peerListeners.delete(listener)
}

/**
 * Manually register a peer (e.g. from QR code scan or manual IP entry).
 */
export function registerManualPeer(
  ipAddress: string,
  httpPort: number = DEFAULT_HTTP_PORT
): void {
  const url = `http://${ipAddress}:${httpPort}`
  const known = getKnownPeerIPs()
  if (!known.includes(url)) {
    known.push(url)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('medassist_known_peers', JSON.stringify(known))
    }
  }
}

/**
 * Handle an incoming announce request (called by the LAN HTTP server).
 */
export function handleIncomingAnnounce(
  message: DiscoveryMessage,
  senderIp: string
): DiscoveryMessage {
  handlePeerMessage(message, senderIp)
  return createAnnounceMessage()
}

export {
  BROADCAST_PORT,
  DEFAULT_HTTP_PORT,
  SYNC_CAPABILITIES,
  getDeviceId,
}
