export interface TokenPair {
  token: string;
  exp: number;
}

export interface AuthTokenBundle {
  k_guid: string;
  access_token: TokenPair;
  refresh_token: TokenPair;
}

export interface AccessClaims {
  admin: boolean;
  user_uuid: string;
  app_id?: string;
  school_id?: string;
  created: number;
  expires: number;
  env: string;
  tok: number;
}

export interface AdminSession {
  authAppId: string;
  tokens: AuthTokenBundle;
  claims: AccessClaims;
  user?: NebulaUser;
}

export interface UserMediaAsset {
  media_uuid: string;
  user_uuid: string;
  app_id: string;
  entity_type: string;
  entity_uuid: string;
  slot: string;
  object_key: string;
  content_type: string;
  size: number;
  storage_provider: string;
  active: boolean;
  created_at: number;
  updated_at: number;
}

export interface SchoolTerm {
  term_uuid: string;
  app_id: string;
  school_id: string;
  name: string;
  start_date: string;
  end_date: string;
  active: boolean;
  created_at: number;
  updated_at: number;
}

export interface SchoolPOI {
  poi_uuid: string;
  app_id: string;
  school_id: string;
  title: string;
  description: string;
  lat: number;
  lng: number;
  bonus_points: number;
  active: boolean;
  created_at: number;
  updated_at: number;
}

export interface SchoolZonePoint {
  lat: number;
  lng: number;
}

export interface SchoolZone {
  zone_uuid: string;
  app_id: string;
  school_id: string;
  title: string;
  description: string;
  zone_type: "no_go" | "speed_limit";
  speed_limit_mph?: number | null;
  polygon: SchoolZonePoint[];
  active: boolean;
  created_at: number;
  updated_at: number;
}

export interface SchoolChallenge {
  challenge_uuid: string;
  app_id: string;
  school_id: string;
  audience_type: "user" | "campaign_group";
  title: string;
  description: string;
  image_url: string;
  metric_type: "distance_miles" | "points";
  target_value: number;
  start_time: number;
  end_time: number;
  active: boolean;
  created_at: number;
  updated_at: number;
}

export interface SchoolChallengeWriteInput {
  audience_type: "user" | "campaign_group";
  title: string;
  description: string;
  image_url: string;
  metric_type: "distance_miles" | "points";
  target_value: number;
  start_time: number;
  end_time: number;
  active?: boolean;
}

export interface SchoolChallengeImageUploadInitResponse {
  school_id: string;
  object_key: string;
  public_url: string;
  put_url: string;
  content_type: string;
  expires_in: number;
}

export interface SchoolChallengeImageUploadResponse {
  school_id: string;
  object_key: string;
  public_url: string;
  content_type: string;
  size: number;
}

export interface SchoolChallengeParticipation {
  participation_uuid: string;
  challenge_uuid: string;
  app_id: string;
  school_id: string;
  user_uuid: string;
  membership_uuid: string;
  joined_at: number;
  left_at?: number | null;
  active: boolean;
  created_at: number;
  updated_at: number;
}

export interface SchoolChallengeParticipantProgress {
  participation_uuid: string;
  challenge_uuid: string;
  participant_type?: "user" | "campaign_group";
  user_uuid: string;
  membership_uuid: string;
  campaign_group_uuid?: string;
  campaign_group_name?: string;
  campaign_group_image_url?: string;
  owner_user_uuid?: string;
  member_count?: number;
  student_id: string;
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  joined_at: number;
  left_at?: number | null;
  active: boolean;
  metric_type: "distance_miles" | "points";
  target_value: number;
  progress_value: number;
  completion_percent: number;
  completed: boolean;
  total_sessions: number;
  last_activity_at?: number | null;
}

export interface SchoolColorScheme {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  text?: string;
}

export interface School {
  school_id: string;
  app_id: string;
  name: string;
  title: string;
  logo_url: string;
  default_campus_id: string;
  color_scheme: SchoolColorScheme;
  terms: SchoolTerm[];
  metadata?: Record<string, unknown>;
  active: boolean;
  created_at: number;
  updated_at: number;
}

export interface SchoolWriteInput {
  name: string;
  title: string;
  logo_url: string;
  default_campus_id: string;
  color_scheme: SchoolColorScheme;
  metadata: Record<string, unknown>;
  active?: boolean;
}

export interface SchoolTermWriteInput {
  term_uuid?: string;
  name: string;
  start_date: string;
  end_date: string;
}

export interface SchoolPOIWriteInput {
  poi_uuid?: string;
  title: string;
  description: string;
  lat: number;
  lng: number;
  bonus_points: number;
}

export interface SchoolZoneWriteInput {
  zone_uuid?: string;
  title: string;
  description: string;
  zone_type: "no_go" | "speed_limit";
  speed_limit_mph?: number | null;
  polygon: SchoolZonePoint[];
}

export interface UserSchoolChallengeProgress {
  challenge: SchoolChallenge;
  participation?: SchoolChallengeParticipation | null;
  progress_value: number;
  completion_percent: number;
  completed: boolean;
  total_sessions: number;
  last_activity_at?: number | null;
}

export interface PackLocationInput {
  lat: number;
  lng: number;
}

export interface PackSchoolOwnerInput {
  app_id: string;
  school_id: string;
  campus_id?: string;
}

export interface PackQrCode {
  qr_code_uuid: string;
  pack_uuid: string;
  bucket_key: string;
  path_do_spaces: string;
  type: string;
  updated: number;
  active: boolean;
}

