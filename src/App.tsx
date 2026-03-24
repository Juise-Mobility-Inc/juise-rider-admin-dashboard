import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  approveReservation,
  createSchoolPack,
  createSchoolAdminAccount,
  denyReservation,
  fetchPendingReservations,
  fetchSchool,
  fetchSchools,
  fetchStudentProfile,
  loginWithIdentifier,
  saveSchool,
  saveSchoolTerms,
  setApiSession,
  setSessionObserver,
  type AdminSession,
  type Pack,
  type PackSpotReservation,
  type School,
  type SchoolColorScheme,
  type SchoolTerm,
  type StudentProfileBundle,
} from './lib/api'
import { PackLocationPicker, type PackMapPoint } from './components/PackLocationPicker'
import {
  clearDashboardSession,
  readDashboardContext,
  readDashboardSession,
  writeDashboardContext,
  writeDashboardSession,
  type DashboardContext,
} from './lib/storage'

type Section = 'school' | 'terms' | 'packs' | 'reservations'
type BannerTone = 'success' | 'error' | 'info'
type AuthMode = 'login' | 'signup'

interface BannerState {
  tone: BannerTone
  message: string
}

interface SchoolDraft {
  school_id: string
  name: string
  title: string
  logo_url: string
  default_campus_id: string
  color_scheme: SchoolColorScheme
  metadata: string
  active: boolean
}

interface TermDraft {
  id: string
  term_uuid: string
  name: string
  start_date: string
  end_date: string
}

interface SignupFormState {
  school_id: string
  first: string
  last: string
  username: string
  email: string
  phone: string
  password: string
}

interface PackDraft {
  name: string
  description: string
  number_of_spots: string
  campus_id: string
  lat: string
  lng: string
}

const authAppId = import.meta.env.VITE_AUTH_APP_ID ?? 'juise_rider_admin_dashboard'
const defaultManagedAppId =
  import.meta.env.VITE_DEFAULT_MANAGED_APP_ID ?? 'juise-customer-app'
const juiseColors = {
  red: '#FF5C5C',
  green: '#27CC5E',
  mediumgreen: '#28AE4C',
  darkGreen: '#03200D',
  darkGrey: '#010C05',
  mediumGrey: '#1e2124',
  gold: '#EEC253',
  lightGrey: '#424549',
  text: '#E6EAE8',
  fadedText: '#b5b5b5',
  disabledText: '#999999',
}
const schoolColorHexPattern = /^#(?:[0-9a-fA-F]{6})$/
const defaultSchoolColorScheme: Required<SchoolColorScheme> = {
  primary: juiseColors.green,
  secondary: juiseColors.mediumGrey,
  accent: juiseColors.gold,
  background: juiseColors.darkGreen,
  text: juiseColors.text,
}
const schoolColorFields: Array<{
  key: keyof SchoolColorScheme
  label: string
  fallback: string
}> = [
  { key: 'primary', label: 'Primary', fallback: defaultSchoolColorScheme.primary },
  { key: 'secondary', label: 'Secondary', fallback: defaultSchoolColorScheme.secondary },
  { key: 'accent', label: 'Accent', fallback: defaultSchoolColorScheme.accent },
  { key: 'background', label: 'Background', fallback: defaultSchoolColorScheme.background },
  { key: 'text', label: 'Text', fallback: defaultSchoolColorScheme.text },
]
type SidebarThemeStyle = CSSProperties & Record<string, string>

function makeDraftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function prettyJson(value: Record<string, unknown> | Record<string, string> | undefined): string {
  if (!value || Object.keys(value).length === 0) {
    return '{}'
  }

  return JSON.stringify(value, null, 2)
}

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)))
}

function resolveHexColor(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? ''
  return schoolColorHexPattern.test(trimmed) ? trimmed.toLowerCase() : fallback
}

function hexToRgb(color: string): { r: number; g: number; b: number } {
  const normalized = resolveHexColor(color, '#000000').slice(1)
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function hexToRgba(color: string, alpha: number): string {
  const { r, g, b } = hexToRgb(color)
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`
}

function mixHexColors(base: string, tint: string, weight: number): string {
  const normalizedWeight = Math.min(1, Math.max(0, weight))
  const baseRgb = hexToRgb(base)
  const tintRgb = hexToRgb(tint)
  const r = clampChannel(baseRgb.r + (tintRgb.r - baseRgb.r) * normalizedWeight)
  const g = clampChannel(baseRgb.g + (tintRgb.g - baseRgb.g) * normalizedWeight)
  const b = clampChannel(baseRgb.b + (tintRgb.b - baseRgb.b) * normalizedWeight)
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

function getReadableTextColor(background: string): string {
  const { r, g, b } = hexToRgb(background)
  const [sr, sg, sb] = [r, g, b].map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * sr + 0.7152 * sg + 0.0722 * sb
  return luminance > 0.52 ? juiseColors.darkGrey : juiseColors.text
}

function normalizeSchoolColorScheme(value?: SchoolColorScheme): SchoolColorScheme {
  return {
    primary: resolveHexColor(value?.primary, defaultSchoolColorScheme.primary),
    secondary: resolveHexColor(value?.secondary, defaultSchoolColorScheme.secondary),
    accent: resolveHexColor(value?.accent, defaultSchoolColorScheme.accent),
    background: resolveHexColor(value?.background, defaultSchoolColorScheme.background),
    text: resolveHexColor(value?.text, defaultSchoolColorScheme.text),
  }
}

function getColorPickerValue(
  value: string | undefined,
  fallback: keyof typeof defaultSchoolColorScheme,
): string {
  return resolveHexColor(value, defaultSchoolColorScheme[fallback])
}

function createEmptySchoolDraft(): SchoolDraft {
  return {
    school_id: '',
    name: '',
    title: '',
    logo_url: '',
    default_campus_id: '',
    color_scheme: normalizeSchoolColorScheme(),
    metadata: '{}',
    active: true,
  }
}

function schoolToDraft(school: School): SchoolDraft {
  return {
    school_id: school.school_id,
    name: school.name,
    title: school.title,
    logo_url: school.logo_url,
    default_campus_id: school.default_campus_id,
    color_scheme: normalizeSchoolColorScheme(school.color_scheme),
    metadata: prettyJson(school.metadata),
    active: school.active,
  }
}

function termToDraft(term: SchoolTerm): TermDraft {
  return {
    id: term.term_uuid || makeDraftId(),
    term_uuid: term.term_uuid,
    name: term.name,
    start_date: term.start_date,
    end_date: term.end_date,
  }
}

function createEmptyTermDraft(): TermDraft {
  return {
    id: makeDraftId(),
    term_uuid: '',
    name: '',
    start_date: '',
    end_date: '',
  }
}

function createEmptyPackDraft(defaultCampusId = ''): PackDraft {
  return {
    name: '',
    description: '',
    number_of_spots: '8',
    campus_id: defaultCampusId,
    lat: '',
    lng: '',
  }
}

function formatCoordinateValue(value: number): string {
  return value.toFixed(6)
}

function parseCoordinateInput(value: string, label: string): number {
  const parsed = Number(value.trim())
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid number.`)
  }
  return parsed
}

