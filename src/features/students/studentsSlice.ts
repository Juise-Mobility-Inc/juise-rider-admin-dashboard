import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  fetchAdminSchoolPacks,
  fetchSchoolStudentRoster,
  fetchSchoolTermReservations,
  fetchSchoolZones,
  fetchStudentParkingViolations,
  fetchStudentProfile,
  fetchStudentPublicProfile,
  fetchStudentRouteHistory,
  fetchUserMediaAssets,
  signSchoolMedia,
  type Pack,
  type PackSpotReservation,
  type RegisteredDevice,
  type SchoolStudentRosterEntry,
  type SchoolZone,
  type StudentParkingViolation,
  type StudentProfileBundle,
  type StudentPublicProfile,
  type StudentRouteHistorySession,
  type UserMediaAsset,
  type UserSchoolMembership,
} from "../../lib/api";
import type { AppDispatch, RootState } from "../../store";

type StudentIdPhotoSlot = "front" | "back";
type StudentIdPhotoKeys = Partial<Record<StudentIdPhotoSlot, string>>;
export type StudentRosterPhotoKeyMap = Record<string, StudentIdPhotoKeys>;
export type StudentDevicePhotoMap = Record<string, string>;
export type StudentDeviceMediaAssetMap = Record<string, UserMediaAsset[]>;
export type StudentViolationMediaAssetMap = Record<string, UserMediaAsset[]>;
export type SignedMediaUrlMap = Record<string, string>;

type StudentsScope = {
  scopeKey: string;
  managedAppId: string;
  schoolId: string;
  adminUserUUID: string;
};

type StudentsState = StudentsScope & {
  schoolStudentRoster: SchoolStudentRosterEntry[];
  schoolStudentReservations: PackSpotReservation[];
  schoolStudentMediaUrls: Record<string, string>;
  schoolStudentProfilePhotoUrls: Record<string, string>;
  schoolStudentPhotoKeys: StudentRosterPhotoKeyMap;
  schoolStudentRosterBusy: boolean;
  schoolStudentRosterError: string;
  schoolStudentRosterReady: boolean;
  schoolStudentRosterHydrating: boolean;
  selectedStudentMembershipId: string | null;
  studentProfile: StudentProfileBundle | null;
  studentPublicProfile: StudentPublicProfile | null;
  studentDevicePhotoUrls: StudentDevicePhotoMap;
  studentDeviceMediaByDevice: StudentDeviceMediaAssetMap;
  studentDeviceSignedMediaUrls: SignedMediaUrlMap;
  studentViolations: StudentParkingViolation[];
  studentRouteHistory: StudentRouteHistorySession[];
  studentSchoolZones: SchoolZone[];
  studentReservationPacks: Pack[];
  studentViolationMediaByViolation: StudentViolationMediaAssetMap;
  studentViolationSignedMediaUrls: SignedMediaUrlMap;
  studentBusy: boolean;
  studentError: string;
  studentPublicProfileError: string;
  studentRouteHistoryError: string;
  studentViolationError: string;
  studentSharedDataBusy: boolean;
  studentSharedDataReady: boolean;
};

type LoadStudentRosterArgs = StudentsScope & {
  force?: boolean;
};

type LoadStudentDetailArgs = StudentsScope & {
  membershipId: string;
  force?: boolean;
};

const initialStudentsScope: StudentsScope = {
  scopeKey: "",
  managedAppId: "",
  schoolId: "",
  adminUserUUID: "",
};

