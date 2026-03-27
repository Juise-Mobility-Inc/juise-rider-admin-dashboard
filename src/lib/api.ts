export interface TokenPair {
  token: string
  exp: number
}

export interface AuthTokenBundle {
  k_guid: string
  access_token: TokenPair
  refresh_token: TokenPair
}

export interface AccessClaims {
  admin: boolean
  user_uuid: string
  app_id?: string
  school_id?: string
  created: number
  expires: number
  env: string
  tok: number
}

export interface AdminSession {
  authAppId: string
  tokens: AuthTokenBundle
  claims: AccessClaims
  user?: NebulaUser
}

export interface UserMediaAsset {
  media_uuid: string
  user_uuid: string
  app_id: string
  entity_type: string
  entity_uuid: string
  slot: string
  object_key: string
  content_type: string
  size: number
  storage_provider: string
  active: boolean
  created_at: number
  updated_at: number
}

export interface SchoolTerm {
  term_uuid: string
  app_id: string
  school_id: string
  name: string
  start_date: string
  end_date: string
  active: boolean
  created_at: number
  updated_at: number
}

export interface SchoolColorScheme {
  primary?: string
  secondary?: string
  accent?: string
  background?: string
  text?: string
}

export interface School {
  school_id: string
  app_id: string
  name: string
  title: string
  logo_url: string
  default_campus_id: string
  color_scheme: SchoolColorScheme
  terms: SchoolTerm[]
  metadata?: Record<string, unknown>
  active: boolean
  created_at: number
  updated_at: number
}

export interface SchoolWriteInput {
  name: string
  title: string
  logo_url: string
  default_campus_id: string
  color_scheme: SchoolColorScheme
  metadata: Record<string, unknown>
  active?: boolean
}

export interface SchoolTermWriteInput {
  term_uuid?: string
  name: string
  start_date: string
  end_date: string
}

export interface PackLocationInput {
  lat: number
  lng: number
}

export interface PackSchoolOwnerInput {
  app_id: string
  school_id: string
  campus_id?: string
}

export interface PackSpot {
  spot_uuid: string
  pack_uuid: string
  spot_number: number
  active: boolean
  updated: number
}

export interface Pack {
  pack_uuid: string
  name: string
  description: string
  active: boolean
  updated: number
  spot_count: number
  location?: PackLocationInput
  school_owner?: PackSchoolOwnerInput
  spots: PackSpot[]
}

export interface PackCreateForSchoolInput {
  name?: string
  description?: string
  number_of_spots: number
  location: PackLocationInput
  school_owner: PackSchoolOwnerInput
}

export interface PackSpotReservation {
  reservation_uuid: string
  spot_uuid: string
  pack_uuid: string
  user_uuid: string
  start_time: number
  end_time: number
  status: string
  reservation_kind: string
  membership_uuid?: string
  term_uuid?: string
  term_name: string
  approved_by?: string
  approved_at?: number
  student_confirmed_at?: number
  student_confirmation_qr_code_uuid?: string
  spot_number?: number
  pack_name?: string
  updated: number
  active: boolean
}

export interface NebulaUser {
  k_guid: string
  app_id?: string
  first_name: string
  last_name: string
  email: string
  username: string
  phone?: string | null
  is_admin: boolean
  updated: number
}

export interface UserSchoolMembershipTerm {
  term_uuid: string
  membership_uuid: string
  name: string
  start_date: string
  end_date: string
  active: boolean
  created_at: number
  updated_at: number
}

export interface UserSchoolMembership {
  membership_uuid: string
  user_uuid: string
  app_id: string
  school_id: string
  campus_id: string
  student_id: string
  status: string
  active: boolean
  created_at: number
  updated_at: number
  terms: UserSchoolMembershipTerm[]
  photo?: UserMediaAsset
  front_photo?: UserMediaAsset
  back_photo?: UserMediaAsset
}

export interface RegisteredDevice {
  registered_device_uuid: string
  user_uuid: string
  app_id: string
  membership_uuid?: string | null
  device_type: string
  make: string
  model: string
  nickname: string
  serial_number: string
  color: string
  metadata?: Record<string, unknown>
  active: boolean
  created_at: number
  updated_at: number
}

export interface StudentProfileBundle {
  user: NebulaUser
  memberships: UserSchoolMembership[]
  devices: RegisteredDevice[]
}