export interface PackSpotQrCode {
  qr_code_uuid: string;
  spot_uuid: string;
  bucket_key: string;
  path_do_spaces: string;
  type: string;
  updated: number;
  active: boolean;
}

export interface PackSpot {
  spot_uuid: string;
  pack_uuid: string;
  spot_number: number;
  qr_code?: PackSpotQrCode;
  active: boolean;
  updated: number;
}

export interface PackPhoto {
  photo_uuid: string;
  pack_uuid: string;
  bucket_key: string;
  path_do_spaces: string;
  updated: number;
  active: boolean;
}

export interface Pack {
  pack_uuid: string;
  name: string;
  description: string;
  active: boolean;
  updated: number;
  spot_count: number;
  location?: PackLocationInput;
  school_owner?: PackSchoolOwnerInput;
  photo?: PackPhoto;
  qr_code?: PackQrCode;
  spots: PackSpot[];
}

export interface PackCreateForSchoolInput {
  name?: string;
  description?: string;
  number_of_spots: number;
  location: PackLocationInput;
  school_owner: PackSchoolOwnerInput;
}

export interface PackUpdateInput {
  name?: string;
  description?: string;
  location?: PackLocationInput;
  active?: boolean;
}

export interface PackSpotReservation {
  reservation_uuid: string;
  spot_uuid: string;
  pack_uuid: string;
  user_uuid: string;
  start_time: number;
  end_time: number;
  status: string;
  reservation_kind: string;
  membership_uuid?: string;
  term_uuid?: string;
  term_name: string;
  approved_by?: string;
  approved_at?: number;
  student_confirmed_at?: number;
  student_confirmation_qr_code_uuid?: string;
  spot_number?: number;
  pack_name?: string;
  updated: number;
  active: boolean;
}

export interface NebulaUser {
  k_guid: string;
  app_id?: string;
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  phone?: string | null;
  is_admin: boolean;
  updated: number;
}

export interface UserSchoolMembershipTerm {
  term_uuid: string;
  membership_uuid: string;
  name: string;
  start_date: string;
  end_date: string;
  active: boolean;
  created_at: number;
  updated_at: number;
}

export interface UserSchoolMembership {
  membership_uuid: string;
  user_uuid: string;
  app_id: string;
  school_id: string;
  campus_id: string;
  student_id: string;
  status: string;
  active: boolean;
  created_at: number;
  updated_at: number;
  terms: UserSchoolMembershipTerm[];
  photo?: UserMediaAsset;
  front_photo?: UserMediaAsset;
  back_photo?: UserMediaAsset;
}

export interface RegisteredDevice {
  registered_device_uuid: string;
  user_uuid: string;
  app_id: string;
  membership_uuid?: string | null;
  device_type: string;
  make: string;
  model: string;
  nickname: string;
  serial_number: string;
  color: string;
  metadata?: Record<string, unknown>;
  active: boolean;
  created_at: number;
  updated_at: number;
}

export interface StudentProfileBundle {
  user: NebulaUser;
  memberships: UserSchoolMembership[];
  devices: RegisteredDevice[];
}

export interface StudentPublicUserSummary {
  user_uuid: string;
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  school_id: string;
  campus_id: string;
  student_id: string;
  profile_image_url?: string | null;
  is_friend: boolean;
  is_pending: boolean;
  requested_by?: string;
}

export interface StudentPublicProfile {
  user: StudentPublicUserSummary;
  total_point_count: number;
  active_challenges: unknown[];
  posts: unknown[];
}

export interface StudentRouteHistoryVisitedPOI {
  poi_uuid: string;
  school_id: string;
  title: string;
  description: string;
  lat: number;
  lng: number;
  bonus_points: number;
  visited_at: number;
}

export interface StudentRouteHistoryPenaltyEvent {
  zone_uuid: string;
  school_id: string;
  title: string;
  description: string;
  zone_type: "no_go" | "speed_limit" | string;
  reason: string;
  lat: number;
  lng: number;
  speed_limit_mph?: number | null;
  duration_ms: number;
  points_lost: number;
  occurred_at: number;
}

export interface StudentRouteHistoryPoint {
  id: string;
  latitude: number;
  longitude: number;
  speed_mps?: number | null;
  altitude?: number | null;
  accuracy?: number | null;
  heading?: number | null;
  timestamp: number;
}

export interface StudentRouteHistorySession {
  session_id: string;
  user_uuid: string;
  app_id: string;
  school_id: string;
  tracking_source: string;
  trip_mode: string;
  started_at: number;
  ended_at?: number | null;
  distance_meters: number;
  duration_seconds: number;
  top_speed_mps: number;
  average_speed_mps: number;
  bonus_points: number;
  penalty_points: number;
  shared_to_friends: boolean;
  visited_pois: StudentRouteHistoryVisitedPOI[];
  penalty_events: StudentRouteHistoryPenaltyEvent[];
  school_zones?: SchoolZone[];
  points: StudentRouteHistoryPoint[];
  created_at: number;
  updated_at: number;
}

interface RouteHistorySummary {
  total_sessions: number;
  total_distance_meters: number;
  total_duration_seconds: number;
  total_bonus_points: number;
  total_penalty_points: number;
  total_point_count: number;
}

const sharedManagedAppIds = ["juise-admin-app", "juise-customer-app"] as const;

