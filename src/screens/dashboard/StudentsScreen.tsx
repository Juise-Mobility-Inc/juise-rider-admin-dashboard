import type { ComponentType, Dispatch, SetStateAction } from "react";
import { StudentEventMiniMap } from "../../components/StudentEventMiniMap";

import type {
	Pack,
	PackSpotReservation,
	SchoolZone,
	SchoolStudentRosterEntry,
	StudentParkingViolation,
	StudentProfileBundle,
	StudentPublicProfile,
	StudentRouteHistorySession,
	UserMediaAsset,
	UserSchoolMembership,
} from "../../lib/api";

type StudentIdPhotoSlot = "front" | "back";
type StudentIdPhotoKeys = Partial<Record<StudentIdPhotoSlot, string>>;
type StudentRosterPhotoKeyMap = Record<string, StudentIdPhotoKeys>;
type StudentViolationMediaAssetMap = Record<string, UserMediaAsset[]>;

type DetailRowComponent = ComponentType<{
	label: string;
	value: string;
}>;

type UuidCopyFieldProps = {
	label: string;
	value?: string;
	onCopy: (label: string, value: string) => void | Promise<void>;
};

type UuidCopyFieldComponent = ComponentType<UuidCopyFieldProps>;

type Props = {
	activeSchoolId: string;
	schoolStudentRosterBusy: boolean;
	schoolStudentRosterError: string;
	studentRosterSearch: string;
	setStudentRosterSearch: Dispatch<SetStateAction<string>>;
	filteredStudentRoster: SchoolStudentRosterEntry[];
	selectedStudentMembershipId: string | null;
	selectedStudentEntry: SchoolStudentRosterEntry | null;
	schoolStudentPhotoKeys: StudentRosterPhotoKeyMap;
	schoolStudentMediaUrls: Record<string, string>;
	schoolStudentProfilePhotoUrls: Record<string, string>;
	studentDevicePhotoUrls: Record<string, string>;
	schoolReservationsByMembership: Map<string, PackSpotReservation[]>;
	studentBusy: boolean;
	studentError: string;
	studentProfile: StudentProfileBundle | null;
	studentPublicProfile: StudentPublicProfile | null;
	studentPublicProfileError: string;
	studentViolations: StudentParkingViolation[];
	studentRouteHistory: StudentRouteHistorySession[];
	studentSchoolZones: SchoolZone[];
	studentReservationPacks: Pack[];
	studentRouteHistoryError: string;
	studentViolationMediaByViolation: StudentViolationMediaAssetMap;
	studentViolationSignedMediaUrls: Record<string, string>;
	studentViolationError: string;
	handleSelectStudentInRoster: (membershipUUID: string) => Promise<void>;
	refreshStudentRoster: () => Promise<void>;
	resetSelectedStudentState: () => void;
	handleOpenStudentDevice: (deviceUUID: string) => void;
	formatNebulaUserName: (profile: {
		first_name?: string;
		last_name?: string;
		username?: string;
		email?: string;
	}) => string;
	resolveStudentPhotoObjectKey: (
		membership: UserSchoolMembership,
		photoKeysByMembership: StudentRosterPhotoKeyMap,
		slot: StudentIdPhotoSlot,
	) => string;
	formatDateOnly: (value: string) => string;
	formatUnixTimestamp: (value?: number) => string;
	handleCopyUuid: (label: string, value: string) => void | Promise<void>;
	handleImagePreview: (
		imageUrl: string,
		alt: string,
		label?: string,
	) => void;
	DetailRow: DetailRowComponent;
	UuidCopyField: UuidCopyFieldComponent;
};