function parseObjectJson(source: string, label: string): Record<string, unknown> {
  const trimmed = source.trim()
  if (trimmed === '') {
    return {}
  }

  const parsed = JSON.parse(trimmed) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`)
  }

  return parsed as Record<string, unknown>
}

function sanitizeSchoolColorScheme(colorScheme: SchoolColorScheme): SchoolColorScheme {
  const nextColorScheme: SchoolColorScheme = {}

  for (const field of schoolColorFields) {
    const rawValue = colorScheme[field.key]?.trim() ?? ''
    if (!rawValue) {
      continue
    }
    if (!schoolColorHexPattern.test(rawValue)) {
      throw new Error(`${field.label} color must use #RRGGBB hex format.`)
    }
    nextColorScheme[field.key] = rawValue.toLowerCase()
  }

  return nextColorScheme
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return 'An unexpected error occurred.'
}

function formatUnixTimestamp(value?: number): string {
  if (!value) {
    return 'Not set'
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value * 1000))
}

function formatDateOnly(value: string): string {
  if (!value) {
    return 'Not set'
  }

  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

function DetailRow(props: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  )
}

function App() {
  const [session, setSession] = useState<AdminSession | null>(() => readDashboardSession())
  const [context, setContext] = useState<DashboardContext>(() =>
    readDashboardContext(defaultManagedAppId),
  )
  const [managedAppInput, setManagedAppInput] = useState(context.managedAppId)
  const [currentSection, setCurrentSection] = useState<Section>('school')
  const [banner, setBanner] = useState<BannerState | null>(null)
  const [authMode, setAuthMode] = useState<AuthMode>('login')

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [signupForm, setSignupForm] = useState<SignupFormState>({
    school_id: '',
    first: '',
    last: '',
    username: '',
    email: '',
    phone: '',
    password: '',
  })

  const [schools, setSchools] = useState<School[]>([])
  const [schoolsBusy, setSchoolsBusy] = useState(false)
  const [schoolBusy, setSchoolBusy] = useState(false)
  const [isCreatingSchool, setIsCreatingSchool] = useState(false)
  const [schoolDraft, setSchoolDraft] = useState<SchoolDraft>(() => createEmptySchoolDraft())
  const [termDrafts, setTermDrafts] = useState<TermDraft[]>([])
  const [packDraft, setPackDraft] = useState<PackDraft>(() => createEmptyPackDraft())
  const [packBusy, setPackBusy] = useState(false)
  const [createdPack, setCreatedPack] = useState<Pack | null>(null)

  const [reservations, setReservations] = useState<PackSpotReservation[]>([])
  const [reservationsBusy, setReservationsBusy] = useState(false)
  const [selectedReservationId, setSelectedReservationId] = useState('')
  const [studentProfile, setStudentProfile] = useState<StudentProfileBundle | null>(null)
  const [studentBusy, setStudentBusy] = useState(false)
  const [studentError, setStudentError] = useState('')
  const scopedSchoolId = session?.claims.school_id?.trim() ?? ''
  const isSchoolScopedAdmin = scopedSchoolId !== ''
  const activePackSchoolId = scopedSchoolId || context.selectedSchoolId

  const selectedSchool = useMemo(
    () => schools.find((school) => school.school_id === context.selectedSchoolId) ?? null,
    [context.selectedSchoolId, schools],
  )

  const selectedPackLocation = useMemo<PackMapPoint | null>(() => {
    const lat = packDraft.lat.trim()
    const lng = packDraft.lng.trim()
    if (!lat || !lng) {
      return null
    }

    const parsedLat = Number(lat)
    const parsedLng = Number(lng)
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      return null
    }

    return {
      lat: parsedLat,
      lng: parsedLng,
    }
  }, [packDraft.lat, packDraft.lng])

  const selectedReservation = useMemo(
    () =>
      reservations.find((reservation) => reservation.reservation_uuid === selectedReservationId) ??
      null,
    [reservations, selectedReservationId],
  )

  const relevantMemberships = useMemo(() => {
    if (!studentProfile) {
      return []
    }

    return studentProfile.memberships.filter(
      (membership) => membership.school_id === context.selectedSchoolId,
    )
  }, [context.selectedSchoolId, studentProfile])

  const resolvedSchoolColors = useMemo(
    () => normalizeSchoolColorScheme(schoolDraft.color_scheme),
    [schoolDraft.color_scheme],
  )

  const sidebarThemeStyle = useMemo<SidebarThemeStyle>(() => {
    const primary = resolvedSchoolColors.primary || defaultSchoolColorScheme.primary
    const secondary = resolvedSchoolColors.secondary || defaultSchoolColorScheme.secondary
    const accent = resolvedSchoolColors.accent || defaultSchoolColorScheme.accent
    const background = resolvedSchoolColors.background || defaultSchoolColorScheme.background
    const text = resolvedSchoolColors.text || defaultSchoolColorScheme.text
    const sidebarBgStart = mixHexColors(background, primary, 0.16)
    const sidebarBgEnd = mixHexColors(juiseColors.darkGrey, background, 0.7)
    const surface = hexToRgba(mixHexColors(background, secondary, 0.42), 0.88)
    const surfaceStrong = hexToRgba(mixHexColors(background, primary, 0.18), 0.98)
    const itemBg = hexToRgba(mixHexColors(background, secondary, 0.58), 0.54)
    const itemHoverBg = hexToRgba(mixHexColors(background, primary, 0.28), 0.74)
    const activeBase = mixHexColors(primary, accent, 0.26)
    const activeBg = `linear-gradient(135deg, ${activeBase}, ${accent})`

    return {
      '--sidebar-bg-start': sidebarBgStart,
      '--sidebar-bg-end': sidebarBgEnd,
      '--sidebar-glow-primary': hexToRgba(primary, 0.24),
      '--sidebar-glow-accent': hexToRgba(accent, 0.18),
      '--sidebar-text': text,
      '--sidebar-muted': hexToRgba(text, 0.76),
      '--sidebar-soft-text': hexToRgba(text, 0.58),
      '--sidebar-border': hexToRgba(text, 0.12),
      '--sidebar-accent-border': hexToRgba(accent, 0.32),
      '--sidebar-surface': surface,
      '--sidebar-surface-strong': surfaceStrong,
      '--sidebar-item-bg': itemBg,
      '--sidebar-item-hover-bg': itemHoverBg,
      '--sidebar-item-active-bg': activeBg,
      '--sidebar-item-active-text': getReadableTextColor(activeBase),
      '--sidebar-form-bg': hexToRgba(mixHexColors(background, secondary, 0.68), 0.92),
      '--sidebar-form-border': hexToRgba(accent, 0.16),
      '--sidebar-chip-bg': hexToRgba(accent, 0.2),
      '--sidebar-chip-text': getReadableTextColor(accent),
      '--sidebar-primary': primary,
      '--sidebar-secondary': secondary,
      '--sidebar-accent': accent,
    }
  }, [resolvedSchoolColors])

  useEffect(() => {
    setPackDraft(createEmptyPackDraft(selectedSchool?.default_campus_id ?? ''))
    setCreatedPack(null)
  }, [activePackSchoolId, selectedSchool?.default_campus_id])

  useEffect(() => {
    setManagedAppInput(context.managedAppId)
  }, [context.managedAppId])

  useEffect(() => {
    setApiSession(session)
    if (session) {
      writeDashboardSession(session)
    } else {
      clearDashboardSession()
    }
  }, [session])

  useEffect(() => {
    writeDashboardContext(context)
  }, [context])

  useEffect(() => {
    if (!scopedSchoolId) {
      return
    }

    setIsCreatingSchool(false)
    setContext((current) => ({
      ...current,
      managedAppId: defaultManagedAppId,
      selectedSchoolId: scopedSchoolId,
    }))
  }, [scopedSchoolId])

  useEffect(() => {
    setSessionObserver((nextSession) => {
      setSession(nextSession)
    })

    return () => {
      setSessionObserver(null)
    }
  }, [])

  useEffect(() => {
    if (!session) {
      setSchools([])
      setReservations([])
      setStudentProfile(null)
      return
    }

    let cancelled = false

    async function loadSchools() {
      setSchoolsBusy(true)
      try {
        const nextSchools = await fetchSchools(context.managedAppId)
        if (cancelled) {
          return
        }

        setSchools(nextSchools)

        if (scopedSchoolId) {
          if (context.selectedSchoolId !== scopedSchoolId) {
            setContext((current) => ({
              ...current,
              selectedSchoolId: scopedSchoolId,
            }))
          }
        } else if (!isCreatingSchool) {
          const hasCurrentSelection = nextSchools.some(
            (school) => school.school_id === context.selectedSchoolId,
          )
          const nextSelectedSchoolId = hasCurrentSelection
            ? context.selectedSchoolId
            : nextSchools[0]?.school_id ?? ''

          if (nextSelectedSchoolId !== context.selectedSchoolId) {
            setContext((current) => ({
              ...current,
              selectedSchoolId: nextSelectedSchoolId,
            }))
          }
        }
      } catch (error) {
        if (!cancelled) {
          setBanner({
            tone: 'error',
            message: getErrorMessage(error),
          })
        }
      } finally {
        if (!cancelled) {
          setSchoolsBusy(false)
        }
      }
    }

    void loadSchools()

    return () => {
      cancelled = true
    }
  }, [context.managedAppId, context.selectedSchoolId, isCreatingSchool, scopedSchoolId, session])

  useEffect(() => {
    if (!session) {
      return
    }

    if (isCreatingSchool) {
      setSchoolDraft({
        ...createEmptySchoolDraft(),
        school_id: scopedSchoolId,
      })
      setTermDrafts([])
      return
    }

    if (!context.selectedSchoolId) {
      setSchoolDraft(createEmptySchoolDraft())
      setTermDrafts([])
      return
    }

    let cancelled = false

    async function loadSchoolDetails() {
      setSchoolBusy(true)
      try {
        const school = await fetchSchool(context.managedAppId, context.selectedSchoolId)
        if (cancelled) {
          return
        }

        setSchoolDraft(schoolToDraft(school))
        setTermDrafts(school.terms.map(termToDraft))
      } catch (error) {
        if (!cancelled) {
          const message = getErrorMessage(error)
          if (
            scopedSchoolId &&
            context.selectedSchoolId === scopedSchoolId &&
            message.toLowerCase().includes('locate school')
          ) {
            setSchoolDraft({
              ...createEmptySchoolDraft(),
              school_id: scopedSchoolId,
            })
            setTermDrafts([])
          } else {
            setBanner({
              tone: 'error',
              message,
            })
          }
        }
      } finally {
        if (!cancelled) {
          setSchoolBusy(false)
        }
      }
    }

    void loadSchoolDetails()

    return () => {
      cancelled = true
    }
  }, [context.managedAppId, context.selectedSchoolId, isCreatingSchool, scopedSchoolId, session])

  useEffect(() => {
    if (!session || currentSection !== 'reservations' || !context.selectedSchoolId) {
      return
    }

    const adminUserUUID = session.claims.user_uuid
    let cancelled = false

    async function loadReservations() {
      setReservationsBusy(true)
      try {
        const nextReservations = await fetchPendingReservations(
          adminUserUUID,
          context.managedAppId,
          context.selectedSchoolId,
        )
        if (cancelled) {
          return
        }

        setReservations(nextReservations)
        const hasCurrentSelection = nextReservations.some(
          (reservation) => reservation.reservation_uuid === selectedReservationId,
        )
        setSelectedReservationId(
          hasCurrentSelection ? selectedReservationId : nextReservations[0]?.reservation_uuid ?? '',
        )
      } catch (error) {
        if (!cancelled) {
          setBanner({
            tone: 'error',
            message: getErrorMessage(error),
          })
        }
      } finally {
        if (!cancelled) {
          setReservationsBusy(false)
        }
      }
    }

    void loadReservations()

    return () => {
      cancelled = true
    }
  }, [context.managedAppId, context.selectedSchoolId, currentSection, selectedReservationId, session])

  useEffect(() => {
    if (!session || !selectedReservation) {
      setStudentProfile(null)
      setStudentError('')
      return
    }

    const studentUserUUID = selectedReservation.user_uuid
    let cancelled = false

    async function loadStudentProfile() {
      setStudentBusy(true)
      setStudentError('')
      try {
        const nextProfile = await fetchStudentProfile(context.managedAppId, studentUserUUID)
        if (cancelled) {
          return
        }

        setStudentProfile(nextProfile)
      } catch (error) {
        if (!cancelled) {
          setStudentProfile(null)
          setStudentError(getErrorMessage(error))
        }
      } finally {
        if (!cancelled) {
          setStudentBusy(false)
        }
      }
    }

    void loadStudentProfile()

    return () => {
      cancelled = true
    }
  }, [context.managedAppId, selectedReservation, session])

  async function refreshSchools(preferredSchoolId?: string) {
    if (!session) {
      return
    }

    setSchoolsBusy(true)
    try {
      const nextSchools = await fetchSchools(context.managedAppId)
      setSchools(nextSchools)
      const requestedSelection = scopedSchoolId
        ? scopedSchoolId
        : preferredSchoolId && nextSchools.some((school) => school.school_id === preferredSchoolId)
          ? preferredSchoolId
          : nextSchools.some((school) => school.school_id === context.selectedSchoolId)
            ? context.selectedSchoolId
            : nextSchools[0]?.school_id ?? ''

      setContext((current) => ({
        ...current,
        selectedSchoolId: requestedSelection,
      }))
    } catch (error) {
      setBanner({
        tone: 'error',
        message: getErrorMessage(error),
      })
    } finally {
      setSchoolsBusy(false)
    }
  }

  async function refreshReservations() {
    if (!session || !context.selectedSchoolId) {
      return
    }

    setReservationsBusy(true)
    try {
      const nextReservations = await fetchPendingReservations(
        session.claims.user_uuid,
        context.managedAppId,
        context.selectedSchoolId,
      )
      setReservations(nextReservations)
      setSelectedReservationId((current) => {
        const hasCurrent = nextReservations.some(
          (reservation) => reservation.reservation_uuid === current,
        )
        return hasCurrent ? current : nextReservations[0]?.reservation_uuid ?? ''
      })
    } catch (error) {
      setBanner({
        tone: 'error',
        message: getErrorMessage(error),
      })
    } finally {
      setReservationsBusy(false)
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthBusy(true)
    setAuthError('')

    try {
      const nextSession = await loginWithIdentifier(identifier.trim(), password, authAppId)
      setSession(nextSession)
      setPassword('')
      setAuthMode('login')
      setBanner({
        tone: 'success',
        message: `Signed in as ${nextSession.claims.user_uuid}.`,
      })
    } catch (error) {
      setAuthError(getErrorMessage(error))
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleCreateSchoolAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthBusy(true)
    setAuthError('')

    try {
      const nextSession = await createSchoolAdminAccount(authAppId, signupForm)
      setSession(nextSession)
      setSignupForm((current) => ({
        ...current,
        password: '',
      }))
      setBanner({
        tone: 'success',
        message: `Created school admin account for ${signupForm.school_id}.`,
      })
    } catch (error) {
      setAuthError(getErrorMessage(error))
    } finally {
      setAuthBusy(false)
    }
  }

  function handleLogout() {
    setSession(null)
    setAuthError('')
    setPassword('')
    setSignupForm((current) => ({
      ...current,
      password: '',
    }))
    setBanner({
      tone: 'info',
      message: 'Signed out.',
    })
  }

  function handleSwitchManagedApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedAppId = managedAppInput.trim()
    if (!trimmedAppId) {
      setBanner({
        tone: 'error',
        message: 'Managed app id is required.',
      })
      return
    }

    setIsCreatingSchool(false)
    setContext({
      managedAppId: trimmedAppId,
      selectedSchoolId: '',
    })
    setCurrentSection('school')
  }

  function handleCreateSchool() {
    setIsCreatingSchool(true)
    setCurrentSection('school')
    setContext((current) => ({
      ...current,
      selectedSchoolId: scopedSchoolId,
    }))
    setSchoolDraft({
      ...createEmptySchoolDraft(),
      school_id: scopedSchoolId,
    })
    setTermDrafts([])
  }

  function handleSchoolColorChange(field: keyof SchoolColorScheme, value: string) {
    setSchoolDraft((current) => ({
      ...current,
      color_scheme: {
        ...current.color_scheme,
        [field]: value,
      },
    }))
  }

  async function handleSaveSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const schoolId = schoolDraft.school_id.trim()
    if (!schoolId) {
      setBanner({
        tone: 'error',
        message: 'school_id is required before saving.',
      })
      return
    }

    setSchoolBusy(true)
    try {
      const savedSchool = await saveSchool(context.managedAppId, schoolId, {
        name: schoolDraft.name.trim(),
        title: schoolDraft.title.trim(),
        logo_url: schoolDraft.logo_url.trim(),
        default_campus_id: schoolDraft.default_campus_id.trim(),
        color_scheme: sanitizeSchoolColorScheme(schoolDraft.color_scheme),
        metadata: parseObjectJson(schoolDraft.metadata, 'Metadata'),
        active: schoolDraft.active,
      })

      setIsCreatingSchool(false)
      setContext((current) => ({
        ...current,
        selectedSchoolId: savedSchool.school_id,
      }))
      setSchoolDraft(schoolToDraft(savedSchool))
      setTermDrafts(savedSchool.terms.map(termToDraft))
      await refreshSchools(savedSchool.school_id)
      setBanner({
        tone: 'success',
        message: `Saved school ${savedSchool.school_id}.`,
      })
    } catch (error) {
      setBanner({
        tone: 'error',
        message: getErrorMessage(error),
      })
    } finally {
      setSchoolBusy(false)
    }
  }

  async function handleSaveTerms() {
    if (!context.selectedSchoolId) {
      setBanner({
        tone: 'error',
        message: 'Save the school profile first before managing terms.',
      })
      return
    }

    setSchoolBusy(true)
    try {
      const savedTerms = await saveSchoolTerms(
        context.managedAppId,
        context.selectedSchoolId,
        termDrafts.map((term) => ({
          term_uuid: term.term_uuid.trim() || undefined,
          name: term.name.trim(),
          start_date: term.start_date,
          end_date: term.end_date,
        })),
      )

      setTermDrafts(savedTerms.map(termToDraft))
      await refreshSchools(context.selectedSchoolId)
      setBanner({
        tone: 'success',
        message: `Updated ${savedTerms.length} school terms.`,
      })
    } catch (error) {
      setBanner({
        tone: 'error',
        message: getErrorMessage(error),
      })
    } finally {
      setSchoolBusy(false)
    }
  }

  function handlePackLocationSelect(point: PackMapPoint) {
    setPackDraft((current) => ({
      ...current,
      lat: formatCoordinateValue(point.lat),
      lng: formatCoordinateValue(point.lng),
    }))
  }

  async function handleCreatePack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!session) {
      return
    }
    if (!activePackSchoolId) {
      setBanner({
        tone: 'error',
        message: 'Select a school first before creating a Juise Pack.',
      })
      return
    }

    let parsedLat = 0
    let parsedLng = 0
    let parsedSpotCount = 0

    try {
      parsedLat = parseCoordinateInput(packDraft.lat, 'Latitude')
      parsedLng = parseCoordinateInput(packDraft.lng, 'Longitude')
      parsedSpotCount = Number.parseInt(packDraft.number_of_spots.trim(), 10)
      if (!Number.isFinite(parsedSpotCount) || parsedSpotCount < 1) {
        throw new Error('Number of spots must be greater than 0.')
      }
    } catch (error) {
      setBanner({
        tone: 'error',
        message: getErrorMessage(error),
      })
      return
    }

    setPackBusy(true)
    try {
      const campusId =
        packDraft.campus_id.trim() || selectedSchool?.default_campus_id.trim() || undefined
      const created = await createSchoolPack(session.claims.user_uuid, {
        name: packDraft.name.trim() || undefined,
        description: packDraft.description.trim() || undefined,
        number_of_spots: parsedSpotCount,
        location: {
          lat: parsedLat,
          lng: parsedLng,
        },
        school_owner: {
          app_id: context.managedAppId,
          school_id: activePackSchoolId,
          campus_id: campusId,
        },
      })

      setCreatedPack(created)
      setPackDraft(createEmptyPackDraft(campusId ?? ''))
      setBanner({
        tone: 'success',
        message: `Created Juise Pack ${created.name || created.pack_uuid} for school ${activePackSchoolId}.`,
      })
    } catch (error) {
      setBanner({
        tone: 'error',
        message: getErrorMessage(error),
      })
    } finally {
      setPackBusy(false)
    }
  }

  async function handleApproveSelected() {
    if (!session || !selectedReservation) {
      return
    }

    setReservationsBusy(true)
    try {
      await approveReservation(session.claims.user_uuid, selectedReservation.reservation_uuid)
      setBanner({
        tone: 'success',
        message: `Approved ${selectedReservation.reservation_uuid}.`,
      })
      await refreshReservations()
    } catch (error) {
      setBanner({
        tone: 'error',
        message: getErrorMessage(error),
      })
    } finally {
      setReservationsBusy(false)
    }
  }

  async function handleDenySelected() {
    if (!session || !selectedReservation) {
      return
    }

    const shouldContinue = window.confirm(
      `Deny reservation ${selectedReservation.reservation_uuid}? This removes it from the pending queue.`,
    )
    if (!shouldContinue) {
      return
    }

    setReservationsBusy(true)
    try {
      await denyReservation(session.claims.user_uuid, selectedReservation.reservation_uuid)
      setBanner({
        tone: 'success',
        message: `Denied ${selectedReservation.reservation_uuid}.`,
      })
      await refreshReservations()
    } catch (error) {
      setBanner({
        tone: 'error',
        message: getErrorMessage(error),
      })
    } finally {
      setReservationsBusy(false)
    }
  }

  if (!session) {
    return (
      <div className="login-shell">
        <section className="login-panel login-hero">
          <p className="eyebrow">Juise Rider Admin Dashboard</p>
          <h1>Manage schools, terms, and parking approvals from one place.</h1>
          <p className="hero-copy">
            Sign in with an admin account from <code>{authAppId}</code> to manage school-owned
            Juise Pack reservations and student registrations.
          </p>
          <div className="hero-grid">
            <div className="hero-card">
              <span>School profile</span>
              <strong>Edit the Nebula school record and branding fields.</strong>
            </div>
            <div className="hero-card">
              <span>Academic calendar</span>
              <strong>Define reservable terms that drive pack term requests.</strong>
            </div>
            <div className="hero-card">
              <span>Pending queue</span>
              <strong>Approve or deny student requests with their device history beside it.</strong>
            </div>
          </div>
        </section>

        <section className="login-panel login-form-panel">
          <div className="auth-switcher">
            <button
              className={authMode === 'signup' ? 'nav-button nav-button-active' : 'nav-button'}
              type="button"
              onClick={() => {
                setAuthMode('signup')
                setAuthError('')
              }}
            >
              Create School Admin
            </button>
            <button
              className={authMode === 'login' ? 'nav-button nav-button-active' : 'nav-button'}
              type="button"
              onClick={() => {
                setAuthMode('login')
                setAuthError('')
              }}
            >
              Login
            </button>
          </div>

          {authMode === 'signup' ? (
            <form className="login-form" onSubmit={handleCreateSchoolAdmin}>
              <p className="eyebrow">School Admin Signup</p>
              <h2>Create a separate school dashboard account</h2>
              <label className="field">
                <span>School ID</span>
                <input
                  value={signupForm.school_id}
                  onChange={(event) =>
                    setSignupForm((current) => ({
                      ...current,
                      school_id: event.target.value,
                    }))
                  }
                  placeholder="ou"
                  required
                />
              </label>
              <div className="form-grid">
                <label className="field">
                  <span>First name</span>
                  <input
                    value={signupForm.first}
                    onChange={(event) =>
                      setSignupForm((current) => ({
                        ...current,
                        first: event.target.value,
                      }))
                    }
                    placeholder="Avery"
                  />
                </label>
                <label className="field">
                  <span>Last name</span>
                  <input
                    value={signupForm.last}
                    onChange={(event) =>
                      setSignupForm((current) => ({
                        ...current,
                        last: event.target.value,
                      }))
                    }
                    placeholder="Morgan"
                  />
                </label>
              </div>
              <label className="field">
                <span>Username</span>
                <input
                  value={signupForm.username}
                  onChange={(event) =>
                    setSignupForm((current) => ({
                      ...current,
                      username: event.target.value,
                    }))
                  }
                  placeholder="ou.parking"
                  required
                />
              </label>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={signupForm.email}
                  onChange={(event) =>
                    setSignupForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  placeholder="parking@school.edu"
                  required
                />
              </label>
              <label className="field">
                <span>Phone (optional)</span>
                <input
                  value={signupForm.phone}
                  onChange={(event) =>
                    setSignupForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                  placeholder="+12485551212"
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={signupForm.password}
                  onChange={(event) =>
                    setSignupForm((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  placeholder="••••••••"
                  required
                />
              </label>
              {authError ? <p className="error-text">{authError}</p> : null}
              <button className="primary-button" type="submit" disabled={authBusy}>
                {authBusy ? 'Creating account…' : 'Create School Admin'}
              </button>
            </form>
          ) : (
            <form className="login-form" onSubmit={handleLogin}>
              <p className="eyebrow">Admin Login</p>
              <h2>Sign in</h2>
              <label className="field">
                <span>Username, email, or phone</span>
                <input
                  autoComplete="username"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="admin@example.com"
                  required
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  required
                />
              </label>
              {authError ? <p className="error-text">{authError}</p> : null}
              <button className="primary-button" type="submit" disabled={authBusy}>
                {authBusy ? 'Signing in…' : 'Enter Dashboard'}
              </button>
            </form>
          )}
        </section>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" style={sidebarThemeStyle}>
        <div className="brand-card sidebar-brand-card">
          <div className="sidebar-brand-top">
            <div>
              <p className="eyebrow">Juise Rider Admin</p>
              <h2>School operations</h2>
            </div>
            <span className="sidebar-theme-chip">
              {context.selectedSchoolId || schoolDraft.school_id || 'Juise default'}
            </span>
          </div>
          <p>Signed in as {session.claims.user_uuid}</p>
          {isSchoolScopedAdmin ? <p>School scope: {scopedSchoolId}</p> : null}
        </div>

        {!isSchoolScopedAdmin ? (
          <form className="scope-form" onSubmit={handleSwitchManagedApp}>
            <label className="field compact-field">
              <span>Managed App ID</span>
              <input
                value={managedAppInput}
                onChange={(event) => setManagedAppInput(event.target.value)}
                placeholder="juise-customer-app"
              />
            </label>
            <button className="secondary-button" type="submit">
              Load App
            </button>
          </form>
        ) : null}

        <div className="sidebar-block">
          <div className="sidebar-block-header">
            <span>Schools</span>
            {!isSchoolScopedAdmin ? (
              <button className="text-button" type="button" onClick={handleCreateSchool}>
                New
              </button>
            ) : null}
          </div>
          <div className="school-list">
            {schoolsBusy ? <p className="muted-text">Loading schools…</p> : null}
            {isSchoolScopedAdmin ? (
              <div className="school-pill school-pill-active">
                <strong>{selectedSchool?.name || scopedSchoolId}</strong>
                <span>{scopedSchoolId}</span>
              </div>
            ) : (
              <>
                {!schoolsBusy && schools.length === 0 ? (
                  <p className="muted-text">No schools loaded for this app yet.</p>
                ) : null}
                {schools.map((school) => (
                  <button
                    key={school.school_id}
                    type="button"
                    className={`school-pill ${
                      !isCreatingSchool && context.selectedSchoolId === school.school_id
                        ? 'school-pill-active'
                        : ''
                    }`}
                    onClick={() => {
                      setIsCreatingSchool(false)
                      setContext((current) => ({
                        ...current,
                        selectedSchoolId: school.school_id,
                      }))
                    }}
                  >
                    <strong>{school.name}</strong>
                    <span>{school.school_id}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        <nav className="section-nav">
          <button
            type="button"
            className={currentSection === 'school' ? 'nav-button nav-button-active' : 'nav-button'}
            onClick={() => setCurrentSection('school')}
          >
            School Profile
          </button>
          <button
            type="button"
            className={currentSection === 'terms' ? 'nav-button nav-button-active' : 'nav-button'}
            onClick={() => setCurrentSection('terms')}
          >
            School Terms
          </button>
          <button
            type="button"
            className={currentSection === 'packs' ? 'nav-button nav-button-active' : 'nav-button'}
            onClick={() => setCurrentSection('packs')}
          >
            Juise Packs
          </button>
          <button
            type="button"
            className={
              currentSection === 'reservations' ? 'nav-button nav-button-active' : 'nav-button'
            }
            onClick={() => setCurrentSection('reservations')}
          >
            Pending Reservations
          </button>
        </nav>

        <div className="sidebar-footer">
          <button className="secondary-button full-width-button" type="button" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1>
              {isCreatingSchool
                ? 'New school'
                : selectedSchool?.title || schoolDraft.title || 'School dashboard'}
            </h1>
            <p className="workspace-copy">
              App scope: <code>{context.managedAppId}</code>
              {' · '}
              School: <code>{context.selectedSchoolId || schoolDraft.school_id || 'unsaved'}</code>
            </p>
          </div>
          <div className="header-stats">
            <div className="stat-card">
              <span>Schools</span>
              <strong>{schools.length}</strong>
            </div>
            <div className="stat-card">
              <span>Terms</span>
              <strong>{termDrafts.length}</strong>
            </div>
            <div className="stat-card">
              <span>Pending</span>
              <strong>{reservations.length}</strong>
            </div>
          </div>
        </header>

        {banner ? (
          <div className={`banner banner-${banner.tone}`}>
            <span>{banner.message}</span>
            <button className="text-button" type="button" onClick={() => setBanner(null)}>
              Dismiss
            </button>
          </div>
        ) : null}

        {currentSection === 'school' ? (
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">School Identity</p>
                <h2>{isCreatingSchool ? 'Create school' : 'Edit school profile'}</h2>
              </div>
              {schoolBusy ? <span className="muted-text">Saving…</span> : null}
            </div>

            <form className="school-form" onSubmit={handleSaveSchool}>
              <div className="form-grid">
                <label className="field">
                  <span>School ID</span>
                  <input
                    value={schoolDraft.school_id}
                    onChange={(event) =>
                      setSchoolDraft((current) => ({
                        ...current,
                        school_id: event.target.value,
                      }))
                    }
                    disabled={!isCreatingSchool || isSchoolScopedAdmin}
                    placeholder="ou"
                  />
                </label>
                <label className="field">
                  <span>Name</span>
                  <input
                    value={schoolDraft.name}
                    onChange={(event) =>
                      setSchoolDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Oakland University"
                  />
                </label>
                <label className="field">
                  <span>Title</span>
                  <input
                    value={schoolDraft.title}
                    onChange={(event) =>
                      setSchoolDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Oakland University"
                  />
                </label>
                <label className="field">
                  <span>Default Campus ID</span>
                  <input
                    value={schoolDraft.default_campus_id}
                    onChange={(event) =>
                      setSchoolDraft((current) => ({
                        ...current,
                        default_campus_id: event.target.value,
                      }))
                    }
                    placeholder="main"
                  />
                </label>
                <label className="field field-span-2">
                  <span>Logo URL</span>
                  <input
                    value={schoolDraft.logo_url}
                    onChange={(event) =>
                      setSchoolDraft((current) => ({
                        ...current,
                        logo_url: event.target.value,
                      }))
                    }
                    placeholder="https://…"
                  />
                </label>
                <label className="field checkbox-field">
                  <span>Active</span>
                  <input
                    type="checkbox"
                    checked={schoolDraft.active}
                    onChange={(event) =>
                      setSchoolDraft((current) => ({
                        ...current,
                        active: event.target.checked,
                      }))
                    }
                  />
                </label>
                <div className="field field-span-2">
                  <span>Color Scheme</span>
                  <div className="color-scheme-grid">
                    {schoolColorFields.map((field) => (
                      <div className="color-input-row" key={field.key}>
                        <div className="color-input-copy">
                          <strong>{field.label}</strong>
                          <span>{field.key}</span>
                        </div>
                        <input
                          type="text"
                          value={schoolDraft.color_scheme[field.key] ?? ''}
                          onChange={(event) =>
                            handleSchoolColorChange(field.key, event.target.value)
                          }
                          placeholder={field.fallback}
                        />
                        <input
                          type="color"
                          className="color-picker-input"
                          value={getColorPickerValue(
                            schoolDraft.color_scheme[field.key],
                            field.key as keyof typeof defaultSchoolColorScheme,
                          )}
                          onChange={(event) =>
                            handleSchoolColorChange(field.key, event.target.value)
                          }
                          aria-label={`${field.label} color`}
                        />
                      </div>
                    ))}
                  </div>
                  <div
                    className="color-preview-card"
                    style={{
                      background: resolvedSchoolColors.background,
                      color: resolvedSchoolColors.text,
                      borderColor: resolvedSchoolColors.secondary,
                    }}
                  >
                    <div className="color-preview-swatches" aria-hidden="true">
                      <span style={{ background: resolvedSchoolColors.primary }} />
                      <span style={{ background: resolvedSchoolColors.secondary }} />
                      <span style={{ background: resolvedSchoolColors.accent }} />
                      <span style={{ background: resolvedSchoolColors.background }} />
                      <span style={{ background: resolvedSchoolColors.text }} />
                    </div>
                    <strong>{schoolDraft.title.trim() || schoolDraft.name.trim() || 'Brand preview'}</strong>
                    <p>
                      Preview the school palette before saving. The admin dashboard sends this as
                      the structured <code>SchoolColorScheme</code> object.
                    </p>
                    <button
                      className="color-preview-button"
                      type="button"
                      style={{
                        background: resolvedSchoolColors.primary,
                        color: resolvedSchoolColors.background,
                      }}
                    >
                      Sample Primary Action
                    </button>
                  </div>
                </div>
                <label className="field field-span-2">
                  <span>Metadata JSON</span>
                  <textarea
                    value={schoolDraft.metadata}
                    onChange={(event) =>
                      setSchoolDraft((current) => ({
                        ...current,
                        metadata: event.target.value,
                      }))
                    }
                    rows={8}
                  />
                </label>
              </div>

              <div className="form-actions">
                <button className="primary-button" type="submit" disabled={schoolBusy}>
                  {isCreatingSchool ? 'Create School' : 'Save School'}
                </button>
                {!isCreatingSchool ? (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void refreshSchools(context.selectedSchoolId)}
                  >
                    Reload
                  </button>
                ) : null}
              </div>
            </form>
          </section>
        ) : null}

        {currentSection === 'terms' ? (
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Academic Calendar</p>
                <h2>Reservable terms</h2>
              </div>
              <div className="form-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setTermDrafts((current) => [...current, createEmptyTermDraft()])}
                  disabled={!context.selectedSchoolId}
                >
                  Add Term
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void handleSaveTerms()}
                  disabled={schoolBusy || !context.selectedSchoolId}
                >
                  Save Terms
                </button>
              </div>
            </div>

            {!context.selectedSchoolId ? (
              <p className="empty-state">
                Save a school profile first. Terms are scoped to an existing school record.
              </p>
            ) : null}

            {context.selectedSchoolId ? (
              <div className="term-list">
                {termDrafts.length === 0 ? (
                  <p className="empty-state">No terms configured yet for this school.</p>
                ) : null}
                {termDrafts.map((term, index) => (
                  <div className="term-row" key={term.id}>
                    <label className="field">
                      <span>Term Name</span>
                      <input
                        value={term.name}
                        onChange={(event) =>
                          setTermDrafts((current) =>
                            current.map((item) =>
                              item.id === term.id ? { ...item, name: event.target.value } : item,
                            ),
                          )
                        }
                        placeholder={`Term ${index + 1}`}
                      />
                    </label>
                    <label className="field">
                      <span>Start Date</span>
                      <input
                        type="date"
                        value={term.start_date}
                        onChange={(event) =>
                          setTermDrafts((current) =>
                            current.map((item) =>
                              item.id === term.id
                                ? { ...item, start_date: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="field">
                      <span>End Date</span>
                      <input
                        type="date"
                        value={term.end_date}
                        onChange={(event) =>
                          setTermDrafts((current) =>
                            current.map((item) =>
                              item.id === term.id ? { ...item, end_date: event.target.value } : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() =>
                        setTermDrafts((current) => current.filter((item) => item.id !== term.id))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {currentSection === 'packs' ? (
          <section className="panel pack-layout">
            <div className="pack-builder">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Juise Pack Builder</p>
                  <h2>Create a school-owned parking pack</h2>
                </div>
                {packBusy ? <span className="muted-text">Creating…</span> : null}
              </div>

              {!activePackSchoolId ? (
                <p className="empty-state">
                  Select a school first. New packs are linked to the active school scope.
                </p>
              ) : null}

              <form className="school-form" onSubmit={handleCreatePack}>
                <div className="form-grid">
                  <label className="field">
                    <span>School ID</span>
                    <input value={activePackSchoolId} disabled />
                  </label>
                  <label className="field">
                    <span>Campus ID</span>
                    <input
                      value={packDraft.campus_id}
                      onChange={(event) =>
                        setPackDraft((current) => ({
                          ...current,
                          campus_id: event.target.value,
                        }))
                      }
                      placeholder={selectedSchool?.default_campus_id || 'main'}
                      disabled={!activePackSchoolId}
                    />
                  </label>
                  <label className="field">
                    <span>Pack Name</span>
                    <input
                      value={packDraft.name}
                      onChange={(event) =>
                        setPackDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="North Garage Pack"
                      disabled={!activePackSchoolId}
                    />
                  </label>
                  <label className="field">
                    <span>Number of Spots</span>
                    <input
                      type="number"
                      min={1}
                      value={packDraft.number_of_spots}
                      onChange={(event) =>
                        setPackDraft((current) => ({
                          ...current,
                          number_of_spots: event.target.value,
                        }))
                      }
                      disabled={!activePackSchoolId}
                    />
                  </label>
                  <label className="field field-span-2">
                    <span>Description</span>
                    <textarea
                      value={packDraft.description}
                      onChange={(event) =>
                        setPackDraft((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      placeholder="Covered student parking near the library entrance."
                      rows={5}
                      disabled={!activePackSchoolId}
                    />
                  </label>
                </div>

                <div className="pack-map-grid">
                  <div className="map-card">
                    <div className="data-section-header">
                      <h3>Pack location</h3>
                      <span>{selectedPackLocation ? 'Pin placed' : 'No pin yet'}</span>
                    </div>
                    <PackLocationPicker
                      disabled={!activePackSchoolId}
                      onChange={handlePackLocationSelect}
                      value={selectedPackLocation}
                    />
                  </div>

                  <div className="map-card">
                    <div className="data-section-header">
                      <h3>Coordinates</h3>
                      <span>Fine tune manually</span>
                    </div>
                    <div className="coordinate-grid">
                      <label className="field">
                        <span>Latitude</span>
                        <input
                          value={packDraft.lat}
                          onChange={(event) =>
                            setPackDraft((current) => ({
                              ...current,
                              lat: event.target.value,
                            }))
                          }
                          placeholder="42.678000"
                          disabled={!activePackSchoolId}
                        />
                      </label>
                      <label className="field">
                        <span>Longitude</span>
                        <input
                          value={packDraft.lng}
                          onChange={(event) =>
                            setPackDraft((current) => ({
                              ...current,
                              lng: event.target.value,
                            }))
                          }
                          placeholder="-83.195000"
                          disabled={!activePackSchoolId}
                        />
                      </label>
                    </div>
                    <p className="muted-text">
                      Click the map to drop a pin. The created pack is automatically assigned to{' '}
                      <code>{activePackSchoolId || 'selected-school'}</code> for{' '}
                      <code>{context.managedAppId}</code>.
                    </p>
                  </div>
                </div>

                <div className="form-actions">
                  <button className="primary-button" type="submit" disabled={packBusy || !activePackSchoolId}>
                    {packBusy ? 'Creating Pack…' : 'Create Juise Pack'}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={packBusy}
                    onClick={() =>
                      setPackDraft(createEmptyPackDraft(selectedSchool?.default_campus_id ?? ''))
                    }
                  >
                    Reset Form
                  </button>
                </div>
              </form>
            </div>

            <div className="pack-preview-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Last Created Pack</p>
                  <h2>{createdPack?.name || 'No pack created yet'}</h2>
                </div>
              </div>

              {!createdPack ? (
                <p className="empty-state">
                  Create a Juise Pack here and its generated UUID, school owner, and spot count will
                  appear in this panel.
                </p>
              ) : (
                <div className="student-panel">
                  <div className="detail-grid">
                    <DetailRow label="Pack UUID" value={createdPack.pack_uuid} />
                    <DetailRow label="School ID" value={createdPack.school_owner?.school_id || activePackSchoolId} />
                    <DetailRow
                      label="Campus ID"
                      value={createdPack.school_owner?.campus_id || packDraft.campus_id || 'Not set'}
                    />
                    <DetailRow label="Spot Count" value={String(createdPack.spot_count)} />
                    <DetailRow
                      label="Latitude"
                      value={
                        createdPack.location ? formatCoordinateValue(createdPack.location.lat) : 'Not set'
                      }
                    />
                    <DetailRow
                      label="Longitude"
                      value={
                        createdPack.location ? formatCoordinateValue(createdPack.location.lng) : 'Not set'
                      }
                    />
                  </div>

                  <div className="data-section">
                    <div className="data-section-header">
                      <h4>Generated spots</h4>
                      <span>{createdPack.spots.length}</span>
                    </div>
                    <div className="stack-list">
                      {createdPack.spots.slice(0, 6).map((spot) => (
                        <div className="data-card" key={spot.spot_uuid}>
                          <strong>Spot {spot.spot_number}</strong>
                          <span>{spot.spot_uuid}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {currentSection === 'reservations' ? (
          <section className="reservation-layout">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Pending Queue</p>
                  <h2>Reservation requests</h2>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void refreshReservations()}
                  disabled={reservationsBusy || !context.selectedSchoolId}
                >
                  Refresh
                </button>
              </div>

              {!context.selectedSchoolId ? (
                <p className="empty-state">Choose a school to load its pending reservations.</p>
              ) : null}
              {context.selectedSchoolId && reservationsBusy ? (
                <p className="muted-text">Loading pending reservations…</p>
              ) : null}
              {context.selectedSchoolId && !reservationsBusy && reservations.length === 0 ? (
                <p className="empty-state">No pending term reservations for this school.</p>
              ) : null}

              <div className="reservation-list">
                {reservations.map((reservation) => (
                  <button
                    key={reservation.reservation_uuid}
                    type="button"
                    className={`reservation-card ${
                      reservation.reservation_uuid === selectedReservationId
                        ? 'reservation-card-active'
                        : ''
                    }`}
                    onClick={() => setSelectedReservationId(reservation.reservation_uuid)}
                  >
                    <div>
                      <strong>{reservation.pack_name || 'Juise Pack'}</strong>
                      <span>Spot {reservation.spot_number ?? 'TBD'}</span>
                    </div>
                    <div>
                      <span>{reservation.term_name || 'Term request'}</span>
                      <span>{reservation.user_uuid}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Reservation Detail</p>
                  <h2>{selectedReservation?.reservation_uuid || 'Select a reservation'}</h2>
                </div>
                <div className="form-actions">
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => void handleDenySelected()}
                    disabled={!selectedReservation || reservationsBusy}
                  >
                    Deny
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void handleApproveSelected()}
                    disabled={!selectedReservation || reservationsBusy}
                  >
                    Approve
                  </button>
                </div>
              </div>

              {!selectedReservation ? (
                <p className="empty-state">Select a request from the left to review it.</p>
              ) : null}

              {selectedReservation ? (
                <>
                  <div className="detail-grid">
                    <DetailRow
                      label="Pack"
                      value={selectedReservation.pack_name || selectedReservation.pack_uuid}
                    />
                    <DetailRow
                      label="Spot"
                      value={
                        selectedReservation.spot_number
                          ? `Spot ${selectedReservation.spot_number}`
                          : selectedReservation.spot_uuid
                      }
                    />
                    <DetailRow label="Status" value={selectedReservation.status} />
                    <DetailRow label="Term" value={selectedReservation.term_name || 'Not set'} />
                    <DetailRow label="Start" value={formatUnixTimestamp(selectedReservation.start_time)} />
                    <DetailRow label="End" value={formatUnixTimestamp(selectedReservation.end_time)} />
                    <DetailRow label="Student UUID" value={selectedReservation.user_uuid} />
                    <DetailRow
                      label="Membership UUID"
                      value={selectedReservation.membership_uuid || 'Not set'}
                    />
                  </div>

                  <div className="student-panel">
                    <div className="student-panel-header">
                      <div>
                        <p className="eyebrow">Student</p>
                        <h3>Registered information</h3>
                      </div>
                      {studentBusy ? <span className="muted-text">Loading…</span> : null}
                    </div>

                    {studentError ? <p className="error-text">{studentError}</p> : null}

                    {studentProfile ? (
                      <>
                        <div className="detail-grid">
                          <DetailRow
                            label="Name"
                            value={`${studentProfile.user.first_name} ${studentProfile.user.last_name}`.trim()}
                          />
                          <DetailRow label="Username" value={studentProfile.user.username} />
                          <DetailRow label="Email" value={studentProfile.user.email} />
                          <DetailRow label="Phone" value={studentProfile.user.phone || 'Not set'} />
                        </div>

                        <div className="data-section">
                          <div className="data-section-header">
                            <h4>School memberships</h4>
                            <span>{relevantMemberships.length}</span>
                          </div>
                          {relevantMemberships.length === 0 ? (
                            <p className="muted-text">No memberships found for this school.</p>
                          ) : (
                            <div className="stack-list">
                              {relevantMemberships.map((membership) => (
                                <div className="data-card" key={membership.membership_uuid}>
                                  <strong>{membership.student_id || membership.membership_uuid}</strong>
                                  <span>
                                    {membership.school_id} · {membership.campus_id} · {membership.status}
                                  </span>
                                  <span>
                                    {membership.terms.length > 0
                                      ? membership.terms
                                          .map(
                                            (term) =>
                                              `${term.name} (${formatDateOnly(term.start_date)} - ${formatDateOnly(term.end_date)})`,
                                          )
                                          .join(', ')
                                      : 'No membership term records'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="data-section">
                          <div className="data-section-header">
                            <h4>Registered devices</h4>
                            <span>{studentProfile.devices.length}</span>
                          </div>
                          {studentProfile.devices.length === 0 ? (
                            <p className="muted-text">No registered devices found.</p>
                          ) : (
                            <div className="stack-list">
                              {studentProfile.devices.map((device) => (
                                <div className="data-card" key={device.registered_device_uuid}>
                                  <strong>{device.nickname || device.device_type}</strong>
                                  <span>
                                    {device.make || 'Unknown make'} · {device.model || 'Unknown model'}
                                  </span>
                                  <span>
                                    Serial: {device.serial_number || 'Not set'} · Color:{' '}
                                    {device.color || 'Not set'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}

export default App
