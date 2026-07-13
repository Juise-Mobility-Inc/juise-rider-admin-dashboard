import { useCallback, useEffect, useMemo, useState } from "react";

import {
	fetchSchoolParkingIncidentReports,
	signSchoolMedia,
	type ParkingIncidentReportStatus,
	type ParkingIncidentReportType,
	type SchoolStudentRosterEntry,
	type StudentParkingIncidentReport,
	updateSchoolParkingIncidentReport,
} from "../../lib/api";

type Props = {
	activeSchoolId: string;
	managedAppId: string;
	studentRoster: SchoolStudentRosterEntry[];
	studentProfilePhotoUrls: Record<string, string>;
	onOpenStudent: (membershipUUID: string) => void;
};

const statusOptions: Array<"all" | ParkingIncidentReportStatus> = [
	"all",
	"submitted",
	"under_review",
	"resolved",
	"dismissed",
];

const reportTypeOptions: Array<"all" | ParkingIncidentReportType> = [
	"all",
	"reserved_spot_occupied",
	"improper_parking",
	"blocking_access",
	"other",
];

function formatStatus(value: string): string {
	return value
		.split(/[_\-\s]+/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

function formatDateTime(timestamp?: number | null): string {
	if (!timestamp) {
		return "Not set";
	}
	return new Date(timestamp * 1000).toLocaleString([], {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Something went wrong.";
}

function getReporterLabel(
	report: StudentParkingIncidentReport,
	studentByMembership: Map<string, SchoolStudentRosterEntry>,
	studentByUser: Map<string, SchoolStudentRosterEntry>,
): string {
	const entry =
		(report.reporter_membership_uuid
			? studentByMembership.get(report.reporter_membership_uuid)
			: undefined) ?? studentByUser.get(report.reporter_user_uuid);
	if (!entry) {
		return report.reporter_user_uuid;
	}
	const firstName = entry.user.first_name?.trim();
	const lastName = entry.user.last_name?.trim();
	const fullName = [firstName, lastName].filter(Boolean).join(" ");
	return fullName || entry.user.username || entry.user.email || report.reporter_user_uuid;
}

function getMediaObjectKey(
	report: StudentParkingIncidentReport | null,
	slot: string,
): string {
	return (
		report?.media_assets?.find(
			(asset) => asset.slot === slot && asset.object_key?.trim(),
		)?.object_key ?? ""
	);
}

function getInitials(label: string): string {
	const words = label
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	if (words.length === 0) {
		return "?";
	}
	return words
		.slice(0, 2)
		.map((word) => word.charAt(0).toUpperCase())
		.join("");
}

function getReportStatusClass(status: ParkingIncidentReportStatus): string {
	switch (status) {
		case "resolved":
			return "cd-status-approved";
		case "under_review":
			return "cd-status-qr";
		case "dismissed":
			return "cd-status-inactive";
		case "submitted":
		default:
			return "cd-status-pending";
	}
}

export function ParkingReportsScreen({
	activeSchoolId,
	managedAppId,
	studentRoster,
	studentProfilePhotoUrls,
	onOpenStudent,
}: Props) {
	const [statusFilter, setStatusFilter] =
		useState<"all" | ParkingIncidentReportStatus>("all");
	const [typeFilter, setTypeFilter] =
		useState<"all" | ParkingIncidentReportType>("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [filterModalOpen, setFilterModalOpen] = useState(false);
	const [draftStatusFilter, setDraftStatusFilter] =
		useState<"all" | ParkingIncidentReportStatus>("all");
	const [draftTypeFilter, setDraftTypeFilter] =
		useState<"all" | ParkingIncidentReportType>("all");
	const [reports, setReports] = useState<StudentParkingIncidentReport[]>([]);
	const [selectedReportId, setSelectedReportId] = useState("");
	const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
	const [loadBusy, setLoadBusy] = useState(false);
	const [saveBusy, setSaveBusy] = useState(false);
	const [error, setError] = useState("");
	const [statusDraft, setStatusDraft] =
		useState<ParkingIncidentReportStatus>("submitted");
	const [adminNotesDraft, setAdminNotesDraft] = useState("");
	const [studentNoteDraft, setStudentNoteDraft] = useState("");

	const studentByMembership = useMemo(() => {
		const map = new Map<string, SchoolStudentRosterEntry>();
		studentRoster.forEach((entry) => {
			if (entry.membership.membership_uuid) {
				map.set(entry.membership.membership_uuid, entry);
			}
		});
		return map;
	}, [studentRoster]);

	const studentByUser = useMemo(() => {
		const map = new Map<string, SchoolStudentRosterEntry>();
		studentRoster.forEach((entry) => {
			if (entry.user.k_guid) {
				map.set(entry.user.k_guid, entry);
			}
		});
		return map;
	}, [studentRoster]);

	const selectedReport = useMemo(
		() => reports.find((report) => report.report_uuid === selectedReportId) ?? null,
		[reports, selectedReportId],
	);

	const filteredReports = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();
		const sortedReports = [...reports].sort(
			(left, right) => (right.created_at ?? 0) - (left.created_at ?? 0),
		);
		if (!query) {
			return sortedReports;
		}
		return sortedReports.filter((report) => {
			const searchableText = [
				getReporterLabel(report, studentByMembership, studentByUser),
				formatStatus(report.report_type),
				formatStatus(report.status),
				report.description,
				report.pack_uuid ?? "",
				report.spot_uuid ?? "",
				report.reservation_uuid ?? "",
				report.report_uuid,
			]
				.join(" ")
				.toLowerCase();
			return searchableText.includes(query);
		});
	}, [reports, searchQuery, studentByMembership, studentByUser]);

	const refreshReports = useCallback(async () => {
		if (!activeSchoolId || !managedAppId) {
			setReports([]);
			setSelectedReportId("");
			setSignedUrls({});
			return;
		}
		setLoadBusy(true);
		setError("");
		try {
			const nextReports = await fetchSchoolParkingIncidentReports(
				managedAppId,
				activeSchoolId,
				{
					status: statusFilter === "all" ? undefined : statusFilter,
					reportType: typeFilter === "all" ? undefined : typeFilter,
					includeInactive: true,
					limit: 100,
				},
			);
			setReports(nextReports);
			setSelectedReportId((current) => {
				if (nextReports.some((report) => report.report_uuid === current)) {
					return current;
				}
				return nextReports[0]?.report_uuid ?? "";
			});

			const objectKeysBySchool = new Map<string, string[]>();
			for (const report of nextReports) {
				const reportSchoolId = report.school_id || activeSchoolId;
				const objectKeys = (report.media_assets ?? [])
					.map((asset) => asset.object_key?.trim() ?? "")
					.filter(Boolean);
				if (objectKeys.length > 0) {
					objectKeysBySchool.set(reportSchoolId, [
						...(objectKeysBySchool.get(reportSchoolId) ?? []),
						...objectKeys,
					]);
				}
			}
			if (objectKeysBySchool.size > 0) {
				const signedResults = await Promise.allSettled(
					Array.from(objectKeysBySchool.entries()).map(([schoolId, objectKeys]) =>
						signSchoolMedia(schoolId, objectKeys),
					),
				);
				setSignedUrls(
					Object.assign(
						{},
						...signedResults.map((result) =>
							result.status === "fulfilled" ? result.value : {},
						),
					),
				);
			} else {
				setSignedUrls({});
			}
		} catch (nextError) {
			setError(getErrorMessage(nextError));
		} finally {
			setLoadBusy(false);
		}
	}, [activeSchoolId, managedAppId, statusFilter, typeFilter]);

	useEffect(() => {
		void refreshReports();
	}, [refreshReports]);

	useEffect(() => {
		if (!selectedReport) {
			setStatusDraft("submitted");
			setAdminNotesDraft("");
			setStudentNoteDraft("");
			return;
		}
		setStatusDraft(selectedReport.status);
		setAdminNotesDraft(selectedReport.admin_notes ?? "");
		setStudentNoteDraft(selectedReport.student_visible_note ?? "");
	}, [selectedReport]);

	async function saveSelectedReport() {
		if (!selectedReport) {
			return;
		}
		setSaveBusy(true);
		setError("");
		try {
			const updated = await updateSchoolParkingIncidentReport(
				selectedReport.app_id || managedAppId,
				selectedReport.school_id || activeSchoolId,
				selectedReport.report_uuid,
				{
					status: statusDraft,
					admin_notes: adminNotesDraft,
					student_visible_note: studentNoteDraft,
				},
			);
			setReports((current) =>
				current.map((report) =>
					report.report_uuid === updated.report_uuid ? updated : report,
				),
			);
		} catch (nextError) {
			setError(getErrorMessage(nextError));
		} finally {
			setSaveBusy(false);
		}
	}

	const incidentObjectKey = getMediaObjectKey(selectedReport, "incident_photo");
	const qrObjectKey = getMediaObjectKey(selectedReport, "device_qr_photo");
	const incidentPhotoUrl = incidentObjectKey ? signedUrls[incidentObjectKey] : "";
	const qrPhotoUrl = qrObjectKey ? signedUrls[qrObjectKey] : "";
	const selectedReporter =
		selectedReport &&
		((selectedReport.reporter_membership_uuid
			? studentByMembership.get(selectedReport.reporter_membership_uuid)
			: undefined) ??
			studentByUser.get(selectedReport.reporter_user_uuid));
	const selectedReporterAvatar =
		selectedReporter?.user.k_guid
			? studentProfilePhotoUrls[selectedReporter.user.k_guid]
			: "";
	const hasLocation =
		typeof selectedReport?.violation_latitude === "number" &&
		typeof selectedReport?.violation_longitude === "number";
	const mapUrl =
		hasLocation && selectedReport
			? `https://www.google.com/maps/search/?api=1&query=${selectedReport.violation_latitude},${selectedReport.violation_longitude}`
			: "";
	const activeFilterCount =
		(statusFilter === "all" ? 0 : 1) + (typeFilter === "all" ? 0 : 1);

	function openFilterModal() {
		setDraftStatusFilter(statusFilter);
		setDraftTypeFilter(typeFilter);
		setFilterModalOpen(true);
	}

	function applyFilterModal() {
		setStatusFilter(draftStatusFilter);
		setTypeFilter(draftTypeFilter);
		setFilterModalOpen(false);
	}

	function resetFilterModal() {
		setDraftStatusFilter("all");
		setDraftTypeFilter("all");
		setStatusFilter("all");
		setTypeFilter("all");
		setFilterModalOpen(false);
	}

	return (
		<div className="cd-root parking-reports-root">
			<div className="cd-table-view">
				<div className="cd-table-view-header">
					<div className="cd-table-view-header-row parking-reports-header-row">
						<div className="cd-table-view-title-group parking-reports-title-group">
							<div>
								<p className="section-eyebrow">Student reports</p>
								<h2 className="cd-sidebar-title">Parking Reports</h2>
								<div className="parking-reports-scope">
									<span>School {activeSchoolId || "none"}</span>
									<span>App {managedAppId || "none"}</span>
								</div>
							</div>
							<span className="cd-sidebar-count">
								{filteredReports.length} of {reports.length}
							</span>
						</div>
						<div className="parking-reports-actions">
							<input
								className="cd-table-search"
								type="search"
								value={searchQuery}
								onChange={(event) => setSearchQuery(event.target.value)}
								placeholder="Search reports"
							/>
							<button
								className="cd-table-btn"
								type="button"
								onClick={openFilterModal}>
								Filter table
								{activeFilterCount > 0 ? (
									<span className="parking-report-filter-count">
										{activeFilterCount}
									</span>
								) : null}
							</button>
							<button
								className="secondary-button"
								type="button"
								onClick={() => void refreshReports()}>
								{loadBusy ? "Refreshing..." : "Refresh"}
							</button>
						</div>
					</div>
				</div>

				<div className="parking-reports-body">
					{error ? <div className="form-error">{error}</div> : null}

					<section className="parking-reports-table-card">
						<div className="cd-table-scroll">
							<table className="cd-table">
								<thead>
									<tr>
										<th>Evidence</th>
										<th>Reporter</th>
										<th>Report</th>
										<th>Status</th>
										<th>Submitted</th>
										<th>Context</th>
										<th>Location</th>
									</tr>
								</thead>
								<tbody>
									{filteredReports.map((report) => {
										const incidentKey = getMediaObjectKey(
											report,
											"incident_photo",
										);
										const incidentUrl = incidentKey ? signedUrls[incidentKey] : "";
										const reporterLabel = getReporterLabel(
											report,
											studentByMembership,
											studentByUser,
										);
										const reporterEntry =
											(report.reporter_membership_uuid
												? studentByMembership.get(
														report.reporter_membership_uuid,
													)
												: undefined) ?? studentByUser.get(report.reporter_user_uuid);
										const reporterAvatar =
											reporterEntry?.user.k_guid
												? studentProfilePhotoUrls[reporterEntry.user.k_guid]
												: "";
										const contextValues = [
											report.school_id && report.school_id !== activeSchoolId
												? `School ${report.school_id}`
												: "",
											report.pack_uuid ? `Pack ${report.pack_uuid}` : "",
											report.spot_uuid ? `Spot ${report.spot_uuid}` : "",
											report.reservation_uuid
												? `Reservation ${report.reservation_uuid}`
												: "",
										].filter(Boolean);
										const rowHasLocation =
											typeof report.violation_latitude === "number" &&
											typeof report.violation_longitude === "number";
										return (
											<tr
												key={report.report_uuid}
												className={`cd-table-row ${
													report.report_uuid === selectedReportId
														? "cd-table-row-selected"
														: ""
												}`}
												onClick={() => setSelectedReportId(report.report_uuid)}>
												<td>
													{incidentUrl ? (
														<img
															className="parking-report-table-thumb"
															src={incidentUrl}
															alt=""
														/>
													) : (
														<div className="parking-report-table-thumb parking-report-table-thumb-empty">
															Photo
														</div>
													)}
												</td>
												<td>
													<div className="cd-table-student-cell">
														{reporterAvatar ? (
															<img
																className="cd-table-avatar"
																src={reporterAvatar}
																alt=""
															/>
														) : (
															<span className="cd-table-avatar-initials">
																{getInitials(reporterLabel)}
															</span>
														)}
														<div>
															<div className="cd-table-name">
																{reporterLabel}
															</div>
															<div className="cd-table-sid">
																{reporterEntry?.membership.student_id
																	? `Student ID ${reporterEntry.membership.student_id}`
																	: "Student report"}
															</div>
														</div>
													</div>
												</td>
												<td>
													<div className="cd-table-name">
														{formatStatus(report.report_type)}
													</div>
													<div className="cd-table-uuid">
														{report.description}
													</div>
												</td>
												<td>
													<span
														className={`cd-status ${getReportStatusClass(
															report.status,
														)}`}>
														{formatStatus(report.status)}
													</span>
												</td>
												<td className="cd-table-date">
													{formatDateTime(report.created_at)}
												</td>
												<td>
													{contextValues.length > 0 ? (
														<div className="parking-report-context-stack">
															{contextValues.map((value) => (
																<span key={value}>{value}</span>
															))}
														</div>
													) : (
														<span className="cd-table-zero">None</span>
													)}
												</td>
												<td>
													<span className="cd-tag">
														{rowHasLocation ? "Captured" : "Missing"}
													</span>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
						{loadBusy ? (
							<div className="cd-empty">Loading reports...</div>
						) : null}
						{!loadBusy && filteredReports.length === 0 ? (
							<div className="cd-empty">
								No reports match this table view for school{" "}
								{activeSchoolId || "none"}.
							</div>
						) : null}
					</section>

					<section className="cd-section parking-report-detail-section">
						{selectedReport ? (
							<>
								<div className="parking-report-detail-header">
									<div>
										<p className="cd-section-title parking-report-detail-title">
											Selected report
										</p>
										<h3>{formatStatus(selectedReport.report_type)}</h3>
										<p className="muted">
											Submitted {formatDateTime(selectedReport.created_at)}
										</p>
									</div>
									<span
										className={`cd-status ${getReportStatusClass(
											selectedReport.status,
										)}`}>
										{formatStatus(selectedReport.status)}
									</span>
								</div>

								<div className="parking-report-detail-content">
									{selectedReporter ? (
										<div className="profile-row">
											{selectedReporterAvatar ? (
												<img
													src={selectedReporterAvatar}
													alt=""
													className="avatar"
												/>
											) : (
												<span className="cd-table-avatar-initials">
													{getInitials(
														getReporterLabel(
															selectedReport,
															studentByMembership,
															studentByUser,
														),
													)}
												</span>
											)}
											<div>
												<strong>
													{getReporterLabel(
														selectedReport,
														studentByMembership,
														studentByUser,
													)}
												</strong>
												<p className="muted">
													Student ID{" "}
													{selectedReporter.membership.student_id || "N/A"}
												</p>
							</div>
											<button
												type="button"
												className="secondary-button"
												onClick={() =>
													onOpenStudent(
														selectedReporter.membership.membership_uuid,
													)
												}>
												Open student
											</button>
										</div>
									) : null}

									<div className="media-grid">
										<div>
											<p className="section-eyebrow">Incident photo</p>
											{incidentPhotoUrl ? (
												<img
													src={incidentPhotoUrl}
													alt=""
													className="evidence-image"
												/>
											) : (
												<p className="muted">
													No signed incident photo available.
												</p>
											)}
										</div>
										<div>
											<p className="section-eyebrow">QR photo</p>
											{qrPhotoUrl ? (
												<img
													src={qrPhotoUrl}
													alt=""
													className="evidence-image"
												/>
											) : (
												<p className="muted">No QR photo attached.</p>
											)}
										</div>
									</div>

									<div className="detail-grid">
										<div>
											<p className="section-eyebrow">Description</p>
											<p>{selectedReport.description}</p>
										</div>
										<div>
											<p className="section-eyebrow">Context</p>
											<p className="muted">
												Pack: {selectedReport.pack_uuid || "N/A"}
											</p>
											<p className="muted">
												Spot: {selectedReport.spot_uuid || "N/A"}
											</p>
											<p className="muted">
												Reservation:{" "}
												{selectedReport.reservation_uuid || "N/A"}
											</p>
										</div>
										<div>
											<p className="section-eyebrow">Location</p>
											{mapUrl ? (
												<a href={mapUrl} target="_blank" rel="noreferrer">
													Open report location
												</a>
											) : (
												<p className="muted">No location captured.</p>
											)}
										</div>
									</div>

									<div className="form-grid">
										<label>
											Status
											<select
												value={statusDraft}
												onChange={(event) =>
													setStatusDraft(
														event.target
															.value as ParkingIncidentReportStatus,
													)
												}>
												{statusOptions
													.filter((status) => status !== "all")
													.map((status) => (
														<option key={status} value={status}>
															{formatStatus(status)}
														</option>
													))}
											</select>
										</label>
										<label>
											Internal notes
											<textarea
												value={adminNotesDraft}
												onChange={(event) =>
													setAdminNotesDraft(event.target.value)
												}
												rows={4}
											/>
										</label>
										<label>
											Student-visible note
											<textarea
												value={studentNoteDraft}
												onChange={(event) =>
													setStudentNoteDraft(event.target.value)
												}
												rows={3}
											/>
										</label>
									</div>
									<button
										type="button"
										className="primary-button"
										disabled={saveBusy}
										onClick={() => void saveSelectedReport()}>
										{saveBusy ? "Saving..." : "Save review"}
									</button>
								</div>
							</>
						) : (
							<div className="cd-empty">Select a report to review.</div>
						)}
					</section>
				</div>
			</div>

			{filterModalOpen ? (
				<div
					className="management-modal-backdrop"
					role="dialog"
					aria-modal="true"
					aria-labelledby="parking-report-filter-title"
					onClick={() => setFilterModalOpen(false)}>
					<div
						className="management-modal-sheet parking-report-filter-modal"
						onClick={(event) => event.stopPropagation()}>
						<div className="management-modal-header">
							<div>
								<p className="section-eyebrow">Table filters</p>
								<h3 id="parking-report-filter-title">Filter Parking Reports</h3>
								<p className="muted">
									Choose the report status and type shown in the table.
								</p>
							</div>
							<button
								className="management-modal-close"
								type="button"
								onClick={() => setFilterModalOpen(false)}>
								Close
							</button>
						</div>
						<div className="parking-report-filter-grid">
							<label>
								Status
								<select
									value={draftStatusFilter}
									onChange={(event) =>
										setDraftStatusFilter(
											event.target
												.value as "all" | ParkingIncidentReportStatus,
										)
									}>
									{statusOptions.map((status) => (
										<option key={status} value={status}>
											{status === "all"
												? "All statuses"
												: formatStatus(status)}
										</option>
									))}
								</select>
							</label>
							<label>
								Type
								<select
									value={draftTypeFilter}
									onChange={(event) =>
										setDraftTypeFilter(
											event.target
												.value as "all" | ParkingIncidentReportType,
										)
									}>
									{reportTypeOptions.map((type) => (
										<option key={type} value={type}>
											{type === "all"
												? "All report types"
												: formatStatus(type)}
										</option>
									))}
								</select>
							</label>
						</div>
						<div className="parking-report-filter-actions">
							<button
								className="secondary-button"
								type="button"
								onClick={resetFilterModal}>
								Reset
							</button>
							<button
								className="primary-button"
								type="button"
								onClick={applyFilterModal}>
								Apply filters
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