function buildManagedAppCandidates(managedAppId: string): string[] {
  return Array.from(
    new Set(
      [managedAppId.trim(), ...sharedManagedAppIds].filter(
        (value): value is string => value !== "",
      ),
    ),
  );
}

function dedupeMediaAssets(
  assets: UserMediaAsset[],
  appPriority: Map<string, number>,
): UserMediaAsset[] {
  return [...assets]
    .sort((left, right) => {
      const leftPriority = appPriority.get(left.app_id?.trim() ?? "") ?? 99;
      const rightPriority = appPriority.get(right.app_id?.trim() ?? "") ?? 99;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      if (left.updated_at !== right.updated_at) {
        return right.updated_at - left.updated_at;
      }
      return right.created_at - left.created_at;
    })
    .filter((asset, index, source) => {
      const key =
        asset.media_uuid?.trim() ||
        `${asset.object_key?.trim() ?? ""}|${asset.entity_type}|${asset.entity_uuid}|${asset.slot}`;
      return (
        key !== "" &&
        source.findIndex((candidate) => {
          const candidateKey =
            candidate.media_uuid?.trim() ||
            `${candidate.object_key?.trim() ?? ""}|${candidate.entity_type}|${candidate.entity_uuid}|${candidate.slot}`;
          return candidateKey === key;
        }) === index
      );
    });
}

function dedupeRegisteredDevices(
  devices: RegisteredDevice[],
  appPriority: Map<string, number>,
): RegisteredDevice[] {
  return [...devices]
    .sort((left, right) => {
      const leftPriority = appPriority.get(left.app_id?.trim() ?? "") ?? 99;
      const rightPriority = appPriority.get(right.app_id?.trim() ?? "") ?? 99;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      if (left.updated_at !== right.updated_at) {
        return right.updated_at - left.updated_at;
      }
      return right.created_at - left.created_at;
    })
    .filter((device, index, source) => {
      const key = device.registered_device_uuid?.trim() ?? "";
      return (
        key !== "" &&
        source.findIndex(
          (candidate) =>
            candidate.registered_device_uuid?.trim() === key,
        ) === index
      );
    });
}

function pickAvatarAsset(assets: UserMediaAsset[]): UserMediaAsset | null {
  return (
    [...assets]
      .filter((asset) => asset.slot === "avatar" && asset.object_key?.trim())
      .sort((left, right) => {
        if (left.updated_at !== right.updated_at) {
          return right.updated_at - left.updated_at;
        }
        return right.created_at - left.created_at;
      })[0] ?? null
  );
}

async function resolveSignedUserProfileImageUrl(
  managedAppId: string,
  schoolId: string,
  targetUserUUID: string,
): Promise<string | null> {
  const mediaAssets = await fetchUserMediaAssets(
    managedAppId,
    targetUserUUID,
    "user_profile",
    targetUserUUID,
  ).catch(() => [] as UserMediaAsset[]);
  const avatarAsset = pickAvatarAsset(mediaAssets);
  if (!avatarAsset?.object_key) {
    return null;
  }

  const signedAvatarUrls = await signSchoolMedia(schoolId, [
    avatarAsset.object_key,
  ]).catch(() => ({} as Record<string, string>));
  return signedAvatarUrls[avatarAsset.object_key] ?? null;
}

export interface SchoolStudentRosterEntry {
  user: NebulaUser;
  membership: UserSchoolMembership;
}

interface AuthAccountResponse {
  user: NebulaUser;
  tokens: AuthTokenBundle;
}

export interface SignedSchoolMediaItem {
  object_key: string;
  get_url: string;
}

type ServiceName = "auth" | "nebula" | "hubStore" | "kcaProxy";

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  authRequired?: boolean;
  appIdHeader?: string;
  retryOnUnauthorized?: boolean;
  accessToken?: string;
}

function normalizeBaseUrl(value: string | undefined): string {
  return (value?.trim() ?? "").replace(/\/+$/, "");
}

function resolveServiceBaseUrl(
  developmentBase: string,
  configuredBase: string | undefined,
  _productionFallback: string,
): string {
  const normalizedConfiguredBase = normalizeBaseUrl(configuredBase);
  if (!normalizedConfiguredBase) {
    // Always use the proxy path — the Vite dev and preview servers both
    // forward these paths to the real backends via the proxy config.
    return developmentBase;
  }

  return normalizedConfiguredBase;
}

const serviceBase: Record<ServiceName, string> = {
  auth: resolveServiceBaseUrl(
    "/auth-api",
    import.meta.env.VITE_AUTH_API_BASE,
    normalizeBaseUrl(
      import.meta.env.VITE_AUTH_PROXY_TARGET ||
        "https://global-auth-service.kuhmute.net",
    ),
  ),
  nebula: resolveServiceBaseUrl(
    "/nebula-api",
    import.meta.env.VITE_NEBULA_API_BASE,
    normalizeBaseUrl(
      import.meta.env.VITE_NEBULA_PROXY_TARGET ||
        "https://nebula-user-server.kuhmute.net",
    ),
  ),
  hubStore: resolveServiceBaseUrl(
    "/hub-store-api",
    import.meta.env.VITE_HUB_STORE_API_BASE,
    normalizeBaseUrl(
      import.meta.env.VITE_HUB_STORE_PROXY_TARGET ||
        "https://hub-store-service.kuhmute.net",
    ),
  ),
  kcaProxy: resolveServiceBaseUrl(
    "/kca-api",
    import.meta.env.VITE_KCA_PROXY_API_BASE,
    normalizeBaseUrl(
      import.meta.env.VITE_KCA_PROXY_TARGET ||
        "https://kca-proxy.kuhmute.net",
    ),
  ),
};