const initialState: StudentsState = {
  ...initialStudentsScope,
  schoolStudentRoster: [],
  schoolStudentReservations: [],
  schoolStudentMediaUrls: {},
  schoolStudentProfilePhotoUrls: {},
  schoolStudentPhotoKeys: {},
  schoolStudentRosterBusy: false,
  schoolStudentRosterError: "",
  schoolStudentRosterReady: false,
  schoolStudentRosterHydrating: false,
  selectedStudentMembershipId: null,
  studentProfile: null,
  studentPublicProfile: null,
  studentDevicePhotoUrls: {},
  studentDeviceMediaByDevice: {},
  studentDeviceSignedMediaUrls: {},
  studentViolations: [],
  studentRouteHistory: [],
  studentSchoolZones: [],
  studentReservationPacks: [],
  studentViolationMediaByViolation: {},
  studentViolationSignedMediaUrls: {},
  studentBusy: false,
  studentError: "",
  studentPublicProfileError: "",
  studentRouteHistoryError: "",
  studentViolationError: "",
  studentSharedDataBusy: false,
  studentSharedDataReady: false,
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred.";
}

function buildStudentIdEntityUUID(schoolId: string, campusId: string): string {
  return `${schoolId.trim()}.${campusId.trim()}`;
}

function resolveMediaObjectKey(asset?: Pick<UserMediaAsset, "object_key">): string {
  return asset?.object_key?.trim() ?? "";
}

function resolveStudentPhotoObjectKey(
  membership: UserSchoolMembership,
  photoKeysByMembership: StudentRosterPhotoKeyMap,
  slot: StudentIdPhotoSlot,
): string {
  if (slot === "front") {
    return (
      resolveMediaObjectKey(membership.front_photo) ||
      resolveMediaObjectKey(membership.photo) ||
      photoKeysByMembership[membership.membership_uuid]?.front?.trim() ||
      ""
    );
  }

  return (
    resolveMediaObjectKey(membership.back_photo) ||
    photoKeysByMembership[membership.membership_uuid]?.back?.trim() ||
    ""
  );
}

function collectStudentIdPhotoKeys(assets: UserMediaAsset[]): StudentIdPhotoKeys {
  const photoKeys: StudentIdPhotoKeys = {};

  for (const asset of assets) {
    const slot = asset.slot?.trim();
    if ((slot === "front" || slot === "back") && !photoKeys[slot]) {
      const objectKey = asset.object_key?.trim() ?? "";
      if (objectKey) {
        photoKeys[slot] = objectKey;
      }
    }
  }

  return photoKeys;
}

function resolveRegisteredDevicePhotoObjectKey(assets: UserMediaAsset[]): string {
  const slotPriority: Record<string, number> = {
    photo: 0,
    overview: 1,
    logo: 2,
  };

  return (
    [...assets]
      .filter((asset) => asset.object_key?.trim())
      .sort((left, right) => {
        const leftRank = slotPriority[left.slot?.trim() ?? ""] ?? 99;
        const rightRank = slotPriority[right.slot?.trim() ?? ""] ?? 99;
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }
        if (left.updated_at !== right.updated_at) {
          return right.updated_at - left.updated_at;
        }
        return right.created_at - left.created_at;
      })[0]?.object_key?.trim() ?? ""
  );
}

function sortPacksForDisplay(packs: Pack[]): Pack[] {
  return [...packs].sort((left, right) => {
    const leftName = left.name.trim().toLowerCase();
    const rightName = right.name.trim().toLowerCase();
    if (leftName !== rightName) {
      return leftName.localeCompare(rightName);
    }

    return left.pack_uuid.localeCompare(right.pack_uuid);
  });
}

async function resolveStudentDeviceMediaState(
  managedAppId: string,
  schoolId: string,
  userUUID: string,
  devices: RegisteredDevice[],
): Promise<{
  photoUrls: StudentDevicePhotoMap;
  mediaByDevice: StudentDeviceMediaAssetMap;
  signedUrls: SignedMediaUrlMap;
}> {
  if (!schoolId || !userUUID || devices.length === 0) {
    return {
      photoUrls: {},
      mediaByDevice: {},
      signedUrls: {},
    };
  }

  const mediaEntries = (
    await Promise.allSettled(
      devices.map(async (device) => {
        const assets = await fetchUserMediaAssets(
          managedAppId,
          device.user_uuid || userUUID,
          "registered_device",
          device.registered_device_uuid,
        );

        return {
          registeredDeviceUUID: device.registered_device_uuid,
          assets,
        };
      }),
    )
  ).flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );

  const mediaByDevice = Object.fromEntries(
    mediaEntries.map((entry) => [entry.registeredDeviceUUID, entry.assets]),
  );

  const signedUrls = await signSchoolMedia(
    schoolId,
    mediaEntries.flatMap((entry) =>
      entry.assets
        .map((asset) => asset.object_key?.trim() ?? "")
        .filter((value) => value !== ""),
    ),
  ).catch(() => ({} as SignedMediaUrlMap));

  const photoUrls = Object.fromEntries(
    mediaEntries.flatMap((entry) => {
      const objectKey = resolveRegisteredDevicePhotoObjectKey(entry.assets);
      const signedUrl = signedUrls[objectKey] ?? "";

      return signedUrl ? [[entry.registeredDeviceUUID, signedUrl]] : [];
    }),
  );

  return {
    photoUrls,
    mediaByDevice,
    signedUrls,
  };
}

