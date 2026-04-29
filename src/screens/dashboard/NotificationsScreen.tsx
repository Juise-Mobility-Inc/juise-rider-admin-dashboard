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

type NotificationDeliveryDetails = {
	audience: CustomNotificationAudience;
	provider: string;
	providerMessageId?: string;
	recipientCount: number | null;
	targetUserUUIDs: string[];
	targetOneSignalIDs: string[];
	targetSubscriptionIDs: string[];
	providerMessage?: string;
	providerRecipients?: unknown;
	providerResponse?: Record<string, unknown>;
	providerTargeting?: Record<string, unknown>;
};

function resolveStudentUserUUID(entry: SchoolStudentRosterEntry): string {
	return (entry.membership.user_uuid || "").trim() || entry.user.k_guid;
}

function resolveStudentUserUUIDs(entry: SchoolStudentRosterEntry | undefined) {
	if (!entry) {
		return [];
	}

	return Array.from(
		new Set(
			[entry.membership.user_uuid, entry.user.k_guid]
				.map((value) => value?.trim())
				.filter((value): value is string => Boolean(value)),
		),
	);
}

function resolveRecipientCount(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (Array.isArray(value)) {
		return value.length;
	}

	if (!value || typeof value !== "object") {
		return null;
	}

	const response = value as Record<string, unknown>;
	for (const key of ["recipients", "recipient_count", "successful", "sent"]) {
		const nestedValue = response[key];
		if (typeof nestedValue === "number" && Number.isFinite(nestedValue)) {
			return nestedValue;
		}
		if (Array.isArray(nestedValue)) {
			return nestedValue.length;
		}
	}

	return null;
}

function resolveProviderErrorMessage(value: unknown): string | null {
	if (!value || typeof value !== "object") {
		return null;
	}

	const errors = (value as Record<string, unknown>).errors;
	if (typeof errors === "string" && errors.trim()) {
		return errors.trim();
	}
	if (Array.isArray(errors)) {
		const message = errors
			.map((item) => String(item).trim())
			.filter(Boolean)
			.join("; ");
		return message || null;
	}

	return null;
}

