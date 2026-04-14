import type { ComponentType, Dispatch, SetStateAction } from "react";

import type {
	PackSpotReservation,
	SchoolStudentRosterEntry,
	StudentProfileBundle,
	StudentPublicProfile,
	UserSchoolMembership,
} from "../../lib/api";

type StudentIdPhotoSlot = "front" | "back";
type StudentIdPhotoKeys = Partial<Record<StudentIdPhotoSlot, string>>;
type StudentRosterPhotoKeyMap = Record<string, StudentIdPhotoKeys>;

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
	setSelectedStudentMembershipId: Dispatch<SetStateAction<string | null>>;
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
  handleSelectStudentInRoster: (membershipUUID: string) => Promise<void>;
	refreshStudentRoster: () => Promise<void>;
	setStudentProfile: Dispatch<SetStateAction<StudentProfileBundle | null>>;
	setStudentPublicProfile: Dispatch<
		SetStateAction<StudentPublicProfile | null>
	>;
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

export function StudentsScreen(props: Props) {
	const {
		activeSchoolId,
		schoolStudentRosterBusy,
		schoolStudentRosterError,
		studentRosterSearch,
		setStudentRosterSearch,
		filteredStudentRoster,
		selectedStudentMembershipId,
		setSelectedStudentMembershipId,
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
		handleSelectStudentInRoster,
		refreshStudentRoster,
		setStudentProfile,
		setStudentPublicProfile,
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
						setSelectedStudentMembershipId(null);
						setStudentProfile(null);
						setStudentPublicProfile(null);
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
								const matchedPublicProfile =
									studentPublicProfile?.user.user_uuid === entry.user.k_guid
										? studentPublicProfile
										: null;
								const profileImageUrl =
									matchedPublicProfile?.user.profile_image_url?.trim() ||
									schoolStudentProfilePhotoUrls[entry.user.k_guid] ||
									"";

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
												{studentProfile &&
												studentProfile.user.k_guid === entry.user.k_guid ? (
													<span>{studentProfile.devices.length}</span>
												) : null}
											</div>
											{studentBusy ? (
												<p className="muted-text">Loading devices…</p>
											) : studentProfile &&
											  studentProfile.user.k_guid === entry.user.k_guid ? (
												studentProfile.devices.length === 0 ? (
													<p className="muted-text">
														No registered devices found.
													</p>
												) : (
													<div className="devices-grid">
														{studentProfile.devices.map((device) => {
															const devicePhotoUrl =
																studentDevicePhotoUrls[
																	device.registered_device_uuid
																] ?? "";

															return (
																<div
																	className="device-card"
																	key={device.registered_device_uuid}>
																	{devicePhotoUrl ? (
																		<img
																			className="device-card-photo"
																			src={devicePhotoUrl}
																			alt={`${device.nickname || device.device_type} device`}
																			onClick={() =>
																				handleImagePreview(
																					devicePhotoUrl,
																					`${device.nickname || device.device_type} device`,
																					device.nickname ||
																						device.device_type,
																				)
																			}
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
																	</div>
																</div>
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
													{reservationsForMembership.map((reservation) => (
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
																{reservation.pack_name || "Juise Pack"} · Spot{" "}
																{reservation.spot_number || "TBD"}
															</span>
															<span>
																{formatUnixTimestamp(reservation.start_time)} –{" "}
																{formatUnixTimestamp(reservation.end_time)}
															</span>
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
													))}
												</div>
											)}
										</div>

										<div className="data-section">
											<div className="data-section-header">
												<h4>Violations</h4>
											</div>
											<div className="placeholder-section">
												<span className="placeholder-section-icon">🚫</span>
												<strong>No violation data available</strong>
												<span>
													Violation history will appear here once the violations
													API is connected.
												</span>
											</div>
										</div>

										<div className="data-section">
											<div className="data-section-header">
												<h4>Visited POIs</h4>
											</div>
											<div className="placeholder-section">
												<span className="placeholder-section-icon">📍</span>
												<strong>No POI visit data available</strong>
												<span>
													Point-of-interest visit history will appear here once
													the POI tracking API is connected.
												</span>
											</div>
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