async function resolveSchoolStudentAvatarMediaUrls(
  managedAppId: string,
  schoolId: string,
  roster: SchoolStudentRosterEntry[],
): Promise<Record<string, string>> {
  const uniqueUserUUIDs = Array.from(
    new Set(
      roster
        .flatMap((entry) => [
          entry.user.k_guid?.trim() ?? "",
          entry.membership.user_uuid?.trim() ?? "",
        ])
        .filter(Boolean),
    ),
  );

  if (uniqueUserUUIDs.length === 0) {
    return {};
  }

  const avatarEntries = (
    await Promise.all(
      uniqueUserUUIDs.map(async (userUUID) => {
        const assets = await fetchUserMediaAssets(
          managedAppId,
          userUUID,
          "user_profile",
          userUUID,
        ).catch(() => [] as UserMediaAsset[]);

        const avatarAsset =
          [...assets]
            .filter((asset) => asset.slot === "avatar" && asset.object_key.trim())
            .sort((left, right) => right.updated_at - left.updated_at)[0] ?? null;
        if (!avatarAsset?.object_key) {
          return null;
        }

        return {
          userUUID,
          objectKey: avatarAsset.object_key,
        };
      }),
    )
  ).filter(
    (
      value,
    ): value is {
      userUUID: string;
      objectKey: string;
    } => value !== null,
  );

  const signedAvatarUrls =
    avatarEntries.length > 0
      ? await signSchoolMedia(
          schoolId,
          avatarEntries.map((entry) => entry.objectKey),
        ).catch(() => ({} as Record<string, string>))
      : {};

  const resolvedUrls = Object.fromEntries(
    avatarEntries.flatMap((entry) => {
      const signedUrl = signedAvatarUrls[entry.objectKey] ?? "";
      return signedUrl ? [[entry.userUUID, signedUrl]] : [];
    }),
  );

  return fanOutStudentProfilePhotoUrls(roster, resolvedUrls);
}

function fanOutStudentProfilePhotoUrls(
  roster: SchoolStudentRosterEntry[],
  urls: Record<string, string>,
): Record<string, string> {
  const resolvedUrls = { ...urls };
  for (const entry of roster) {
    const rosterUserUUID = entry.user.k_guid?.trim() ?? "";
    const membershipUserUUID = entry.membership.user_uuid?.trim() ?? "";
    const sharedUrl =
      (rosterUserUUID ? resolvedUrls[rosterUserUUID] : "") ||
      (membershipUserUUID ? resolvedUrls[membershipUserUUID] : "");
    if (!sharedUrl) {
      continue;
    }
    if (rosterUserUUID) {
      resolvedUrls[rosterUserUUID] = sharedUrl;
    }
    if (membershipUserUUID) {
      resolvedUrls[membershipUserUUID] = sharedUrl;
    }
  }
  return resolvedUrls;
}