function formatDiagnosticValue(value: unknown): string {
	if (value === undefined) {
		return "Not returned";
	}

	if (value === null) {
		return "null";
	}

	if (typeof value === "string") {
		return value;
	}

	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

export function NotificationsScreen({
	activeSchoolId,
	managedAppId,
	studentRoster,
	formatNebulaUserName,
}: Props) {
	const [audience, setAudience] =
		useState<CustomNotificationAudience>("school");
	const [selectedUserUUID, setSelectedUserUUID] = useState("");
	const [oneSignalId, setOneSignalId] = useState("");
	const [subscriptionId, setSubscriptionId] = useState("");
	const [title, setTitle] = useState("");
	const [message, setMessage] = useState("");
	const [url, setUrl] = useState("");
	const [busy, setBusy] = useState(false);
	const [statusMessage, setStatusMessage] = useState("");
	const [errorMessage, setErrorMessage] = useState("");
	const [deliveryDetails, setDeliveryDetails] =
		useState<NotificationDeliveryDetails | null>(null);

	const studentOptions = useMemo(
		() =>
			[...studentRoster]
				.filter((entry) => resolveStudentUserUUID(entry))
				.sort((left, right) =>
					formatNebulaUserName(left.user).localeCompare(
						formatNebulaUserName(right.user),
					),
				),
		[formatNebulaUserName, studentRoster],
	);

	const selectedStudent = studentOptions.find(
		(entry) => resolveStudentUserUUID(entry) === selectedUserUUID,
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
		setDeliveryDetails(null);

		const trimmedTitle = title.trim();
		const trimmedMessage = message.trim();
		const trimmedUrl = url.trim();
		const trimmedOneSignalId = oneSignalId.trim();
		const trimmedSubscriptionId = subscriptionId.trim();
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
		if (audience === "onesignal" && !trimmedOneSignalId) {
			setErrorMessage("Enter a OneSignal ID before sending.");
			return;
		}
		if (audience === "subscription" && !trimmedSubscriptionId) {
			setErrorMessage("Enter a OneSignal subscription ID before sending.");
			return;
		}

		setBusy(true);
		try {
			const targetUserUUIDs =
				audience === "student"
					? resolveStudentUserUUIDs(selectedStudent)
					: [];
			const targetOneSignalIDs =
				audience === "onesignal" ? [trimmedOneSignalId] : [];
			const targetSubscriptionIDs =
				audience === "subscription" ? [trimmedSubscriptionId] : [];
			if (audience === "student" && targetUserUUIDs.length === 0) {
				setErrorMessage("Choose a student before sending.");
				return;
			}

			const response = await sendSchoolCustomNotification(
				managedAppId,
				activeSchoolId,
				{
					audience,
					title: trimmedTitle,
					message: trimmedMessage,
					url: trimmedUrl || undefined,
					user_uuids: audience === "student" ? targetUserUUIDs : undefined,
					onesignal_ids:
						audience === "onesignal" ? targetOneSignalIDs : undefined,
					subscription_ids:
						audience === "subscription" ? targetSubscriptionIDs : undefined,
					data: {
						dashboard_section: "notifications",
					},
				},
			);

			const targetLabel =
				audience === "student"
					? selectedStudentLabel || "selected student"
					: audience === "onesignal"
						? "OneSignal user"
					: audience === "subscription"
						? "OneSignal subscription"
					: "active school audience";
			const providerId = response.provider_message_id
				? ` Provider id: ${response.provider_message_id}.`
				: "";
			const recipientCount =
				resolveRecipientCount(response.provider_recipients) ??
				resolveRecipientCount(response.provider_response);
			setDeliveryDetails({
				audience,
				provider: response.provider,
				providerMessageId: response.provider_message_id,
				recipientCount,
				targetUserUUIDs,
				targetOneSignalIDs,
				targetSubscriptionIDs,
				providerMessage: response.message,
				providerRecipients: response.provider_recipients,
				providerResponse: response.provider_response,
				providerTargeting: response.provider_targeting,
			});
			const providerErrorMessage = resolveProviderErrorMessage(
				response.provider_response,
			);
			if (providerErrorMessage) {
				throw new Error(providerErrorMessage);
			}
			if (recipientCount === 0) {
				throw new Error(
					"No subscribed OneSignal recipients matched this notification target.",
				);
			}
			const recipientLabel =
				typeof recipientCount === "number"
					? ` (${recipientCount} recipient${recipientCount === 1 ? "" : "s"})`
					: "";
			setStatusMessage(
				`Notification queued for ${targetLabel}${recipientLabel}.${providerId}`,
			);
			setTitle("");
			setMessage("");
			setUrl("");
			if (audience !== "onesignal") {
				setOneSignalId("");
			}
			if (audience !== "subscription") {
				setSubscriptionId("");
			}
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
						<button
							className={
								audience === "subscription"
									? "dashboard-segment dashboard-segment-active"
									: "dashboard-segment"
							}
							type="button"
							onClick={() => setAudience("subscription")}>
							Subscription
						</button>
						<button
							className={
								audience === "onesignal"
									? "dashboard-segment dashboard-segment-active"
									: "dashboard-segment"
							}
							type="button"
							onClick={() => setAudience("onesignal")}>
							OneSignal
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
									const userUUID = resolveStudentUserUUID(entry);
									const label = [
										name || entry.user.email || entry.user.k_guid,
										entry.membership.student_id
											? `ID ${entry.membership.student_id}`
											: "",
									]
										.filter(Boolean)
										.join(" - ");
									return (
										<option key={userUUID} value={userUUID}>
											{label}
										</option>
									);
								})}
							</select>
						</label>
					) : null}

					{audience === "onesignal" ? (
						<label className="field field-span-2">
							<span>OneSignal ID</span>
							<input
								value={oneSignalId}
								onChange={(event) => setOneSignalId(event.target.value)}
								placeholder="77ba871e-9e87-42a4-80a0-682540d54f41"
								required
							/>
						</label>
					) : null}

					{audience === "subscription" ? (
						<label className="field field-span-2">
							<span>OneSignal subscription ID</span>
							<input
								value={subscriptionId}
								onChange={(event) => setSubscriptionId(event.target.value)}
								placeholder="0a54ebec-1a06-47f1-83ea-cb5455acb87f"
								required
							/>
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
				{deliveryDetails ? (
					<div className="notification-diagnostics">
						<div>
							<span>Audience</span>
							<strong>{deliveryDetails.audience}</strong>
						</div>
						<div>
							<span>Provider</span>
							<strong>{deliveryDetails.provider || "Unknown"}</strong>
						</div>
						<div>
							<span>Recipients</span>
							<strong>
								{typeof deliveryDetails.recipientCount === "number"
									? deliveryDetails.recipientCount
									: "Not returned"}
							</strong>
						</div>
						<div>
							<span>Provider ID</span>
							<code>{deliveryDetails.providerMessageId || "Not returned"}</code>
						</div>
						<div>
							<span>Provider message</span>
							<code>{deliveryDetails.providerMessage || "Not returned"}</code>
						</div>
						<div>
							<span>Target UUIDs</span>
							<code>
								{deliveryDetails.targetUserUUIDs.length
									? deliveryDetails.targetUserUUIDs.join(", ")
									: "None"}
							</code>
						</div>
						<div>
							<span>Subscription IDs</span>
							<code>
								{deliveryDetails.targetSubscriptionIDs.length
									? deliveryDetails.targetSubscriptionIDs.join(", ")
									: "None"}
							</code>
						</div>
						<div>
							<span>OneSignal IDs</span>
							<code>
								{deliveryDetails.targetOneSignalIDs.length
									? deliveryDetails.targetOneSignalIDs.join(", ")
									: "None"}
							</code>
						</div>
						<div>
							<span>Provider recipients</span>
							<pre>{formatDiagnosticValue(deliveryDetails.providerRecipients)}</pre>
						</div>
						<div className="notification-diagnostics-wide">
							<span>Provider targeting</span>
							<pre>{formatDiagnosticValue(deliveryDetails.providerTargeting)}</pre>
						</div>
						<div className="notification-diagnostics-wide">
							<span>Provider response</span>
							<pre>{formatDiagnosticValue(deliveryDetails.providerResponse)}</pre>
						</div>
					</div>
				) : null}

				<div className="form-actions">
					<button
						className="primary-button"
						type="submit"
						disabled={
							busy ||
							!activeSchoolId ||
							!managedAppId ||
							(audience === "student" && !selectedUserUUID) ||
							(audience === "onesignal" && !oneSignalId.trim()) ||
							(audience === "subscription" && !subscriptionId.trim())
						}>
						{busy ? "Sending..." : "Send Notification"}
					</button>
				</div>
			</form>
		</section>
	);
}
