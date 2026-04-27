import { type FormEvent, useMemo, useState } from "react";

import {
	sendSchoolCustomNotification,
	type CustomNotificationAudience,
	type SchoolStudentRosterEntry,
} from "../../lib/api";

type Props = {
	activeSchoolId: string;
	managedAppId: string;
	studentRoster: SchoolStudentRosterEntry[];
	formatNebulaUserName: (profile: {
		first_name?: string;
		last_name?: string;
		username?: string;
		email?: string;
	}) => string;
};

export function NotificationsScreen({
	activeSchoolId,
	managedAppId,
	studentRoster,
	formatNebulaUserName,
}: Props) {
	const [audience, setAudience] =
		useState<CustomNotificationAudience>("school");
	const [selectedUserUUID, setSelectedUserUUID] = useState("");
	const [title, setTitle] = useState("");
	const [message, setMessage] = useState("");
	const [url, setUrl] = useState("");
	const [busy, setBusy] = useState(false);
	const [statusMessage, setStatusMessage] = useState("");
	const [errorMessage, setErrorMessage] = useState("");

	const studentOptions = useMemo(
		() =>
			[...studentRoster]
				.filter((entry) => entry.user.k_guid?.trim())
				.sort((left, right) =>
					formatNebulaUserName(left.user).localeCompare(
						formatNebulaUserName(right.user),
					),
				),
		[formatNebulaUserName, studentRoster],
	);

	const selectedStudent = studentOptions.find(
		(entry) => entry.user.k_guid === selectedUserUUID,
	);
	const selectedStudentLabel = selectedStudent
		? formatNebulaUserName(selectedStudent.user) ||
			selectedStudent.membership.student_id ||
			selectedStudent.user.k_guid
		: "";

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		setStatusMessage("");
		setErrorMessage("");

		const trimmedTitle = title.trim();
		const trimmedMessage = message.trim();
		const trimmedUrl = url.trim();
		if (!activeSchoolId || !managedAppId) {
			setErrorMessage("A school-scoped admin session is required.");
			return;
		}
		if (!trimmedTitle || !trimmedMessage) {
			setErrorMessage("Title and message are required.");
			return;
		}
		if (audience === "student" && !selectedUserUUID.trim()) {
			setErrorMessage("Choose a student before sending.");
			return;
		}

		setBusy(true);
		try {
			const response = await sendSchoolCustomNotification(
				managedAppId,
				activeSchoolId,
				{
					audience,
					title: trimmedTitle,
					message: trimmedMessage,
					url: trimmedUrl || undefined,
					user_uuids:
						audience === "student" ? [selectedUserUUID.trim()] : undefined,
					data: {
						dashboard_section: "notifications",
					},
				},
			);

			const targetLabel =
				audience === "student"
					? selectedStudentLabel || "selected student"
					: "active school audience";
			const providerId = response.provider_message_id
				? ` Provider id: ${response.provider_message_id}.`
				: "";
			setStatusMessage(`Notification queued for ${targetLabel}.${providerId}`);
			setTitle("");
			setMessage("");
			setUrl("");
		} catch (error) {
			setErrorMessage(
				error instanceof Error
					? error.message
					: "Unable to send notification.",
			);
		} finally {
			setBusy(false);
		}
	};

	return (
		<section className="management-page notifications-page">
			<section className="panel">
				<div className="panel-header">
					<div>
						<p className="eyebrow">Notifications</p>
						<h2>Custom push notifications</h2>
					</div>
				</div>

				<div className="management-summary-grid">
					<div className="stat-card">
						<span>App Scope</span>
						<strong>{managedAppId || "None"}</strong>
					</div>
					<div className="stat-card">
						<span>School</span>
						<strong>{activeSchoolId || "None"}</strong>
					</div>
					<div className="stat-card">
						<span>Students</span>
						<strong>{studentOptions.length}</strong>
					</div>
				</div>
			</section>

			<form className="management-map-card notification-composer" onSubmit={handleSubmit}>
				<div className="panel-header">
					<div>
						<h3>Compose notification</h3>
					</div>
					<div className="dashboard-segmented" aria-label="Notification target">
						<button
							className={
								audience === "school"
									? "dashboard-segment dashboard-segment-active"
									: "dashboard-segment"
							}
							type="button"
							onClick={() => setAudience("school")}>
							School
						</button>
						<button
							className={
								audience === "student"
									? "dashboard-segment dashboard-segment-active"
									: "dashboard-segment"
							}
							type="button"
							onClick={() => setAudience("student")}>
							Student
						</button>
					</div>
				</div>

				<div className="form-grid">
					{audience === "student" ? (
						<label className="field field-span-2">
							<span>Student</span>
							<select
								value={selectedUserUUID}
								onChange={(event) => setSelectedUserUUID(event.target.value)}
								required>
								<option value="">Choose a student</option>
								{studentOptions.map((entry) => {
									const name = formatNebulaUserName(entry.user);
									const label = [
										name || entry.user.email || entry.user.k_guid,
										entry.membership.student_id
											? `ID ${entry.membership.student_id}`
											: "",
									]
										.filter(Boolean)
										.join(" - ");
									return (
										<option key={entry.user.k_guid} value={entry.user.k_guid}>
											{label}
										</option>
									);
								})}
							</select>
						</label>
					) : null}

					<label className="field field-span-2">
						<span>Title</span>
						<input
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							placeholder="Parking update"
							maxLength={80}
							required
						/>
					</label>

					<label className="field field-span-2">
						<span>Message</span>
						<textarea
							value={message}
							onChange={(event) => setMessage(event.target.value)}
							placeholder="Add the message students should receive."
							maxLength={240}
							required
						/>
					</label>

					<label className="field field-span-2">
						<span>Deep link or URL</span>
						<input
							value={url}
							onChange={(event) => setUrl(event.target.value)}
							placeholder="juisecustomerapp://notifications"
						/>
					</label>
				</div>

				{statusMessage ? (
					<p className="empty-state notification-send-status">{statusMessage}</p>
				) : null}
				{errorMessage ? <p className="error-text">{errorMessage}</p> : null}

				<div className="form-actions">
					<button
						className="primary-button"
						type="submit"
						disabled={
							busy ||
							!activeSchoolId ||
							!managedAppId ||
							(audience === "student" && !selectedUserUUID)
						}>
						{busy ? "Sending..." : "Send Notification"}
					</button>
				</div>
			</form>
		</section>
	);
}