async function resolveSchoolStudentPublicProfilePhotoUrls(
  managedAppId: string,
  schoolId: string,
  roster: SchoolStudentRosterEntry[],
  initialUrls: Record<string, string> = {},
): Promise<Record<string, string>> {
  const uniqueUserUUIDs = Array.from(
    new Set(
      roster
        .flatMap((entry) => [
          entry.user.k_guid?.trim() ?? "",
          entry.membership.user_uuid?.trim() ?? "",
        ])
        .filter(Boolean),
    ),
  );

  const resolvedUrls = fanOutStudentProfilePhotoUrls(roster, initialUrls);
  const missingUserUUIDs = uniqueUserUUIDs.filter(
    (userUUID) => !resolvedUrls[userUUID],
  );
  if (missingUserUUIDs.length === 0) {
    return resolvedUrls;
  }

  const publicProfileResults = await Promise.allSettled(
    missingUserUUIDs.map(async (userUUID) => {
      const profile = await fetchStudentPublicProfile(
        managedAppId,
        schoolId,
        userUUID,
      );
      const profileImageUrl = profile.user.profile_image_url?.trim() ?? "";
      if (!profileImageUrl) {
        return null;
      }

      return {
        userUUID,
        profileImageUrl,
      };
    }),
  );

  for (const result of publicProfileResults) {
    if (result.status !== "fulfilled" || !result.value) {
      continue;
    }

    resolvedUrls[result.value.userUUID] = result.value.profileImageUrl;
  }

  return fanOutStudentProfilePhotoUrls(roster, resolvedUrls);
}

async function resolveSchoolStudentPhotoState(
  managedAppId: string,
  schoolId: string,
  roster: SchoolStudentRosterEntry[],
): Promise<{
  photoKeysByMembership: StudentRosterPhotoKeyMap;
  signedUrls: Record<string, string>;
}> {
  const photoKeysByMembership: StudentRosterPhotoKeyMap = {};
  const fallbackMediaEntries = roster.filter((entry) => {
    const membership = entry.membership;
    return (
      (!resolveMediaObjectKey(membership.front_photo) &&
        !resolveMediaObjectKey(membership.photo)) ||
      !resolveMediaObjectKey(membership.back_photo)
    );
  });

  const fallbackMediaResults = await Promise.allSettled(
    fallbackMediaEntries.map(async (entry) => {
      const membership = entry.membership;
      const assets = await fetchUserMediaAssets(
        managedAppId,
        entry.user.k_guid || membership.user_uuid,
        "student_id",
        buildStudentIdEntityUUID(membership.school_id, membership.campus_id),
      );

      return {
        membershipUUID: membership.membership_uuid,
        photoKeys: collectStudentIdPhotoKeys(assets),
      };
    }),
  );

  for (const result of fallbackMediaResults) {
    if (result.status !== "fulfilled") {
      continue;
    }

    const { membershipUUID, photoKeys } = result.value;
    if (photoKeys.front || photoKeys.back) {
      photoKeysByMembership[membershipUUID] = photoKeys;
    }
  }

  const objectKeys = roster.flatMap((entry) => {
    const membership = entry.membership;

    return [
      resolveStudentPhotoObjectKey(membership, photoKeysByMembership, "front"),
      resolveStudentPhotoObjectKey(membership, photoKeysByMembership, "back"),
    ].filter((value): value is string => value !== "");
  });

  const signedUrls =
    objectKeys.length > 0 ? await signSchoolMedia(schoolId, objectKeys) : {};

  return {
    photoKeysByMembership,
    signedUrls,
  };
}

async function resolveStudentViolationMediaState(
  managedAppId: string,
  schoolId: string,
  userUUID: string,
  violations: StudentParkingViolation[],
): Promise<{
  mediaByViolation: StudentViolationMediaAssetMap;
  signedUrls: SignedMediaUrlMap;
}> {
  if (!schoolId || !userUUID || violations.length === 0) {
    return {
      mediaByViolation: {},
      signedUrls: {},
    };
  }

  const mediaEntries = (
    await Promise.allSettled(
      violations.map(async (violation) => {
        const assets = await fetchUserMediaAssets(
          managedAppId,
          violation.user_uuid || userUUID,
          "parking_violation",
          violation.violation_uuid,
        );

        return {
          violationUUID: violation.violation_uuid,
          assets,
        };
      }),
    )
  ).flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );

  const mediaByViolation = Object.fromEntries(
    mediaEntries.map((entry) => [entry.violationUUID, entry.assets]),
  );

  const signedUrls = await signSchoolMedia(
    schoolId,
    mediaEntries.flatMap((entry) =>
      entry.assets
        .map((asset) => asset.object_key?.trim() ?? "")
        .filter((value) => value !== ""),
    ),
  ).catch(() => ({} as SignedMediaUrlMap));

  return {
    mediaByViolation,
    signedUrls,
  };
}