let currentSession: AdminSession | null = null;
let sessionObserver: ((session: AdminSession | null) => void) | null = null;

function updateSession(session: AdminSession | null) {
  currentSession = session;
  if (sessionObserver) {
    sessionObserver(session);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

async function parseErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (contentType.includes("application/json") && text.trim() !== "") {
    try {
      const payload = JSON.parse(text) as {
        message?: string;
        error?: string;
      };
      if (payload.message) {
        return payload.message;
      }
      if (payload.error) {
        return payload.error;
      }
    } catch {
      // Fall through to raw text handling.
    }
  }

  if (text.trim() !== "") {
    return text;
  }
  return `Request failed with status ${response.status}`;
}

async function refreshSession(): Promise<AdminSession> {
  const previousSession = currentSession;
  if (!previousSession) {
    throw new Error("Login required");
  }

  const response = await fetch(`${serviceBase.auth}/api/v1/auth/refresh`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-App-Id": previousSession.authAppId,
    },
    body: JSON.stringify(previousSession.tokens),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    updateSession(null);
    throw new Error(message);
  }

  const tokens = await parseResponse<AuthTokenBundle>(response);
  const claims = await inspectAccessToken(tokens, previousSession.authAppId);
  const refreshedSession: AdminSession = {
    ...previousSession,
    tokens,
    claims,
  };

  updateSession(refreshedSession);

  try {
    const user = await fetchNebulaUser(claims.user_uuid, {
      accessToken: tokens.access_token.token,
      retryOnUnauthorized: false,
    });
    const hydratedSession: AdminSession = {
      ...refreshedSession,
      user,
    };
    updateSession(hydratedSession);
    return hydratedSession;
  } catch {
    return refreshedSession;
  }
}

async function request<T>(
  service: ServiceName,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = "GET",
    body,
    authRequired = true,
    appIdHeader,
    retryOnUnauthorized = true,
    accessToken,
  } = options;

  const headers = new Headers();
  const isFormDataBody =
    typeof FormData !== "undefined" && body instanceof FormData;

  if (body !== undefined && !isFormDataBody) {
    headers.set("Content-Type", "application/json");
  }
  if (appIdHeader) {
    headers.set("X-App-Id", appIdHeader);
  }
  if (authRequired) {
    const bearerToken =
      accessToken ?? currentSession?.tokens.access_token.token;
    if (!bearerToken) {
      throw new Error("Login required");
    }
    headers.set("Authorization", `Bearer ${bearerToken}`);
  }

  const response = await fetch(`${serviceBase[service]}${path}`, {
    method,
    headers,
    body: isFormDataBody
      ? body
      : body !== undefined
        ? JSON.stringify(body)
        : undefined,
  });

  if (response.status === 401 && authRequired && retryOnUnauthorized) {
    await refreshSession();
    return request<T>(service, path, {
      ...options,
      retryOnUnauthorized: false,
    });
  }

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return parseResponse<T>(response);
}

export function setApiSession(session: AdminSession | null) {
  currentSession = session;
}

export function setSessionObserver(
  observer: ((session: AdminSession | null) => void) | null,
) {
  sessionObserver = observer;
}

export async function inspectAccessToken(
  tokens: AuthTokenBundle,
  authAppId: string,
): Promise<AccessClaims> {
  return request<AccessClaims>("auth", "/api/v1/token/access", {
    method: "PUT",
    body: tokens,
    authRequired: false,
    appIdHeader: authAppId,
    retryOnUnauthorized: false,
  });
}

export async function fetchNebulaUser(
  userUUID: string,
  options: Pick<RequestOptions, "accessToken" | "retryOnUnauthorized"> = {},
): Promise<NebulaUser> {
  return request<NebulaUser>(
    "nebula",
    `/api/v1/user/${encodeURIComponent(userUUID)}`,
    options,
  );
}

export async function loginWithIdentifier(
  identifier: string,
  password: string,
  authAppId: string,
): Promise<AdminSession> {
  const tokens = await request<AuthTokenBundle>("auth", "/api/v1/auth/login", {
    method: "POST",
    body: {
      identifier,
      password,
      app_id: authAppId,
    },
    authRequired: false,
    appIdHeader: authAppId,
    retryOnUnauthorized: false,
  });

  const claims = await inspectAccessToken(tokens, authAppId);
  if (!claims.admin) {
    throw new Error("This account is not marked as an admin user.");
  }

  const session: AdminSession = {
    authAppId,
    tokens,
    claims,
  };
  updateSession(session);

  try {
    const user = await fetchNebulaUser(claims.user_uuid, {
      accessToken: tokens.access_token.token,
      retryOnUnauthorized: false,
    });
    const hydratedSession: AdminSession = {
      ...session,
      user,
    };
    updateSession(hydratedSession);
    return hydratedSession;
  } catch {
    return session;
  }
}

