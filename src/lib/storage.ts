import type { AdminSession } from './api'

export interface DashboardContext {
  managedAppId: string
}

const sessionStorageKey = 'juise-rider-admin-dashboard.session'
const contextStorageKey = 'juise-rider-admin-dashboard.context'

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
  return {
    managedAppId: stored?.managedAppId || defaultManagedAppId,
  }
}

export function writeDashboardContext(context: DashboardContext) {
  window.localStorage.setItem(contextStorageKey, JSON.stringify(context))
}