function isCurrentScope(state: RootState, scopeKey: string): boolean {
  return state.students.scopeKey === scopeKey;
}

function isCurrentSelectedStudent(
  state: RootState,
  scopeKey: string,
  membershipId: string,
): boolean {
  return (
    state.students.scopeKey === scopeKey &&
    state.students.selectedStudentMembershipId === membershipId
  );
}

const studentsSlice = createSlice({
  name: "students",
  initialState,
  reducers: {
    resetStudentsState: () => initialState,
    setStudentsScope(state, action: PayloadAction<StudentsScope>) {
      if (
        state.scopeKey === action.payload.scopeKey &&
        state.managedAppId === action.payload.managedAppId &&
        state.schoolId === action.payload.schoolId &&
        state.adminUserUUID === action.payload.adminUserUUID
      ) {
        return;
      }

      return {
        ...initialState,
        ...action.payload,
      };
    },
    rosterRequested(state) {
      state.schoolStudentRosterBusy = true;
      state.schoolStudentRosterError = "";
    },
    rosterReceived(
      state,
      action: PayloadAction<{
        roster: SchoolStudentRosterEntry[];
        reservations: PackSpotReservation[];
      }>,
    ) {
      state.schoolStudentRoster = action.payload.roster;
      state.schoolStudentReservations = action.payload.reservations;
      state.schoolStudentRosterBusy = false;
      state.schoolStudentRosterError = "";
      state.schoolStudentRosterReady = true;
      state.schoolStudentRosterHydrating = true;
      state.schoolStudentMediaUrls = {};
      state.schoolStudentProfilePhotoUrls = {};
      state.schoolStudentPhotoKeys = {};
    },
    rosterFailed(state, action: PayloadAction<string>) {
      state.schoolStudentRoster = [];
      state.schoolStudentReservations = [];
      state.schoolStudentMediaUrls = {};
      state.schoolStudentProfilePhotoUrls = {};
      state.schoolStudentPhotoKeys = {};
      state.schoolStudentRosterBusy = false;
      state.schoolStudentRosterError = action.payload;
      state.schoolStudentRosterReady = false;
      state.schoolStudentRosterHydrating = false;
    },
    rosterHydrationFinished(state) {
      state.schoolStudentRosterHydrating = false;
    },
    rosterPhotoStateResolved(
      state,
      action: PayloadAction<{
        photoKeysByMembership: StudentRosterPhotoKeyMap;
        signedUrls: Record<string, string>;
      }>,
    ) {
      state.schoolStudentPhotoKeys = action.payload.photoKeysByMembership;
      state.schoolStudentMediaUrls = action.payload.signedUrls;
    },
    rosterProfilePhotosResolved(
      state,
      action: PayloadAction<Record<string, string>>,
    ) {
      state.schoolStudentProfilePhotoUrls = {
        ...state.schoolStudentProfilePhotoUrls,
        ...action.payload,
      };
    },
    setSelectedStudentMembershipId(state, action: PayloadAction<string | null>) {
      state.selectedStudentMembershipId = action.payload;
    },
    resetSelectedStudentState(state) {
      state.selectedStudentMembershipId = null;
      state.studentProfile = null;
      state.studentPublicProfile = null;
      state.studentDevicePhotoUrls = {};
      state.studentDeviceMediaByDevice = {};
      state.studentDeviceSignedMediaUrls = {};
      state.studentViolations = [];
      state.studentRouteHistory = [];
      state.studentViolationMediaByViolation = {};
      state.studentViolationSignedMediaUrls = {};
      state.studentBusy = false;
      state.studentError = "";
      state.studentPublicProfileError = "";
      state.studentRouteHistoryError = "";
      state.studentViolationError = "";
    },
    studentDetailRequested(state, action: PayloadAction<string>) {
      state.selectedStudentMembershipId = action.payload;
      state.studentProfile = null;
      state.studentPublicProfile = null;
      state.studentDevicePhotoUrls = {};
      state.studentDeviceMediaByDevice = {};
      state.studentDeviceSignedMediaUrls = {};
      state.studentViolations = [];
      state.studentRouteHistory = [];
      state.studentViolationMediaByViolation = {};
      state.studentViolationSignedMediaUrls = {};
      state.studentBusy = true;
      state.studentError = "";
      state.studentPublicProfileError = "";
      state.studentRouteHistoryError = "";
      state.studentViolationError = "";
    },
    studentDetailResolved(
      state,
      action: PayloadAction<{
        profile: StudentProfileBundle | null;
        publicProfile: StudentPublicProfile | null;
        violations: StudentParkingViolation[];
        routeHistory: StudentRouteHistorySession[];
        studentError: string;
        studentPublicProfileError: string;
        studentRouteHistoryError: string;
        studentViolationError: string;
      }>,
    ) {
      state.studentProfile = action.payload.profile;
      state.studentPublicProfile = action.payload.publicProfile;
      state.studentViolations = action.payload.violations;
      state.studentRouteHistory = action.payload.routeHistory;
      state.studentError = action.payload.studentError;
      state.studentPublicProfileError = action.payload.studentPublicProfileError;
      state.studentRouteHistoryError = action.payload.studentRouteHistoryError;
      state.studentViolationError = action.payload.studentViolationError;
      state.studentBusy = false;
    },
    studentDeviceMediaResolved(
      state,
      action: PayloadAction<{
        photoUrls: StudentDevicePhotoMap;
        mediaByDevice: StudentDeviceMediaAssetMap;
        signedUrls: SignedMediaUrlMap;
      }>,
    ) {
      state.studentDevicePhotoUrls = action.payload.photoUrls;
      state.studentDeviceMediaByDevice = action.payload.mediaByDevice;
      state.studentDeviceSignedMediaUrls = action.payload.signedUrls;
    },
    studentViolationMediaResolved(
      state,
      action: PayloadAction<{
        mediaByViolation: StudentViolationMediaAssetMap;
        signedUrls: SignedMediaUrlMap;
      }>,
    ) {
      state.studentViolationMediaByViolation = action.payload.mediaByViolation;
      state.studentViolationSignedMediaUrls = action.payload.signedUrls;
    },
    studentSharedDataRequested(state) {
      state.studentSharedDataBusy = true;
    },
    studentSharedDataResolved(
      state,
      action: PayloadAction<{
        schoolZones: SchoolZone[];
        reservationPacks: Pack[];
      }>,
    ) {
      state.studentSchoolZones = action.payload.schoolZones;
      state.studentReservationPacks = action.payload.reservationPacks;
      state.studentSharedDataBusy = false;
      state.studentSharedDataReady = true;
    },
    studentSharedDataFailed(state) {
      state.studentSchoolZones = [];
      state.studentReservationPacks = [];
      state.studentSharedDataBusy = false;
      state.studentSharedDataReady = false;
    },
  },
});