export async function createSchoolAdminAccount(
  authAppId: string,
  input: {
    school_id: string;
    first?: string;
    last?: string;
    username: string;
    email: string;
    phone?: string;
    password: string;
  },
): Promise<AdminSession> {
  const payload: Record<string, unknown> = {
    app_id: authAppId,
    school_id: input.school_id,
    username: input.username,
    email: input.email,
    password: input.password,
  };

  const trimmedFirst = input.first?.trim();
  if (trimmedFirst) {
    payload.first = trimmedFirst;
  }
  const trimmedLast = input.last?.trim();
  if (trimmedLast) {
    payload.last = trimmedLast;
  }
  const trimmedPhone = input.phone?.trim();
  if (trimmedPhone) {
    payload.phone = trimmedPhone;
  }

  const response = await request<AuthAccountResponse>(
    "auth",
    "/api/v1/user/create-school-admin",
    {
      method: "POST",
      body: payload,
      authRequired: false,
      appIdHeader: authAppId,
      retryOnUnauthorized: false,
    },
  );

  const claims = await inspectAccessToken(response.tokens, authAppId);
  if (!claims.admin) {
    throw new Error("The created account is not marked as an admin user.");
  }

  const session: AdminSession = {
    authAppId,
    tokens: response.tokens,
    claims,
    user: response.user,
  };
  updateSession(session);
  return session;
}

export async function fetchSchools(managedAppId: string): Promise<School[]> {
  return request<School[]>(
    "nebula",
    `/api/v1/apps/${encodeURIComponent(managedAppId)}/schools`,
    {
      appIdHeader: managedAppId,
    },
  );
}

export async function fetchSchool(
  managedAppId: string,
  schoolId: string,
): Promise<School> {
  return request<School>(
    "nebula",
    `/api/v1/apps/${encodeURIComponent(managedAppId)}/schools/${encodeURIComponent(schoolId)}`,
    {
      appIdHeader: managedAppId,
    },
  );
}

export async function saveSchool(
  managedAppId: string,
  schoolId: string,
  input: SchoolWriteInput,
): Promise<School> {
  return request<School>(
    "nebula",
    `/api/v1/apps/${encodeURIComponent(managedAppId)}/schools/${encodeURIComponent(schoolId)}`,
    {
      method: "PUT",
      body: input,
      appIdHeader: managedAppId,
    },
  );
}

export async function saveSchoolTerms(
  managedAppId: string,
  schoolId: string,
  terms: SchoolTermWriteInput[],
): Promise<SchoolTerm[]> {
  return request<SchoolTerm[]>(
    "nebula",
    `/api/v1/apps/${encodeURIComponent(managedAppId)}/schools/${encodeURIComponent(schoolId)}/terms`,
    {
      method: "PUT",
      body: { terms },
      appIdHeader: managedAppId,
    },
  );
}

export async function fetchSchoolPOIs(
  managedAppId: string,
  schoolId: string,
): Promise<SchoolPOI[]> {
  return request<SchoolPOI[]>(
    "nebula",
    `/api/v1/apps/${encodeURIComponent(managedAppId)}/schools/${encodeURIComponent(schoolId)}/pois`,
    {
      appIdHeader: managedAppId,
    },
  );
}

export async function saveSchoolPOIs(
  managedAppId: string,
  schoolId: string,
  pois: SchoolPOIWriteInput[],
): Promise<SchoolPOI[]> {
  return request<SchoolPOI[]>(
    "nebula",
    `/api/v1/apps/${encodeURIComponent(managedAppId)}/schools/${encodeURIComponent(schoolId)}/pois`,
    {
      method: "PUT",
      body: { pois },
      appIdHeader: managedAppId,
    },
  );
}

export async function fetchSchoolZones(
  managedAppId: string,
  schoolId: string,
): Promise<SchoolZone[]> {
  return request<SchoolZone[]>(
    "nebula",
    `/api/v1/apps/${encodeURIComponent(managedAppId)}/schools/${encodeURIComponent(schoolId)}/zones`,
    {
      appIdHeader: managedAppId,
    },
  );
}

export async function saveSchoolZones(
  managedAppId: string,
  schoolId: string,
  zones: SchoolZoneWriteInput[],
): Promise<SchoolZone[]> {
  return request<SchoolZone[]>(
    "nebula",
    `/api/v1/apps/${encodeURIComponent(managedAppId)}/schools/${encodeURIComponent(schoolId)}/zones`,
    {
      method: "PUT",
      body: { zones },
      appIdHeader: managedAppId,
    },
  );
}

export async function fetchSchoolChallenges(
  managedAppId: string,
  schoolId: string,
): Promise<SchoolChallenge[]> {
  return request<SchoolChallenge[]>(
    "nebula",
    `/api/v1/apps/${encodeURIComponent(managedAppId)}/schools/${encodeURIComponent(schoolId)}/challenges`,
    {
      appIdHeader: managedAppId,
    },
  );
}

export async function createSchoolChallenge(
  managedAppId: string,
  schoolId: string,
  input: SchoolChallengeWriteInput,
): Promise<SchoolChallenge> {
  return request<SchoolChallenge>(
    "nebula",
    `/api/v1/apps/${encodeURIComponent(managedAppId)}/schools/${encodeURIComponent(schoolId)}/challenges`,
    {
      method: "POST",
      body: input,
      appIdHeader: managedAppId,
    },
  );
}

export async function updateSchoolChallenge(
  managedAppId: string,
  schoolId: string,
  challengeUUID: string,
  input: SchoolChallengeWriteInput,
): Promise<SchoolChallenge> {
  return request<SchoolChallenge>(
    "nebula",
    `/api/v1/apps/${encodeURIComponent(managedAppId)}/schools/${encodeURIComponent(schoolId)}/challenges/${encodeURIComponent(challengeUUID)}`,
    {
      method: "PUT",
      body: input,
      appIdHeader: managedAppId,
    },
  );
}

