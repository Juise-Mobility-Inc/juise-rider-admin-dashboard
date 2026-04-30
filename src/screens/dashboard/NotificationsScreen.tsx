import {
	type ChangeEvent,
	type FormEvent,
	useEffect,
	useMemo,
	useState,
} from "react";

import {
	sendSchoolCustomNotification,
	type CustomNotificationAudience,
	type SchoolStudentRosterEntry,
	uploadSchoolNotificationImage,
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

type NotificationImageChoice =
	| "default"
	| "white_bolt"
	| "black_bolt"
	| "custom";

type NotificationHistoryEntry = {
	id: string;
	createdAt: number;
	audience: CustomNotificationAudience;
	targetLabel: string;
	selectedUserUUID: string;
	oneSignalId: string;
	subscriptionId: string;
	title: string;
	message: string;
	url: string;
	imageUrl: string;
	largeIconChoice: NotificationImageChoice;
	customLargeIcon: string;
	smallIconChoice: NotificationImageChoice;
	customSmallIcon: string;
	status: "sent" | "failed";
	errorMessage?: string;
	providerMessageId?: string;
	recipientCount: number | null;
};

const notificationHistoryLimit = 30;
const smallIconOptions: Array<{
	value: NotificationImageChoice;
	label: string;
	providerValue: string;
}> = [
	{ value: "default", label: "Default app icon", providerValue: "" },
	{
		value: "white_bolt",
		label: "White bolt",
		providerValue: "ic_stat_onesignal_default",
	},
	{
		value: "black_bolt",
		label: "Black bolt",
		providerValue: "notification_bolt_black",
	},
	{ value: "custom", label: "Custom resource", providerValue: "" },
];

const largeIconOptions: Array<{
	value: NotificationImageChoice;
	label: string;
	providerValue: string;
}> = [
	{ value: "default", label: "Default app icon", providerValue: "" },
	{
		value: "black_bolt",
		label: "Black bolt",
		providerValue: "notification_bolt_black",
	},
	{
		value: "white_bolt",
		label: "White bolt",
		providerValue: "notification_bolt_white",
	},
	{ value: "custom", label: "Custom URL or resource", providerValue: "" },
];

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

function buildNotificationHistoryKey(
	managedAppId: string,
	activeSchoolId: string,
) {
	return `juise-admin-notification-history:${managedAppId || "none"}:${activeSchoolId || "none"}`;
}

function loadNotificationHistory(
	managedAppId: string,
	activeSchoolId: string,
): NotificationHistoryEntry[] {
	if (typeof window === "undefined") {
		return [];
	}
	try {
		const raw = window.localStorage.getItem(
			buildNotificationHistoryKey(managedAppId, activeSchoolId),
		);
		if (!raw) {
			return [];
		}
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed.slice(0, notificationHistoryLimit)
			: [];
	} catch {
		return [];
	}
}

function saveNotificationHistory(
	managedAppId: string,
	activeSchoolId: string,
	history: NotificationHistoryEntry[],
) {
	if (typeof window === "undefined") {
		return;
	}
	window.localStorage.setItem(
		buildNotificationHistoryKey(managedAppId, activeSchoolId),
		JSON.stringify(history.slice(0, notificationHistoryLimit)),
	);
}

function formatHistoryTime(value: number) {
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(new Date(value));
}

function isRemoteImageUrl(value: string) {
	return /^https?:\/\//i.test(value.trim());
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
	const [imageUrl, setImageUrl] = useState("");
	const [imageUploadBusy, setImageUploadBusy] = useState(false);
	const [imageUploadName, setImageUploadName] = useState("");
	const [largeIconChoice, setLargeIconChoice] =
		useState<NotificationImageChoice>("default");
	const [customLargeIcon, setCustomLargeIcon] = useState("");
	const [smallIconChoice, setSmallIconChoice] =
		useState<NotificationImageChoice>("default");
	const [customSmallIcon, setCustomSmallIcon] = useState("");
	const [busy, setBusy] = useState(false);
	const [statusMessage, setStatusMessage] = useState("");
	const [errorMessage, setErrorMessage] = useState("");
	const [deliveryDetails, setDeliveryDetails] =
		useState<NotificationDeliveryDetails | null>(null);
	const [history, setHistory] = useState<NotificationHistoryEntry[]>(() =>
		loadNotificationHistory(managedAppId, activeSchoolId),
	);

	useEffect(() => {
		setHistory(loadNotificationHistory(managedAppId, activeSchoolId));
	}, [activeSchoolId, managedAppId]);

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
	const resolvedLargeIcon =
		largeIconChoice === "custom"
			? customLargeIcon.trim()
			: largeIconOptions.find((option) => option.value === largeIconChoice)
					?.providerValue || "";
	const resolvedSmallIcon =
		smallIconChoice === "custom"
			? customSmallIcon.trim()
			: smallIconOptions.find((option) => option.value === smallIconChoice)
					?.providerValue || "";
	const previewTitle = title.trim() || "Parking update";
	const previewMessage =
		message.trim() || "Add the message students should receive.";
	const previewUrl = url.trim();
	const previewImageUrl = imageUrl.trim();
	const previewLargeIcon = resolvedLargeIcon.trim();
	const previewSmallIconLabel =
		smallIconChoice === "custom"
			? customSmallIcon.trim() || "Custom"
			: smallIconOptions.find((option) => option.value === smallIconChoice)
					?.label || "Default";
	const previewLargeIconLabel =
		largeIconChoice === "custom"
			? customLargeIcon.trim() || "Custom"
			: largeIconOptions.find((option) => option.value === largeIconChoice)
					?.label || "Default";

	const addHistoryEntry = (entry: NotificationHistoryEntry) => {
		setHistory((current) => {
			const next = [entry, ...current].slice(0, notificationHistoryLimit);
			saveNotificationHistory(managedAppId, activeSchoolId, next);
			return next;
		});
	};

	const handleCopyNotification = (entry: NotificationHistoryEntry) => {
		setAudience(entry.audience);
		setSelectedUserUUID(entry.selectedUserUUID);
		setOneSignalId(entry.oneSignalId);
		setSubscriptionId(entry.subscriptionId);
		setTitle(entry.title);
		setMessage(entry.message);
		setUrl(entry.url);
		setImageUrl(entry.imageUrl);
		setLargeIconChoice(entry.largeIconChoice);
		setCustomLargeIcon(entry.customLargeIcon);
		setSmallIconChoice(entry.smallIconChoice);
		setCustomSmallIcon(entry.customSmallIcon);
		setStatusMessage("Copied notification into the composer.");
		setErrorMessage("");
		setDeliveryDetails(null);
	};

	const handleClearHistory = () => {
		setHistory([]);
		saveNotificationHistory(managedAppId, activeSchoolId, []);
	};

	const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) {
			return;
		}
		setStatusMessage("");
		setErrorMessage("");
		if (!activeSchoolId || !managedAppId) {
			setErrorMessage("A school-scoped admin session is required.");
			return;
		}
		if (!file.type.startsWith("image/")) {
			setErrorMessage("Choose an image file for the notification.");
			return;
		}

		setImageUploadBusy(true);
		try {
			const uploaded = await uploadSchoolNotificationImage(
				managedAppId,
				activeSchoolId,
				file,
			);
			setImageUrl(uploaded.image_url);
			setImageUploadName(file.name);
			setStatusMessage("Notification image uploaded.");
		} catch (error) {
			setErrorMessage(
				error instanceof Error
					? error.message
					: "Unable to upload notification image.",
			);
		} finally {
			setImageUploadBusy(false);
		}
	};

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		setStatusMessage("");
		setErrorMessage("");
		setDeliveryDetails(null);

		const trimmedTitle = title.trim();
		const trimmedMessage = message.trim();
		const trimmedUrl = url.trim();
		const trimmedImageUrl = imageUrl.trim();
		const trimmedLargeIcon = resolvedLargeIcon.trim();
		const trimmedSmallIcon = resolvedSmallIcon.trim();
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
		let targetLabel = "active school audience";
		let targetUserUUIDs: string[] = [];
		let targetOneSignalIDs: string[] = [];
		let targetSubscriptionIDs: string[] = [];
		try {
			targetUserUUIDs =
				audience === "student" ? resolveStudentUserUUIDs(selectedStudent) : [];
			targetOneSignalIDs = audience === "onesignal" ? [trimmedOneSignalId] : [];
			targetSubscriptionIDs =
				audience === "subscription" ? [trimmedSubscriptionId] : [];
			if (audience === "student" && targetUserUUIDs.length === 0) {
				setErrorMessage("Choose a student before sending.");
				return;
			}
			targetLabel =
				audience === "student"
					? selectedStudentLabel || "selected student"
					: audience === "onesignal"
						? "OneSignal user"
						: audience === "subscription"
							? "OneSignal subscription"
							: "active school audience";

			const response = await sendSchoolCustomNotification(
				managedAppId,
				activeSchoolId,
				{
					audience,
					title: trimmedTitle,
					message: trimmedMessage,
					url: trimmedUrl || undefined,
					image_url: trimmedImageUrl || undefined,
					large_icon: trimmedLargeIcon || undefined,
					small_icon: trimmedSmallIcon || undefined,
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
				addHistoryEntry({
					id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
					createdAt: Date.now(),
					audience,
					targetLabel,
					selectedUserUUID,
					oneSignalId: trimmedOneSignalId,
					subscriptionId: trimmedSubscriptionId,
					title: trimmedTitle,
					message: trimmedMessage,
					url: trimmedUrl,
					imageUrl: trimmedImageUrl,
					largeIconChoice,
					customLargeIcon,
					smallIconChoice,
					customSmallIcon,
					status: "failed",
					errorMessage: providerErrorMessage,
					providerMessageId: response.provider_message_id,
					recipientCount,
				});
				throw new Error(providerErrorMessage);
			}
			if (recipientCount === 0) {
				addHistoryEntry({
					id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
					createdAt: Date.now(),
					audience,
					targetLabel,
					selectedUserUUID,
					oneSignalId: trimmedOneSignalId,
					subscriptionId: trimmedSubscriptionId,
					title: trimmedTitle,
					message: trimmedMessage,
					url: trimmedUrl,
					imageUrl: trimmedImageUrl,
					largeIconChoice,
					customLargeIcon,
					smallIconChoice,
					customSmallIcon,
					status: "failed",
					errorMessage:
						"No subscribed OneSignal recipients matched this notification target.",
					providerMessageId: response.provider_message_id,
					recipientCount,
				});
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
			addHistoryEntry({
				id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
				createdAt: Date.now(),
				audience,
				targetLabel,
				selectedUserUUID,
				oneSignalId: trimmedOneSignalId,
				subscriptionId: trimmedSubscriptionId,
				title: trimmedTitle,
				message: trimmedMessage,
				url: trimmedUrl,
				imageUrl: trimmedImageUrl,
				largeIconChoice,
				customLargeIcon,
				smallIconChoice,
				customSmallIcon,
				status: "sent",
				providerMessageId: response.provider_message_id,
				recipientCount,
			});
			setTitle("");
			setMessage("");
			setUrl("");
			setImageUrl("");
			if (audience !== "onesignal") {
				setOneSignalId("");
			}
			if (audience !== "subscription") {
				setSubscriptionId("");
			}
		} catch (error) {
			setErrorMessage(
				error instanceof Error ? error.message : "Unable to send notification.",
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

			<div className="notification-workspace">
				<form
					className="management-map-card notification-composer"
					onSubmit={handleSubmit}>
					<div className="panel-header">
						<div>
							<h3>Compose notification</h3>
						</div>
						<div
							className="dashboard-segmented"
							aria-label="Notification target">
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

						<label className="field field-span-2">
							<span>Big image URL</span>
							<input
								value={imageUrl}
								onChange={(event) => setImageUrl(event.target.value)}
								placeholder="https://example.com/notification-image.png"
							/>
						</label>

						<div className="field field-span-2 notification-image-upload-field">
							<span>Upload big image</span>
							<div className="notification-upload-row">
								<label className="secondary-button notification-upload-button">
									<input
										className="challenge-upload-input"
										type="file"
										accept="image/*"
										disabled={imageUploadBusy || busy}
										onChange={(event) => void handleImageUpload(event)}
									/>
									{imageUploadBusy ? "Uploading..." : "Choose Image"}
								</label>
								{imageUploadName ? (
									<span className="notification-upload-name">
										{imageUploadName}
									</span>
								) : null}
							</div>
						</div>

						<label className="field">
							<span>Small icon</span>
							<select
								value={smallIconChoice}
								onChange={(event) =>
									setSmallIconChoice(
										event.target.value as NotificationImageChoice,
									)
								}>
								{smallIconOptions.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</label>

						<label className="field">
							<span>Large icon</span>
							<select
								value={largeIconChoice}
								onChange={(event) =>
									setLargeIconChoice(
										event.target.value as NotificationImageChoice,
									)
								}>
								{largeIconOptions.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</label>

						{smallIconChoice === "custom" ? (
							<label className="field">
								<span>Small icon resource</span>
								<input
									value={customSmallIcon}
									onChange={(event) => setCustomSmallIcon(event.target.value)}
									placeholder="ic_stat_onesignal_default"
								/>
							</label>
						) : null}

						{largeIconChoice === "custom" ? (
							<label className="field">
								<span>Large icon URL or resource</span>
								<input
									value={customLargeIcon}
									onChange={(event) => setCustomLargeIcon(event.target.value)}
									placeholder="https://example.com/icon.png"
								/>
							</label>
						) : null}
					</div>

					{statusMessage ? (
						<p className="empty-state notification-send-status">
							{statusMessage}
						</p>
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
								<code>
									{deliveryDetails.providerMessageId || "Not returned"}
								</code>
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
								<pre>
									{formatDiagnosticValue(deliveryDetails.providerRecipients)}
								</pre>
							</div>
							<div className="notification-diagnostics-wide">
								<span>Provider targeting</span>
								<pre>
									{formatDiagnosticValue(deliveryDetails.providerTargeting)}
								</pre>
							</div>
							<div className="notification-diagnostics-wide">
								<span>Provider response</span>
								<pre>
									{formatDiagnosticValue(deliveryDetails.providerResponse)}
								</pre>
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

				<aside
					className="panel notification-preview-panel"
					aria-label="Notification preview">
					<div className="panel-header">
						<div>
							<h3>Preview</h3>
						</div>
					</div>

					<div className="notification-preview-stack">
						{(["light", "dark"] as const).map((mode) => (
							<div
								className={`notification-preview-card notification-preview-card-${mode}`}
								key={mode}>
								<div className="notification-preview-header">
									<div
										className={`notification-preview-small-icon notification-preview-small-icon-${mode} notification-preview-small-icon-${smallIconChoice}`}>
										<div className="notification-preview-bolt" />
									</div>
									<div className="notification-preview-app-meta">
										<strong>Juise Rider App</strong>
										<span>now</span>
									</div>
								</div>
								<div className="notification-preview-body">
									<div className="notification-preview-copy">
										<strong>{previewTitle}</strong>
										<p>{previewMessage}</p>
										{previewUrl ? <span>{previewUrl}</span> : null}
									</div>
									<div className="notification-preview-large-icon">
										{isRemoteImageUrl(previewLargeIcon) ? (
											<img src={previewLargeIcon} alt="" />
										) : (
											<div
												className={`notification-preview-large-mark notification-preview-large-mark-${largeIconChoice}`}>
												<div className="notification-preview-bolt" />
											</div>
										)}
									</div>
								</div>
								{previewImageUrl ? (
									<div className="notification-preview-image">
										<img src={previewImageUrl} alt="" />
									</div>
								) : null}
							</div>
						))}
					</div>

					<div className="notification-preview-meta">
						<div>
							<span>Small icon</span>
							<strong>{previewSmallIconLabel}</strong>
						</div>
						<div>
							<span>Large icon</span>
							<strong>{previewLargeIconLabel}</strong>
						</div>
					</div>
				</aside>
			</div>

			<section className="panel notification-history-panel">
				<div className="panel-header">
					<div>
						<h3>Notification list</h3>
					</div>
					{history.length > 0 ? (
						<button
							className="secondary-button"
							type="button"
							onClick={handleClearHistory}>
							Clear List
						</button>
					) : null}
				</div>

				{history.length === 0 ? (
					<p className="empty-state notification-send-status">
						No dashboard notifications have been sent for this school yet.
					</p>
				) : (
					<div className="notification-history-list">
						{history.map((entry) => (
							<article className="notification-history-item" key={entry.id}>
								<div className="notification-history-main">
									<div>
										<strong>{entry.title}</strong>
										<p>{entry.message}</p>
									</div>
									<span
										className={
											entry.status === "sent"
												? "notification-history-status notification-history-status-sent"
												: "notification-history-status notification-history-status-failed"
										}>
										{entry.status}
									</span>
								</div>
								<div className="notification-history-meta">
									<span>{formatHistoryTime(entry.createdAt)}</span>
									<span>{entry.targetLabel}</span>
									{typeof entry.recipientCount === "number" ? (
										<span>
											{entry.recipientCount} recipient
											{entry.recipientCount === 1 ? "" : "s"}
										</span>
									) : null}
									{entry.imageUrl ? <span>Big image</span> : null}
									{entry.smallIconChoice !== "default" ? (
										<span>Small icon</span>
									) : null}
									{entry.largeIconChoice !== "default" ? (
										<span>Large icon</span>
									) : null}
								</div>
								{entry.errorMessage ? (
									<p className="notification-history-error">
										{entry.errorMessage}
									</p>
								) : null}
								<div className="form-actions notification-history-actions">
									<button
										className="secondary-button"
										type="button"
										onClick={() => handleCopyNotification(entry)}>
										Push Again as Copy
									</button>
								</div>
							</article>
						))}
					</div>
				)}
			</section>
		</section>
	);
}
