import type { AdminSession, SchoolColorScheme } from './api'

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

// The last-seen name and colors of each school, so a page load paints in the
// school's theme right away instead of the default colors (and the raw
// school id as the title) until the school record loads.
export interface SchoolAppearance {
  name: string
  title: string
  color_scheme: SchoolColorScheme
}

const schoolAppearanceStorageKey = 'juise-rider-admin-dashboard.school-appearance'

export function readSchoolAppearance(schoolId: string): SchoolAppearance | null {
  if (!schoolId) {
    return null
  }
  const stored = readJson<Record<string, SchoolAppearance>>(schoolAppearanceStorageKey)
  const appearance = stored?.[schoolId]
  return appearance && typeof appearance === 'object' ? appearance : null
}

export function writeSchoolAppearance(schoolId: string, appearance: SchoolAppearance) {
  if (!schoolId) {
    return
  }
  try {
    const stored = readJson<Record<string, SchoolAppearance>>(schoolAppearanceStorageKey) ?? {}
    stored[schoolId] = {
      name: appearance.name ?? '',
      title: appearance.title ?? '',
      color_scheme: appearance.color_scheme ?? {},
    }
    window.localStorage.setItem(schoolAppearanceStorageKey, JSON.stringify(stored))
  } catch {
    // Storage full or unavailable: the theme just loads a moment later.
  }
}