export async function deleteSchoolChallenge(
  managedAppId: string,
  schoolId: string,
  challengeUUID: string,
): Promise<void> {
  return request<void>(
    "nebula",
    `/api/v1/apps/${encodeURIComponent(managedAppId)}/schools/${encodeURIComponent(schoolId)}/challenges/${encodeURIComponent(challengeUUID)}`,
    {
      method: "DELETE",
      appIdHeader: managedAppId,
    },
  );
}

export async function fetchSchoolChallengeParticipants(
  managedAppId: string,
  schoolId: string,
  challengeUUID: string,
): Promise<SchoolChallengeParticipantProgress[]> {
  return request<SchoolChallengeParticipantProgress[]>(
    "nebula",
    `/api/v1/apps/${encodeURIComponent(managedAppId)}/schools/${encodeURIComponent(schoolId)}/challenges/${encodeURIComponent(challengeUUID)}/participants`,
    {
      appIdHeader: managedAppId,
    },
  );
}

export async function initSchoolChallengeImageUpload(
  managedAppId: string,
  schoolId: string,
  input: {
    file_ext?: string;
    content_type?: string;
  },
): Promise<SchoolChallengeImageUploadInitResponse> {
  return request<SchoolChallengeImageUploadInitResponse>(
    "nebula",
    `/api/v1/apps/${encodeURIComponent(managedAppId)}/schools/${encodeURIComponent(schoolId)}/challenges/media/upload/init`,
    {
      method: "POST",
      body: input,
      appIdHeader: managedAppId,
    },
  );
}