export const {
  resetStudentsState,
  resetSelectedStudentState,
  rosterFailed,
  rosterPhotoStateResolved,
  rosterProfilePhotosResolved,
  rosterReceived,
  rosterRequested,
  rosterHydrationFinished,
  setSelectedStudentMembershipId,
  setStudentsScope,
  studentDetailRequested,
  studentDetailResolved,
  studentDeviceMediaResolved,
  studentSharedDataFailed,
  studentSharedDataRequested,
  studentSharedDataResolved,
  studentViolationMediaResolved,
} = studentsSlice.actions;

export function loadStudentSharedData(args: LoadStudentRosterArgs) {
  return async (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState().students;
    if (
      !args.scopeKey ||
      !args.schoolId ||
      !args.managedAppId ||
      !args.adminUserUUID
    ) {
      return;
    }
    if (
      !args.force &&
      (state.studentSharedDataBusy || state.studentSharedDataReady)
    ) {
      return;
    }

    dispatch(studentSharedDataRequested());

    try {
      const [schoolZones, reservationPacks] = await Promise.all([
        fetchSchoolZones(args.managedAppId, args.schoolId),
        fetchAdminSchoolPacks(
          args.adminUserUUID,
          args.managedAppId,
          args.schoolId,
        ),
      ]);

      if (!isCurrentScope(getState(), args.scopeKey)) {
        return;
      }

      dispatch(
        studentSharedDataResolved({
          schoolZones,
          reservationPacks: sortPacksForDisplay(reservationPacks),
        }),
      );
    } catch {
      if (!isCurrentScope(getState(), args.scopeKey)) {
        return;
      }

      dispatch(studentSharedDataFailed());
    }
  };
}