function formatViolationSlotLabel(slot: string, index: number) {
	const normalized = slot.trim();
	if (!normalized) {
		return `Photo ${index + 1}`;
	}

	return normalized
		.replace(/_/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPenaltyZoneType(zoneType: string) {
	switch (zoneType.trim()) {
		case "no_go":
			return "No-go zone";
		case "speed_limit":
			return "Speed zone";
		default:
			return zoneType.trim() || "Penalty zone";
	}
}

function formatSpeedMph(value: number) {
	return `${value.toFixed(1)} mph`;
}

function resolvePenaltyZone(
	session: StudentRouteHistorySession,
	schoolZones: SchoolZone[],
	zoneUUID: string,
): SchoolZone | null {
	const normalizedZoneUUID = zoneUUID.trim();
	if (!normalizedZoneUUID) {
		return null;
	}

	return (
		session.school_zones?.find(
			(zone) => zone.zone_uuid.trim() === normalizedZoneUUID,
		) ??
		schoolZones.find(
			(zone) => zone.zone_uuid.trim() === normalizedZoneUUID,
		) ??
		null
	);
}

function estimatePenaltySpeedMph(
	session: StudentRouteHistorySession,
	event: StudentRouteHistorySession["penalty_events"][number],
): number | null {
	const candidates = (session.points ?? []).filter(
		(point) =>
			typeof point.speed_mps === "number" &&
			Number.isFinite(point.speed_mps) &&
			Number.isFinite(point.latitude) &&
			Number.isFinite(point.longitude),
	);

	if (candidates.length === 0) {
		return null;
	}

	const bestPoint = candidates.reduce((best, point) => {
		const bestTimeDiff = Math.abs(best.timestamp - event.occurred_at);
		const pointTimeDiff = Math.abs(point.timestamp - event.occurred_at);
		if (pointTimeDiff !== bestTimeDiff) {
			return pointTimeDiff < bestTimeDiff ? point : best;
		}

		const bestCoordDiff =
			Math.abs(best.latitude - event.lat) + Math.abs(best.longitude - event.lng);
		const pointCoordDiff =
			Math.abs(point.latitude - event.lat) +
			Math.abs(point.longitude - event.lng);
		return pointCoordDiff < bestCoordDiff ? point : best;
	});

	return typeof bestPoint.speed_mps === "number"
		? bestPoint.speed_mps * 2.2369362920544
		: null;
}

export function StudentsScreen(props: Props) {
	const {
		activeSchoolId,
		schoolStudentRosterBusy,
		schoolStudentRosterError,
		studentRosterSearch,
		setStudentRosterSearch,
		filteredStudentRoster,
		selectedStudentMembershipId,
		selectedStudentEntry,
		schoolStudentPhotoKeys,
		schoolStudentMediaUrls,
		schoolStudentProfilePhotoUrls,
		studentDevicePhotoUrls,
		schoolReservationsByMembership,
		studentBusy,
		studentError,
		studentProfile,
		studentPublicProfile,
		studentPublicProfileError,
		studentViolations,
		studentRouteHistory,
		studentSchoolZones,
		studentReservationPacks,
		studentRouteHistoryError,
		studentViolationMediaByViolation,
		studentViolationSignedMediaUrls,
		studentViolationError,
		handleSelectStudentInRoster,
		refreshStudentRoster,
		resetSelectedStudentState,
		handleOpenStudentDevice,
		formatNebulaUserName,
		resolveStudentPhotoObjectKey,
		formatDateOnly,
		formatUnixTimestamp,
		handleCopyUuid,
		handleImagePreview,
		DetailRow,
		UuidCopyField,
	} = props;

	return (
		<section className="panel students-section">
			<div className="panel-header">
				<div>
					<p className="eyebrow">School Roster</p>
					<h2>Registered students</h2>
				</div>
				<button
					className="secondary-button"
					type="button"
					onClick={() => {
						void refreshStudentRoster();
						resetSelectedStudentState();
					}}
					disabled={schoolStudentRosterBusy || !activeSchoolId}>
					Refresh
				</button>
			</div>

			{!activeSchoolId ? (
				<p className="empty-state">
					This admin login is not scoped to a school.
				</p>
			) : null}
			{schoolStudentRosterError ? (
				<p className="error-text">{schoolStudentRosterError}</p>
			) : null}

			{activeSchoolId ? (
				<div className="students-layout">
					<div className="students-sidebar">
						<div className="students-search-row">
							<input
								className="students-search-input"
								type="search"
								placeholder="Search by name, ID or email…"
								value={studentRosterSearch}
								onChange={(e) => setStudentRosterSearch(e.target.value)}
							/>
							<span className="students-count-badge">
								{filteredStudentRoster.length}
							</span>
						</div>

						{schoolStudentRosterBusy ? (
							<p className="muted-text students-loading">Loading roster…</p>
						) : filteredStudentRoster.length === 0 ? (
							<p className="empty-state">
								{studentRosterSearch
									? "No students match your search."
									: "No registered students found yet."}
							</p>
						) : (
							<div className="students-list">
								{filteredStudentRoster.map((entry) => {
									const membership = entry.membership;
									const isSelected =
										selectedStudentMembershipId === membership.membership_uuid;
									const rosterProfilePhotoUrl =
										schoolStudentProfilePhotoUrls[entry.user.k_guid] ?? "";
									const initials = formatNebulaUserName(entry.user)
										.split(" ")
										.filter(Boolean)
										.slice(0, 2)
										.map((w) => w[0])
										.join("")
										.toUpperCase();
									return (
										<button
											key={membership.membership_uuid}
											type="button"
											className={`student-list-item${
												isSelected ? " student-list-item-active" : ""
											}`}
											onClick={() =>
												void handleSelectStudentInRoster(
													membership.membership_uuid,
												)
											}>
											<div className="student-list-avatar">
												{rosterProfilePhotoUrl ? (
													<img
														className="student-list-avatar-image"
														src={rosterProfilePhotoUrl}
														alt={`${formatNebulaUserName(entry.user)} profile`}
														onClick={(event) => {
															event.stopPropagation();
															handleImagePreview(
																rosterProfilePhotoUrl,
																`${formatNebulaUserName(entry.user)} profile`,
																formatNebulaUserName(entry.user),
															);
														}}
													/>
												) : (
													initials || "?"
												)}
											</div>
											<div className="student-list-info">
												<strong>{formatNebulaUserName(entry.user)}</strong>
												<span>
													{membership.student_id || "No ID"} ·{" "}
													{membership.campus_id || "—"}
												</span>
											</div>
											<span
												className={`student-status-dot student-status-dot-${
													membership.status || "active"
												}`}
											/>
										</button>
									);
								})}
							</div>
						)}
					</div>

					<div className="students-detail">
						{!selectedStudentEntry ? (
							<div className="students-detail-empty">
								<div className="students-detail-empty-icon">👤</div>
								<strong>Select a student</strong>
								<span>
									Choose a student from the list to view their full profile, ID
									photos, devices, and activity.
								</span>
							</div>
						) : (
							(() => {
								const entry = selectedStudentEntry;
								const membership = entry.membership;
								const frontPhotoObjectKey = resolveStudentPhotoObjectKey(
									membership,
									schoolStudentPhotoKeys,
									"front",
								);
								const backPhotoObjectKey = resolveStudentPhotoObjectKey(
									membership,
									schoolStudentPhotoKeys,
									"back",
								);
								const frontPhotoUrl = frontPhotoObjectKey
									? (schoolStudentMediaUrls[frontPhotoObjectKey] ?? "")
									: "";
								const backPhotoUrl = backPhotoObjectKey
									? (schoolStudentMediaUrls[backPhotoObjectKey] ?? "")
									: "";
								const reservationsForMembership =
									schoolReservationsByMembership.get(
										membership.membership_uuid,
									) ?? [];
								const fullName = formatNebulaUserName(entry.user);
								const initials = fullName
									.split(" ")
									.filter(Boolean)
									.slice(0, 2)
									.map((w) => w[0])
									.join("")
									.toUpperCase();
								const selectedStudentUserUUID =
									membership.user_uuid || entry.user.k_guid;
								const matchedPublicProfile =
									studentPublicProfile &&
									(studentPublicProfile.user.user_uuid ===
										selectedStudentUserUUID ||
										studentPublicProfile.user.user_uuid === entry.user.k_guid)
										? studentPublicProfile
										: null;
								const matchedStudentProfile =
									studentProfile &&
									(studentProfile.user.k_guid === selectedStudentUserUUID ||
										studentProfile.user.k_guid === entry.user.k_guid)
										? studentProfile
										: null;
								const profileImageUrl =
									matchedPublicProfile?.user.profile_image_url?.trim() ||
									schoolStudentProfilePhotoUrls[selectedStudentUserUUID] ||
									schoolStudentProfilePhotoUrls[entry.user.k_guid] ||
									"";
								const studentReservationPackByUUID = new Map(
									studentReservationPacks.map((pack) => [pack.pack_uuid, pack]),
								);
								const visitedPoiVisits = studentRouteHistory
									.flatMap((session) =>
										session.visited_pois.map((poi) => ({
											poi,
											session,
										})),
									)
									.sort(
										(left, right) =>
											right.poi.visited_at - left.poi.visited_at,
									);
								const penaltyEvents = studentRouteHistory
									.flatMap((session) =>
										session.penalty_events.map((event) => ({
											event,
											session,
										})),
									)
									.sort(
										(left, right) =>
											right.event.occurred_at - left.event.occurred_at,
									);

								return (
									<>
										<div className="student-detail-header">
											<div className="student-detail-avatar">
												{profileImageUrl ? (
													<img
														className="student-detail-avatar-image"
														src={profileImageUrl}
														alt={`${fullName} profile`}
														onClick={() =>
															handleImagePreview(
																profileImageUrl,
																`${fullName} profile`,
																fullName,
															)
														}
													/>
												) : (
													initials || "?"
												)}
											</div>
											<div className="student-detail-header-info">
												<h3>{fullName}</h3>
												<div className="student-detail-header-meta">
													<span className="student-badge">
														{membership.status || "active"}
													</span>
													{membership.student_id ? (
														<span className="student-badge student-badge-muted">
															ID: {membership.student_id}
														</span>
													) : null}
													{membership.campus_id ? (
														<span className="student-badge student-badge-muted">
															{membership.campus_id}
														</span>
													) : null}
													{matchedPublicProfile ? (
														<span className="student-badge student-badge-highlight">
															{matchedPublicProfile.total_point_count.toLocaleString()}{" "}
															pts
														</span>
													) : null}
												</div>
											</div>
											{studentBusy ? (
												<span className="muted-text">Loading…</span>
											) : null}
										</div>

										{studentError ? (
											<p className="error-text">{studentError}</p>
										) : null}
										{studentPublicProfileError ? (
											<p className="muted-text">
												Public rider profile unavailable right now:{" "}
												{studentPublicProfileError}
											</p>
										) : null}

										<div className="data-section">
											<div className="data-section-header">
												<h4>Identity &amp; contact</h4>
											</div>
											<div className="detail-grid">
												<DetailRow
													label="Full name"
													value={fullName || "Not set"}
												/>
												<DetailRow
													label="Username"
													value={entry.user.username || "Not set"}
												/>
												<DetailRow
													label="Email"
													value={entry.user.email || "Not set"}
												/>
												<DetailRow
													label="Phone"
													value={entry.user.phone || "Not set"}
												/>
												<DetailRow
													label="Student ID"
													value={membership.student_id || "Not set"}
												/>
												<DetailRow
													label="Campus"
													value={membership.campus_id || "Not set"}
												/>
											</div>
											<div className="uuid-copy-stack">
												<UuidCopyField
													label="user_uuid"
													value={entry.user.k_guid}
													onCopy={handleCopyUuid}
												/>
												<UuidCopyField
													label="membership_uuid"
													value={membership.membership_uuid}
													onCopy={handleCopyUuid}
												/>
											</div>
										</div>

										<div className="data-section">
											<div className="data-section-header">
												<h4>Student ID photos</h4>
											</div>
											<div className="student-photos-grid">
												<div className="student-photo-card">
													<span>Front of ID</span>
													{frontPhotoUrl ? (
														<img
															className="student-photo-image"
															src={frontPhotoUrl}
															alt={`${fullName} front ID`}
															onClick={() =>
																handleImagePreview(
																	frontPhotoUrl,
																	`${fullName} front ID`,
																	`${fullName} front ID`,
																)
															}
														/>
													) : (
														<div className="student-photo-placeholder">
															Front ID not available
														</div>
													)}
												</div>
												<div className="student-photo-card">
													<span>Back of ID</span>
													{backPhotoUrl ? (
														<img
															className="student-photo-image"
															src={backPhotoUrl}
															alt={`${fullName} back ID`}
															onClick={() =>
																handleImagePreview(
																	backPhotoUrl,
																	`${fullName} back ID`,
																	`${fullName} back ID`,
																)
															}
														/>
													) : (
														<div className="student-photo-placeholder">
															Back ID not available
														</div>
													)}
												</div>
											</div>
										</div>

										<div className="data-section">
											<div className="data-section-header">
												<h4>Registered devices</h4>
												{matchedStudentProfile ? (
													<span>{matchedStudentProfile.devices.length}</span>
												) : null}
											</div>
											{studentBusy ? (
												<p className="muted-text">Loading devices…</p>
											) : matchedStudentProfile ? (
												matchedStudentProfile.devices.length === 0 ? (
													<p className="muted-text">
														No registered devices found.
													</p>
												) : (
													<div className="devices-grid">
														{matchedStudentProfile.devices.map((device) => {
															const devicePhotoUrl =
																studentDevicePhotoUrls[
																	device.registered_device_uuid
																] ?? "";

															return (
																<button
																	className="device-card device-card-button"
																	key={device.registered_device_uuid}
																	type="button"
																	onClick={() =>
																		handleOpenStudentDevice(
																			device.registered_device_uuid,
																		)
																	}>
																	{devicePhotoUrl ? (
																		<img
																			className="device-card-photo"
																			src={devicePhotoUrl}
																			alt={`${device.nickname || device.device_type} device`}
																			onClick={(event) => {
																			event.stopPropagation();
																			handleImagePreview(
																				devicePhotoUrl,
																				`${device.nickname || device.device_type} device`,
																				device.nickname ||
																					device.device_type,
																			);
																		}}
																		/>
																	) : (
																		<div className="device-card-icon">🛴</div>
																	)}
																	<div className="device-card-body">
																		<strong>
																			{device.nickname || device.device_type}
																		</strong>
																		<span>
																			{[device.make, device.model]
																				.filter(Boolean)
																				.join(" ") || "Unknown device"}
																		</span>
																		<span className="device-card-meta">
																			{device.color ? `${device.color} · ` : ""}
																			Serial:{" "}
																			{device.serial_number || "Not set"}
																		</span>
																		<span className="device-card-meta">
																			{device.active ? "Active" : "Inactive"}
																		</span>
																		<span className="device-card-open">
																			View device details
																		</span>
																	</div>
																</button>
															);
														})}
													</div>
												)
											) : (
												<p className="muted-text">
													Select a student to load device information.
												</p>
											)}
										</div>

										<div className="data-section">
											<div className="data-section-header">
												<h4>Enrollment terms</h4>
												<span>{membership.terms.length}</span>
											</div>
											{membership.terms.length === 0 ? (
												<p className="muted-text">
													No membership terms assigned.
												</p>
											) : (
												<div className="stack-list">
													{membership.terms.map((term) => (
														<div className="data-card" key={term.term_uuid}>
															<strong>{term.name}</strong>
															<span>
																{formatDateOnly(term.start_date)} –{" "}
																{formatDateOnly(term.end_date)}
															</span>
															<span>{term.active ? "Active" : "Inactive"}</span>
														</div>
													))}
												</div>
											)}
										</div>

										<div className="data-section">
											<div className="data-section-header">
												<h4>Parking reservations</h4>
												<span>{reservationsForMembership.length}</span>
											</div>
											{reservationsForMembership.length === 0 ? (
												<p className="muted-text">
													No parking reservations submitted.
												</p>
											) : (
												<div className="stack-list">
													{reservationsForMembership.map((reservation) => {
														const matchingPack =
															studentReservationPackByUUID.get(
																reservation.pack_uuid,
															) ?? null;
														const packPhotoUrl =
															matchingPack?.photo?.path_do_spaces?.trim() ?? "";

														return (
															<div
																className="data-card"
																key={reservation.reservation_uuid}>
																<div className="reservation-card-top">
																	<strong>
																		{reservation.term_name || "School term"}
																	</strong>
																	<span
																		className={`student-badge student-badge-status-${reservation.status}`}>
																		{reservation.status}
																	</span>
																</div>
																<span>
																	{reservation.pack_name ||
																		matchingPack?.name ||
																		"Juise Pack"}{" "}
																	· Spot {reservation.spot_number || "TBD"}
																</span>
																<span>
																	{formatUnixTimestamp(reservation.start_time)} –{" "}
																	{formatUnixTimestamp(reservation.end_time)}
																</span>
																<div className="student-reservation-media-grid">
																	<div className="student-photo-card">
																		<span>Juise Pack Photo</span>
																		{packPhotoUrl ? (
																			<img
																				className="student-photo-image"
																				src={packPhotoUrl}
																				alt={`${
																					matchingPack?.name ||
																					reservation.pack_name ||
																					"Juise Pack"
																				} photo`}
																				onClick={() =>
																					handleImagePreview(
																						packPhotoUrl,
																						`${
																							matchingPack?.name ||
																							reservation.pack_name ||
																							"Juise Pack"
																						} photo`,
																						matchingPack?.name ||
																							reservation.pack_name ||
																							"Juise Pack",
																					)
																				}
																			/>
																		) : (
																			<div className="student-photo-placeholder">
																				Juise Pack photo unavailable
																			</div>
																		)}
																	</div>
																	<div className="student-photo-card">
																		<span>Juise Pack Location</span>
																		{matchingPack?.location ? (
																			<StudentEventMiniMap
																				label={
																					matchingPack?.name ||
																					reservation.pack_name ||
																					"Juise Pack"
																				}
																				lat={matchingPack.location.lat}
																				lng={matchingPack.location.lng}
																				tone="poi"
																			/>
																		) : (
																			<div className="student-photo-placeholder">
																				Juise Pack location unavailable
																			</div>
																		)}
																	</div>
																</div>
																<div className="uuid-copy-stack">
																	<UuidCopyField
																		label="pack_uuid"
																		value={reservation.pack_uuid}
																		onCopy={handleCopyUuid}
																	/>
																	<UuidCopyField
																		label="pack_spot_uuid"
																		value={reservation.spot_uuid}
																		onCopy={handleCopyUuid}
																	/>
																</div>
															</div>
														);
													})}
												</div>
											)}
										</div>

										<div className="data-section">
											<div className="data-section-header">
												<h4>Visited POIs</h4>
												<span>{visitedPoiVisits.length}</span>
											</div>
											{studentBusy ? (
												<p className="muted-text">Loading route history…</p>
											) : studentRouteHistoryError ? (
												<p className="muted-text">
													Visited POIs unavailable right now:{" "}
													{studentRouteHistoryError}
												</p>
											) : visitedPoiVisits.length === 0 ? (
												<p className="muted-text">
													No visited POIs recorded for this student yet.
												</p>
											) : (
												<div className="stack-list">
													{visitedPoiVisits.map(({ poi, session }, index) => (
														<div
															className="data-card"
															key={`${session.session_id}-${poi.poi_uuid}-${poi.visited_at}-${index}`}>
															<div className="student-event-card">
																<div className="student-event-copy">
																	<div className="reservation-card-top">
																		<strong>{poi.title || "Visited POI"}</strong>
																		<span className="student-badge student-badge-highlight">
																			+{poi.bonus_points} pts
																		</span>
																	</div>
																	<span>{formatUnixTimestamp(poi.visited_at)}</span>
																	<span>
																		Trip: {session.trip_mode || "Unknown"} · Session{" "}
																		{formatUnixTimestamp(session.started_at)}
																	</span>
																	<span>
																		{poi.description || "No POI description provided."}
																	</span>
																	<div className="uuid-copy-stack">
																		<UuidCopyField
																			label="poi_uuid"
																			value={poi.poi_uuid}
																			onCopy={handleCopyUuid}
																		/>
																		<UuidCopyField
																			label="session_id"
																			value={session.session_id}
																			onCopy={handleCopyUuid}
																		/>
																	</div>
																</div>
																<StudentEventMiniMap
																	label={poi.title || "Visited POI"}
																	lat={poi.lat}
																	lng={poi.lng}
																	tone="poi"
																/>
															</div>
														</div>
													))}
												</div>
											)}
										</div>

										<div className="data-section">
											<div className="data-section-header">
												<h4>Route penalties</h4>
												<span>{penaltyEvents.length}</span>
											</div>
											{studentBusy ? (
												<p className="muted-text">Loading route history…</p>
											) : studentRouteHistoryError ? (
												<p className="muted-text">
													Penalty events unavailable right now:{" "}
													{studentRouteHistoryError}
												</p>
											) : penaltyEvents.length === 0 ? (
												<p className="muted-text">
													No route penalty events recorded for this student.
												</p>
											) : (
												<div className="stack-list">
													{penaltyEvents.map(({ event, session }, index) => (
														(() => {
															const matchingZone = resolvePenaltyZone(
																session,
																studentSchoolZones,
																event.zone_uuid,
															);
															const estimatedSpeedMph =
																event.zone_type === "speed_limit"
																	? estimatePenaltySpeedMph(session, event)
																	: null;

															return (
																<div
																	className="data-card"
																	key={`${session.session_id}-${event.zone_uuid}-${event.occurred_at}-${index}`}>
																	<div className="student-event-card">
																		<div className="student-event-copy">
																			<div className="reservation-card-top">
																				<strong>
																					{event.title ||
																						formatPenaltyZoneType(event.zone_type)}
																				</strong>
																				<span className="student-badge student-badge-status-denied">
																					-{event.points_lost} pts
																				</span>
																			</div>
																			<span>{formatUnixTimestamp(event.occurred_at)}</span>
																			<span>
																				Type: {formatPenaltyZoneType(event.zone_type)}
																				{event.speed_limit_mph
																					? ` · Limit ${event.speed_limit_mph} mph`
																					: ""}
																			</span>
																			{event.zone_type === "speed_limit" ? (
																				<span>
																					Student speed:{" "}
																					{estimatedSpeedMph
																						? formatSpeedMph(estimatedSpeedMph)
																						: "Unavailable from route points"}
																				</span>
																			) : null}
																			<span>
																				Reason:{" "}
																				{event.reason || "No penalty reason provided."}
																			</span>
																			<span>
																				{event.description ||
																					"No penalty description provided."}
																			</span>
																			<div className="uuid-copy-stack">
																				<UuidCopyField
																					label="zone_uuid"
																					value={event.zone_uuid}
																					onCopy={handleCopyUuid}
																				/>
																				<UuidCopyField
																					label="session_id"
																					value={session.session_id}
																					onCopy={handleCopyUuid}
																				/>
																			</div>
																		</div>
																		<StudentEventMiniMap
																			label={
																				event.title ||
																				formatPenaltyZoneType(event.zone_type)
																			}
																			lat={event.lat}
																			lng={event.lng}
																			polygon={matchingZone?.polygon}
																			tone="penalty"
																		/>
																	</div>
																</div>
															);
														})()
													))}
												</div>
											)}
										</div>

										<div className="data-section">
											<div className="data-section-header">
												<h4>Parking violations</h4>
												<span>{studentViolations.length}</span>
											</div>
											{studentBusy ? (
												<p className="muted-text">Loading violations…</p>
											) : studentViolationError ? (
												<p className="muted-text">
													Violation history unavailable right now: {studentViolationError}
												</p>
											) : studentViolations.length === 0 ? (
												<p className="muted-text">
													No parking violations reported for this student.
												</p>
											) : (
												<div className="stack-list">
													{studentViolations.map((violation) => {
														const violationMediaAssets =
															studentViolationMediaByViolation[
																violation.violation_uuid
															] ?? [];

														return (
															<div className="data-card" key={violation.violation_uuid}>
																<div className="reservation-card-top">
																	<strong>
																		{formatUnixTimestamp(violation.created_at)}
																	</strong>
																	<span className="student-badge student-badge-muted">
																		{violation.status || "reported"}
																	</span>
																</div>
																<span>
																	{violation.description || "No description provided."}
																</span>
																<span>
																	Device: {violation.registered_device_uuid || "Not linked"}
																</span>
																<div className="uuid-copy-stack">
																	<UuidCopyField
																		label="violation_uuid"
																		value={violation.violation_uuid}
																		onCopy={handleCopyUuid}
																	/>
																	<UuidCopyField
																		label="registered_device_uuid"
																		value={violation.registered_device_uuid ?? undefined}
																		onCopy={handleCopyUuid}
																	/>
																</div>
																{violationMediaAssets.length > 0 ? (
																	<div className="student-photos-grid">
																		{violationMediaAssets.map((asset, index) => {
																			const violationPhotoUrl =
																				studentViolationSignedMediaUrls[asset.object_key] ??
																				"";
																			if (!violationPhotoUrl) {
																				return null;
																			}

																			return (
																				<div className="student-photo-card" key={asset.media_uuid}>
																					<span>
																						{formatViolationSlotLabel(asset.slot, index)}
																					</span>
																					<img
																						className="student-photo-image"
																						src={violationPhotoUrl}
																						alt={`${fullName} violation photo ${index + 1}`}
																						onClick={() =>
																							handleImagePreview(
																								violationPhotoUrl,
																								`${fullName} violation photo ${index + 1}`,
																								`${fullName} violation photo ${index + 1}`,
																							)
																						}
																					/>
																				</div>
																			);
																		})}
																	</div>
																) : (
																	<p className="muted-text">No violation photos attached.</p>
																)}
															</div>
														);
													})}
												</div>
											)}
										</div>
									</>
								);
							})()
						)}
					</div>
				</div>
			) : null}
		</section>
	);
}
