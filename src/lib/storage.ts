import type { AdminSession } from './api'

export interface DashboardContext {
  managedAppId: string
}

const sessionStorageKey = 'juise-rider-admin-dashboard.session'
const contextStorageKey = 'juise-rider-admin-dashboard.context'
const managedAppFallbackIds = new Set([
  '',
  'juise_rider_admin_dashboard',
  'juise-admin-app',
])

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return null
    }
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function readDashboardSession(): AdminSession | null {
  return readJson<AdminSession>(sessionStorageKey)
}

export function writeDashboardSession(session: AdminSession) {
  window.localStorage.setItem(sessionStorageKey, JSON.stringify(session))
}

export function clearDashboardSession() {
  window.localStorage.removeItem(sessionStorageKey)
}

export function readDashboardContext(defaultManagedAppId: string): DashboardContext {
  const stored = readJson<DashboardContext>(contextStorageKey)
  const fallbackManagedAppId = defaultManagedAppId.trim() || 'juise-customer-app'
  const storedManagedAppId = stored?.managedAppId?.trim() ?? ''
  return {
    managedAppId: managedAppFallbackIds.has(storedManagedAppId)
      ? fallbackManagedAppId
      : storedManagedAppId,
  }
}

export function writeDashboardContext(context: DashboardContext) {
  window.localStorage.setItem(contextStorageKey, JSON.stringify(context))
}