async function hydrateStudentRosterMedia(
  dispatch: AppDispatch,
  getState: () => RootState,
  args: LoadStudentRosterArgs,
  roster: SchoolStudentRosterEntry[],
) {
  try {
    const profilePhotoUrls = await resolveSchoolStudentAvatarMediaUrls(
      args.managedAppId,
      args.schoolId,
      roster,
    ).catch(() => ({} as Record<string, string>));

    if (!isCurrentScope(getState(), args.scopeKey)) {
      return;
    }

    if (Object.keys(profilePhotoUrls).length > 0) {
      dispatch(rosterProfilePhotosResolved(profilePhotoUrls));
    }

    const [photoState, nextProfilePhotoUrls] = await Promise.all([
      resolveSchoolStudentPhotoState(
        args.managedAppId,
        args.schoolId,
        roster,
      ),
      resolveSchoolStudentPublicProfilePhotoUrls(
        args.managedAppId,
        args.schoolId,
        roster,
        profilePhotoUrls,
      ).catch(() => profilePhotoUrls),
    ]);

    if (!isCurrentScope(getState(), args.scopeKey)) {
      return;
    }

    dispatch(rosterPhotoStateResolved(photoState));
    dispatch(rosterProfilePhotosResolved(nextProfilePhotoUrls));
  } catch {
    if (!isCurrentScope(getState(), args.scopeKey)) {
      return;
    }

    dispatch(
      rosterPhotoStateResolved({
        photoKeysByMembership: {},
        signedUrls: {},
      }),
    );
  } finally {
    if (isCurrentScope(getState(), args.scopeKey)) {
      dispatch(rosterHydrationFinished());
    }
  }
}

export function loadStudentRoster(args: LoadStudentRosterArgs) {
  return async (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState().students;
    if (
      !args.scopeKey ||
      !args.schoolId ||
      !args.managedAppId ||
      !args.adminUserUUID
    ) {
      return;
    }
    if (!args.force && (state.schoolStudentRosterBusy || state.schoolStudentRosterReady)) {
      return;
    }

    dispatch(rosterRequested());

    try {
      const [roster, reservations] = await Promise.all([
        fetchSchoolStudentRoster(args.managedAppId, args.schoolId),
        fetchSchoolTermReservations(
          args.adminUserUUID,
          args.managedAppId,
          args.schoolId,
        ),
      ]);

      if (!isCurrentScope(getState(), args.scopeKey)) {
        return;
      }

      dispatch(
        rosterReceived({
          roster,
          reservations,
        }),
      );

      void hydrateStudentRosterMedia(dispatch, getState, args, roster);
      void dispatch(loadStudentSharedData(args));
    } catch (error) {
      if (!isCurrentScope(getState(), args.scopeKey)) {
        return;
      }

      dispatch(rosterFailed(getErrorMessage(error)));
    }
  };
}