export interface SchoolStudentRosterEntry {
  user: NebulaUser
  membership: UserSchoolMembership
}

interface AuthAccountResponse {
  user: NebulaUser
  tokens: AuthTokenBundle
}

export interface SignedSchoolMediaItem {
  object_key: string
  get_url: string
}

type ServiceName = 'auth' | 'nebula' | 'hubStore' | 'kcaProxy'

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  authRequired?: boolean
  appIdHeader?: string
  retryOnUnauthorized?: boolean
  accessToken?: string
}

const serviceBase: Record<ServiceName, string> = {
  auth: import.meta.env.VITE_AUTH_API_BASE ?? '/auth-api',
  nebula: import.meta.env.VITE_NEBULA_API_BASE ?? '/nebula-api',
  hubStore: import.meta.env.VITE_HUB_STORE_API_BASE ?? '/hub-store-api',
  kcaProxy: import.meta.env.VITE_KCA_PROXY_API_BASE ?? '/kca-api',
}

let currentSession: AdminSession | null = null
let sessionObserver: ((session: AdminSession | null) => void) | null = null

function updateSession(session: AdminSession | null) {
  currentSession = session
  if (sessionObserver) {
    sessionObserver(session)
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

async function parseErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as {
      message?: string
      error?: string
    }
    if (payload.message) {
      return payload.message
    }
    if (payload.error) {
      return payload.error
    }
  }

  const text = await response.text()
  if (text.trim() !== '') {
    return text
  }
  return `Request failed with status ${response.status}`
}

async function refreshSession(): Promise<AdminSession> {
  const previousSession = currentSession
  if (!previousSession) {
    throw new Error('Login required')
  }

  const response = await fetch(`${serviceBase.auth}/api/v1/auth/refresh`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Id': previousSession.authAppId,
    },
    body: JSON.stringify(previousSession.tokens),
  })

  if (!response.ok) {
    const message = await parseErrorMessage(response)
    updateSession(null)
    throw new Error(message)
  }

  const tokens = await parseResponse<AuthTokenBundle>(response)
  const claims = await inspectAccessToken(tokens, previousSession.authAppId)
  const refreshedSession: AdminSession = {
    ...previousSession,
    tokens,
    claims,
  }

  updateSession(refreshedSession)

  try {
    const user = await fetchNebulaUser(claims.user_uuid, {
      accessToken: tokens.access_token.token,
      retryOnUnauthorized: false,
    })
    const hydratedSession: AdminSession = {
      ...refreshedSession,
      user,
    }
    updateSession(hydratedSession)
    return hydratedSession
  } catch {
    return refreshedSession
  }
}