export async function uploadSchoolChallengeImage(
  managedAppId: string,
  schoolId: string,
  file: File,
  retryOnUnauthorized = true,
): Promise<SchoolChallengeImageUploadResponse> {
  const bearerToken = currentSession?.tokens.access_token.token;
  if (!bearerToken) {
    throw new Error("Login required");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("file_ext", file.name.split(".").pop()?.trim() ?? "");
  if (file.type) {
    formData.append("content_type", file.type);
  }

  const response = await fetch(
    `${serviceBase.nebula}/api/v1/apps/${encodeURIComponent(managedAppId)}/schools/${encodeURIComponent(schoolId)}/challenges/media/upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "X-App-Id": managedAppId,
      },
      body: formData,
    },
  );

  if (response.status === 401 && retryOnUnauthorized) {
    await refreshSession();
    return uploadSchoolChallengeImage(managedAppId, schoolId, file, false);
  }

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return parseResponse<SchoolChallengeImageUploadResponse>(response);
}

export async function uploadFileToSignedUrl(
  putUrl: string,
  file: Blob,
  contentType?: string,
): Promise<void> {
  const headers = new Headers();
  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  const response = await fetch(putUrl, {
    method: "PUT",
    headers,
    body: file,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text.trim() || `Upload failed with status ${response.status}`);
  }
}

export async function createSchoolPack(
  adminUser: string,
  input: PackCreateForSchoolInput,
  photoFile?: File | null,
): Promise<Pack> {
  const formData = new FormData();
  if (input.name !== undefined) {
    formData.append("name", input.name);
  }
  if (input.description !== undefined) {
    formData.append("description", input.description);
  }
  formData.append("number_of_spots", String(input.number_of_spots));
  formData.append("location_lat", String(input.location.lat));
  formData.append("location_lng", String(input.location.lng));
  formData.append("school_owner_app_id", input.school_owner.app_id);
  formData.append("school_owner_school_id", input.school_owner.school_id);
  if (input.school_owner.campus_id) {
    formData.append("school_owner_campus_id", input.school_owner.campus_id);
  }
  if (photoFile) {
    formData.append("photo", photoFile);
  }

  return request<Pack>(
    "hubStore",
    `/api/v1/admin/${encodeURIComponent(adminUser)}/school-pack`,
    {
      method: "POST",
      body: formData,
      authRequired: false,
      appIdHeader: input.school_owner.app_id,
      retryOnUnauthorized: false,
    },
  );
}

export async function updateSchoolPack(
  adminUser: string,
  managedAppId: string,
  packUUID: string,
  input: PackUpdateInput,
  photoFile?: File | null,
): Promise<Pack> {
  const formData = new FormData();
  if (input.name !== undefined) {
    formData.append("name", input.name);
  }
  if (input.description !== undefined) {
    formData.append("description", input.description);
  }
  if (input.active !== undefined) {
    formData.append("active", String(input.active));
  }
  if (input.location) {
    formData.append("location_lat", String(input.location.lat));
    formData.append("location_lng", String(input.location.lng));
  }
  if (photoFile) {
    formData.append("photo", photoFile);
  }

  return request<Pack>(
    "hubStore",
    `/api/v1/admin/${encodeURIComponent(adminUser)}/pack/${encodeURIComponent(packUUID)}`,
    {
      method: "PUT",
      body: formData,
      authRequired: false,
      appIdHeader: managedAppId,
      retryOnUnauthorized: false,
    },
  );
}

export async function fetchAdminSchoolPacks(
  adminUser: string,
  managedAppId: string,
  schoolId: string,
): Promise<Pack[]> {
  const search = new URLSearchParams({
    app_id: managedAppId,
    school_id: schoolId,
  });

  return request<Pack[]>(
    "hubStore",
    `/api/v1/admin/${encodeURIComponent(adminUser)}/school-packs?${search.toString()}`,
    {
      authRequired: false,
      retryOnUnauthorized: false,
    },
  );
}

export function getAdminPackQrCodeDownloadUrl(
  adminUser: string,
  packUUID: string,
): string {
  return `${serviceBase.hubStore}/api/v1/admin/${encodeURIComponent(adminUser)}/pack/${encodeURIComponent(packUUID)}/qr-code/download`;
}

export function getAdminPackSpotQrCodeDownloadUrl(
  adminUser: string,
  spotUUID: string,
): string {
  return `${serviceBase.hubStore}/api/v1/admin/${encodeURIComponent(adminUser)}/pack/spot/${encodeURIComponent(spotUUID)}/qr-code/download`;
}

export async function generateAdminPackQrCode(
  adminUser: string,
  packUUID: string,
): Promise<Pack> {
  return request<Pack>(
    "hubStore",
    `/api/v1/admin/${encodeURIComponent(adminUser)}/pack/${encodeURIComponent(packUUID)}/qr-code`,
    {
      method: "POST",
      authRequired: false,
      retryOnUnauthorized: false,
    },
  );
}

export async function generateAdminPackSpotQrCode(
  adminUser: string,
  spotUUID: string,
): Promise<PackSpot> {
  return request<PackSpot>(
    "hubStore",
    `/api/v1/admin/${encodeURIComponent(adminUser)}/pack/spot/${encodeURIComponent(spotUUID)}/qr-code`,
    {
      method: "POST",
      authRequired: false,
      retryOnUnauthorized: false,
    },
  );
}

export async function fetchPendingReservations(
  adminUser: string,
  managedAppId: string,
  schoolId: string,
): Promise<PackSpotReservation[]> {
  return fetchSchoolTermReservations(
    adminUser,
    managedAppId,
    schoolId,
    "PendingApproval",
  );
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
  });
  if (status && status.trim() !== "") {
    search.set("status", status);
  }

  return request<PackSpotReservation[]>(
    "hubStore",
    `/api/v1/admin/${encodeURIComponent(adminUser)}/pack/term-reservations?${search.toString()}`,
    {
      authRequired: false,
      retryOnUnauthorized: false,
    },
  );
}

export async function fetchSchoolStudentRoster(
  managedAppId: string,
  schoolId: string,
): Promise<SchoolStudentRosterEntry[]> {
  return request<SchoolStudentRosterEntry[]>(
    "nebula",
    `/api/v1/apps/${encodeURIComponent(managedAppId)}/schools/${encodeURIComponent(schoolId)}/students`,
    {
      appIdHeader: managedAppId,
    },
  );
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
  });
  const appCandidates = buildManagedAppCandidates(managedAppId);
  const appPriority = new Map(
    appCandidates.map((value, index) => [value, index] as const),
  );

  const results = await Promise.allSettled(
    appCandidates.map((appId) =>
      request<UserMediaAsset[]>(
        "nebula",
        `/api/v1/apps/${encodeURIComponent(appId)}/user/${encodeURIComponent(userUUID)}/media?${search.toString()}`,
        {
          appIdHeader: appId,
        },
      ),
    ),
  );

  const mergedAssets = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  if (mergedAssets.length > 0) {
    return dedupeMediaAssets(mergedAssets, appPriority);
  }

  const firstRejected = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (firstRejected) {
    throw firstRejected.reason;
  }

  return [];
}

export async function signSchoolMedia(
  schoolId: string,
  objectKeys: string[],
): Promise<Record<string, string>> {
  const uniqueObjectKeys = Array.from(
    new Set(
      objectKeys.map((value) => value.trim()).filter((value) => value !== ""),
    ),
  );

  if (uniqueObjectKeys.length === 0) {
    return {};
  }
  const signedUrls: Record<string, string> = {};

  for (let index = 0; index < uniqueObjectKeys.length; index += 50) {
    const chunk = uniqueObjectKeys.slice(index, index + 50);
    const response = await request<{
      items: SignedSchoolMediaItem[];
    }>(
      "kcaProxy",
      `/api/v1/admin/school/${encodeURIComponent(schoolId)}/media/sign`,
      {
        method: "POST",
        body: {
          object_keys: chunk,
        },
      },
    );

    Object.assign(
      signedUrls,
      Object.fromEntries(
        (response.items ?? []).map((item) => [item.object_key, item.get_url]),
      ),
    );
  }

  return signedUrls;
}

export async function approveReservation(
  adminUser: string,
  reservationUUID: string,
): Promise<PackSpotReservation> {
  return request<PackSpotReservation>(
    "hubStore",
    `/api/v1/admin/${encodeURIComponent(adminUser)}/pack/term-reservation/${encodeURIComponent(reservationUUID)}/approve`,
    {
      method: "POST",
      authRequired: false,
      retryOnUnauthorized: false,
    },
  );
}

export async function denyReservation(
  adminUser: string,
  reservationUUID: string,
): Promise<PackSpotReservation> {
  return request<PackSpotReservation>(
    "hubStore",
    `/api/v1/admin/${encodeURIComponent(adminUser)}/pack/term-reservation/${encodeURIComponent(reservationUUID)}/deny`,
    {
      method: "POST",
      authRequired: false,
      retryOnUnauthorized: false,
    },
  );
}

export async function fetchStudentProfile(
  managedAppId: string,
  userUUID: string,
): Promise<StudentProfileBundle> {
  const primaryAppId = managedAppId.trim();
  const encodedAppId = encodeURIComponent(primaryAppId);
  const encodedUserUUID = encodeURIComponent(userUUID);
  const appCandidates = buildManagedAppCandidates(primaryAppId);
  const appPriority = new Map(
    appCandidates.map((value, index) => [value, index] as const),
  );

  const [user, memberships, deviceResults] = await Promise.all([
    request<NebulaUser>(
      "nebula",
      `/api/v1/apps/${encodedAppId}/user/${encodedUserUUID}`,
      {
        appIdHeader: primaryAppId,
      },
    ),
    request<UserSchoolMembership[]>(
      "nebula",
      `/api/v1/apps/${encodedAppId}/user/${encodedUserUUID}/school-memberships`,
      {
        appIdHeader: primaryAppId,
      },
    ),
    Promise.allSettled(
      appCandidates.map((appId) =>
        request<RegisteredDevice[]>(
          "nebula",
          `/api/v1/apps/${encodeURIComponent(appId)}/user/${encodedUserUUID}/registered-devices`,
          {
            appIdHeader: appId,
          },
        ),
      ),
    ),
  ]);

  const mergedDevices = deviceResults.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  return {
    user,
    memberships,
    devices: dedupeRegisteredDevices(mergedDevices, appPriority),
  };
}

export async function fetchStudentPublicProfile(
  managedAppId: string,
  schoolId: string,
  targetUserUUID: string,
): Promise<StudentPublicProfile> {
  const search = new URLSearchParams({
    school_id: schoolId,
    posts_limit: "1",
  });
  try {
    const profile = await request<StudentPublicProfile>(
      "kcaProxy",
      `/api/v1/user/social/profiles/${encodeURIComponent(targetUserUUID)}?${search.toString()}`,
      {
        appIdHeader: managedAppId,
      },
    );
    if (profile.user.profile_image_url?.trim()) {
      return profile;
    }

    const signedAvatarUrl = await resolveSignedUserProfileImageUrl(
      managedAppId,
      schoolId,
      targetUserUUID,
    ).catch(() => null);
    if (!signedAvatarUrl) {
      return profile;
    }

    return {
      ...profile,
      user: {
        ...profile.user,
        profile_image_url: signedAvatarUrl,
      },
    };
  } catch {
    const [summary, mediaAssets] = await Promise.all([
      request<RouteHistorySummary>(
        "nebula",
        `/api/v1/apps/${encodeURIComponent(managedAppId)}/user/${encodeURIComponent(targetUserUUID)}/route-history/summary?${new URLSearchParams({
          school_id: schoolId,
        }).toString()}`,
        {
          appIdHeader: managedAppId,
        },
      ),
      fetchUserMediaAssets(managedAppId, targetUserUUID, "user_profile", targetUserUUID).catch(
        () => [] as UserMediaAsset[],
      ),
    ]);

    const avatarAsset = pickAvatarAsset(mediaAssets);
    const signedAvatarUrls: Record<string, string> = avatarAsset?.object_key
      ? await signSchoolMedia(schoolId, [avatarAsset.object_key]).catch(
          () => ({} as Record<string, string>),
        )
      : {};
    const signedAvatarUrl = avatarAsset?.object_key
      ? signedAvatarUrls[avatarAsset.object_key] ?? null
      : null;

    return {
      user: {
        user_uuid: targetUserUUID,
        first_name: "",
        last_name: "",
        email: "",
        username: "",
        school_id: schoolId,
        campus_id: "",
        student_id: "",
        profile_image_url: signedAvatarUrl,
        is_friend: false,
        is_pending: false,
      },
      total_point_count: summary.total_point_count ?? 0,
      active_challenges: [],
      posts: [],
    };
  }
}

export async function fetchStudentRouteHistory(
  managedAppId: string,
  schoolId: string,
  targetUserUUID: string,
): Promise<StudentRouteHistorySession[]> {
  const search = new URLSearchParams({
    school_id: schoolId,
  });

  return request<StudentRouteHistorySession[]>(
    "nebula",
    `/api/v1/apps/${encodeURIComponent(managedAppId)}/user/${encodeURIComponent(targetUserUUID)}/route-history?${search.toString()}`,
    {
      appIdHeader: managedAppId,
    },
  );
}

export interface StudentParkingViolation {
  violation_uuid: string;
  app_id: string;
  school_id: string;
  user_uuid: string;
  membership_uuid?: string | null;
  registered_device_uuid?: string | null;
  reported_by_user_uuid: string;
  description: string;
  status: string;
  active: boolean;
  created_at: number;
  updated_at: number;
}

export async function fetchStudentParkingViolations(
  managedAppId: string,
  schoolId: string,
  targetUserUUID: string,
): Promise<StudentParkingViolation[]> {
  const search = new URLSearchParams({
    managed_app_id: managedAppId,
    user_uuid: targetUserUUID,
  });

  return request<StudentParkingViolation[]>(
    'kcaProxy',
    `/api/v1/admin/school/${encodeURIComponent(schoolId)}/violations?${search.toString()}`,
    {
      appIdHeader: currentSession?.authAppId ?? managedAppId,
    },
  );
}