export function loadSelectedStudentDetail(args: LoadStudentDetailArgs) {
  return async (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState().students;
    if (
      !args.scopeKey ||
      !args.schoolId ||
      !args.managedAppId ||
      !args.membershipId
    ) {
      return;
    }
    if (
      !args.force &&
      state.selectedStudentMembershipId === args.membershipId &&
      (state.studentBusy || state.studentProfile || state.studentRouteHistory.length > 0)
    ) {
      return;
    }

    const entry = state.schoolStudentRoster.find(
      (candidate) => candidate.membership.membership_uuid === args.membershipId,
    );

    dispatch(studentDetailRequested(args.membershipId));

    if (!entry) {
      dispatch(
        studentDetailResolved({
          profile: null,
          publicProfile: null,
          violations: [],
          routeHistory: [],
          studentError: "Student not found in the current roster.",
          studentPublicProfileError: "",
          studentRouteHistoryError: "",
          studentViolationError: "",
        }),
      );
      return;
    }

    void dispatch(loadStudentSharedData(args));

    const studentUserUUID =
      entry.membership.user_uuid?.trim() || entry.user.k_guid;

    const [
      profileResult,
      publicProfileResult,
      routeHistoryResult,
      violationsResult,
    ] = await Promise.allSettled([
      fetchStudentProfile(args.managedAppId, studentUserUUID),
      fetchStudentPublicProfile(
        args.managedAppId,
        args.schoolId,
        studentUserUUID,
      ),
      fetchStudentRouteHistory(
        args.managedAppId,
        args.schoolId,
        studentUserUUID,
      ),
      fetchStudentParkingViolations(
        args.managedAppId,
        args.schoolId,
        studentUserUUID,
      ),
    ]);

    if (!isCurrentSelectedStudent(getState(), args.scopeKey, args.membershipId)) {
      return;
    }

    const profile =
      profileResult.status === "fulfilled" ? profileResult.value : null;
    const publicProfile =
      publicProfileResult.status === "fulfilled" ? publicProfileResult.value : null;
    const routeHistory =
      routeHistoryResult.status === "fulfilled" ? routeHistoryResult.value : [];
    const violations =
      violationsResult.status === "fulfilled" ? violationsResult.value : [];

    dispatch(
      studentDetailResolved({
        profile,
        publicProfile,
        violations,
        routeHistory,
        studentError:
          profileResult.status === "rejected"
            ? getErrorMessage(profileResult.reason)
            : "",
        studentPublicProfileError:
          publicProfileResult.status === "rejected"
            ? getErrorMessage(publicProfileResult.reason)
            : "",
        studentRouteHistoryError:
          routeHistoryResult.status === "rejected"
            ? getErrorMessage(routeHistoryResult.reason)
            : "",
        studentViolationError:
          violationsResult.status === "rejected"
            ? getErrorMessage(violationsResult.reason)
            : "",
      }),
    );

    if (profile) {
      void (async () => {
        const deviceMediaState = await resolveStudentDeviceMediaState(
          args.managedAppId,
          args.schoolId,
          studentUserUUID,
          profile.devices,
        ).catch(() => ({
          photoUrls: {},
          mediaByDevice: {},
          signedUrls: {},
        }));

        if (
          !isCurrentSelectedStudent(getState(), args.scopeKey, args.membershipId)
        ) {
          return;
        }

        dispatch(studentDeviceMediaResolved(deviceMediaState));
      })();
    }

    if (violations.length > 0) {
      void (async () => {
        const violationMediaState = await resolveStudentViolationMediaState(
          args.managedAppId,
          args.schoolId,
          studentUserUUID,
          violations,
        ).catch(() => ({
          mediaByViolation: {},
          signedUrls: {},
        }));

        if (
          !isCurrentSelectedStudent(getState(), args.scopeKey, args.membershipId)
        ) {
          return;
        }

        dispatch(studentViolationMediaResolved(violationMediaState));
      })();
    }
  };
}

export const selectStudentsState = (state: RootState) => state.students;

export default studentsSlice.reducer;