async function request<T>(
  service: ServiceName,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    authRequired = true,
    appIdHeader,
    retryOnUnauthorized = true,
    accessToken,
  } = options

  const headers = new Headers()
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }
  if (appIdHeader) {
    headers.set('X-App-Id', appIdHeader)
  }
  if (authRequired) {
    const bearerToken = accessToken ?? currentSession?.tokens.access_token.token
    if (!bearerToken) {
      throw new Error('Login required')
    }
    headers.set('Authorization', `Bearer ${bearerToken}`)
  }

  const response = await fetch(`${serviceBase[service]}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (response.status === 401 && authRequired && retryOnUnauthorized) {
    await refreshSession()
    return request<T>(service, path, {
      ...options,
      retryOnUnauthorized: false,
    })
  }

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }

  return parseResponse<T>(response)
}

export function setApiSession(session: AdminSession | null) {
  currentSession = session
}

export function setSessionObserver(observer: ((session: AdminSession | null) => void) | null) {
  sessionObserver = observer
}

export async function inspectAccessToken(
  tokens: AuthTokenBundle,
  authAppId: string,
): Promise<AccessClaims> {
  return request<AccessClaims>('auth', '/api/v1/token/access', {
    method: 'PUT',
    body: tokens,
    authRequired: false,
    appIdHeader: authAppId,
    retryOnUnauthorized: false,
  })
}

export async function fetchNebulaUser(
  userUUID: string,
  options: Pick<RequestOptions, 'accessToken' | 'retryOnUnauthorized'> = {},
): Promise<NebulaUser> {
  return request<NebulaUser>('nebula', `/api/v1/user/${encodeURIComponent(userUUID)}`, options)
}

export async function loginWithIdentifier(
  identifier: string,
  password: string,
  authAppId: string,
): Promise<AdminSession> {
  const tokens = await request<AuthTokenBundle>('auth', '/api/v1/auth/login', {
    method: 'POST',
    body: {
      identifier,
      password,
      app_id: authAppId,
    },
    authRequired: false,
    appIdHeader: authAppId,
    retryOnUnauthorized: false,
  })

  const claims = await inspectAccessToken(tokens, authAppId)
  if (!claims.admin) {
    throw new Error('This account is not marked as an admin user.')
  }

  const session: AdminSession = {
    authAppId,
    tokens,
    claims,
  }
  updateSession(session)

  try {
    const user = await fetchNebulaUser(claims.user_uuid, {
      accessToken: tokens.access_token.token,
      retryOnUnauthorized: false,
    })
    const hydratedSession: AdminSession = {
      ...session,
      user,
    }
    updateSession(hydratedSession)
    return hydratedSession
  } catch {
    return session
  }
}

export async function createSchoolAdminAccount(
  authAppId: string,
  input: {
    school_id: string
    first?: string
    last?: string
    username: string
    email: string
    phone?: string
    password: string
  },
): Promise<AdminSession> {
  const payload: Record<string, unknown> = {
    app_id: authAppId,
    school_id: input.school_id,
    username: input.username,
    email: input.email,
    password: input.password,
  }

  const trimmedFirst = input.first?.trim()
  if (trimmedFirst) {
    payload.first = trimmedFirst
  }
  const trimmedLast = input.last?.trim()
  if (trimmedLast) {
    payload.last = trimmedLast
  }
  const trimmedPhone = input.phone?.trim()
  if (trimmedPhone) {
    payload.phone = trimmedPhone
  }

  const response = await request<AuthAccountResponse>('auth', '/api/v1/user/create-school-admin', {
    method: 'POST',
    body: payload,
    authRequired: false,
    appIdHeader: authAppId,
    retryOnUnauthorized: false,
  })

  const claims = await inspectAccessToken(response.tokens, authAppId)
  if (!claims.admin) {
    throw new Error('The created account is not marked as an admin user.')
  }

  const session: AdminSession = {
    authAppId,
    tokens: response.tokens,
    claims,
    user: response.user,
  }
  updateSession(session)
  return session
}

export async function fetchSchools(managedAppId: string): Promise<School[]> {
  return request<School[]>(
    'nebula',
    `/api/v1/apps/${encodeURIComponent(managedAppId)}/schools`,
    {
      appIdHeader: managedAppId,
    },
  )
}

export async function fetchSchool(managedAppId: string, schoolId: string): Promise<School> {
  return request<School>(
    'nebula',
    `/api/v1/apps/${encodeURIComponent(managedAppId)}/schools/${encodeURIComponent(schoolId)}`,
    {
      appIdHeader: managedAppId,
    },
  )
}

export async function saveSchool(
  managedAppId: string,
  schoolId: string,
  input: SchoolWriteInput,
): Promise<School> {
  return request<School>(
    'nebula',
    `/api/v1/apps/${encodeURIComponent(managedAppId)}/schools/${encodeURIComponent(schoolId)}`,
    {
      method: 'PUT',
      body: input,
      appIdHeader: managedAppId,
    },
  )
}

export async function saveSchoolTerms(
  managedAppId: string,
  schoolId: string,
  terms: SchoolTermWriteInput[],
): Promise<SchoolTerm[]> {
  return request<SchoolTerm[]>(
    'nebula',
    `/api/v1/apps/${encodeURIComponent(managedAppId)}/schools/${encodeURIComponent(schoolId)}/terms`,
    {
      method: 'PUT',
      body: { terms },
      appIdHeader: managedAppId,
    },
  )
}

export async function createSchoolPack(
  adminUser: string,
  input: PackCreateForSchoolInput,
): Promise<Pack> {
  return request<Pack>(
    'hubStore',
    `/api/v1/admin/${encodeURIComponent(adminUser)}/school-pack`,
    {
      method: 'POST',
      body: input,
      authRequired: false,
      appIdHeader: input.school_owner.app_id,
      retryOnUnauthorized: false,
    },
  )
}

export async function fetchPendingReservations(
  adminUser: string,
  managedAppId: string,
  schoolId: string,
): Promise<PackSpotReservation[]> {
  return fetchSchoolTermReservations(adminUser, managedAppId, schoolId, 'PendingApproval')
}

export async function fetchSchoolTermReservations(
  adminUser: string,
  managedAppId: string,
  schoolId: string,
  status?: string,
): Promise<PackSpotReservation[]> {
  const search = new URLSearchParams({
    app_id: managedAppId,
    school_id: schoolId,
  })
  if (status && status.trim() !== '') {
    search.set('status', status)
  }

  return request<PackSpotReservation[]>(
    'hubStore',
    `/api/v1/admin/${encodeURIComponent(adminUser)}/pack/term-reservations?${search.toString()}`,
    {
      authRequired: false,
      retryOnUnauthorized: false,
    },
  )
}

export async function fetchSchoolStudentRoster(
  managedAppId: string,
  schoolId: string,
): Promise<SchoolStudentRosterEntry[]> {
  return request<SchoolStudentRosterEntry[]>(
    'nebula',
    `/api/v1/apps/${encodeURIComponent(managedAppId)}/schools/${encodeURIComponent(schoolId)}/students`,
    {
      appIdHeader: managedAppId,
    },
  )
}

export async function fetchUserMediaAssets(
  managedAppId: string,
  userUUID: string,
  entityType: string,
  entityUUID: string,
): Promise<UserMediaAsset[]> {
  const search = new URLSearchParams({
    entity_type: entityType,
    entity_uuid: entityUUID,
  })

  return request<UserMediaAsset[]>(
    'nebula',
    `/api/v1/apps/${encodeURIComponent(managedAppId)}/user/${encodeURIComponent(userUUID)}/media?${search.toString()}`,
    {
      appIdHeader: managedAppId,
    },
  )
}

export async function signSchoolMedia(
  schoolId: string,
  objectKeys: string[],
): Promise<Record<string, string>> {
  const uniqueObjectKeys = Array.from(
    new Set(
      objectKeys
        .map((value) => value.trim())
        .filter((value) => value !== ''),
    ),
  )

  if (uniqueObjectKeys.length === 0) {
    return {}
  }

  const response = await request<{
    items: SignedSchoolMediaItem[]
  }>(
    'kcaProxy',
    `/api/v1/admin/school/${encodeURIComponent(schoolId)}/media/sign`,
    {
      method: 'POST',
      body: {
        object_keys: uniqueObjectKeys,
      },
    },
  )

  return Object.fromEntries(
    (response.items ?? []).map((item) => [item.object_key, item.get_url]),
  )
}

export async function approveReservation(
  adminUser: string,
  reservationUUID: string,
): Promise<PackSpotReservation> {
  return request<PackSpotReservation>(
    'hubStore',
    `/api/v1/admin/${encodeURIComponent(adminUser)}/pack/term-reservation/${encodeURIComponent(reservationUUID)}/approve`,
    {
      method: 'POST',
      authRequired: false,
      retryOnUnauthorized: false,
    },
  )
}

export async function denyReservation(
  adminUser: string,
  reservationUUID: string,
): Promise<PackSpotReservation> {
  return request<PackSpotReservation>(
    'hubStore',
    `/api/v1/admin/${encodeURIComponent(adminUser)}/pack/term-reservation/${encodeURIComponent(reservationUUID)}/deny`,
    {
      method: 'POST',
      authRequired: false,
      retryOnUnauthorized: false,
    },
  )
}

export async function fetchStudentProfile(
  managedAppId: string,
  userUUID: string,
): Promise<StudentProfileBundle> {
  const encodedAppId = encodeURIComponent(managedAppId)
  const encodedUserUUID = encodeURIComponent(userUUID)

  const [user, memberships, devices] = await Promise.all([
    request<NebulaUser>(
      'nebula',
      `/api/v1/apps/${encodedAppId}/user/${encodedUserUUID}`,
      {
        appIdHeader: managedAppId,
      },
    ),
    request<UserSchoolMembership[]>(
      'nebula',
      `/api/v1/apps/${encodedAppId}/user/${encodedUserUUID}/school-memberships`,
      {
        appIdHeader: managedAppId,
      },
    ),
    request<RegisteredDevice[]>(
      'nebula',
      `/api/v1/apps/${encodedAppId}/user/${encodedUserUUID}/registered-devices`,
      {
        appIdHeader: managedAppId,
      },
    ),
  ])

  return {
    user,
    memberships,
    devices,
  }
}
