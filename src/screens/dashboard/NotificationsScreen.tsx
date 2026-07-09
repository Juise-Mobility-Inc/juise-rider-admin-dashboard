import {
	type ChangeEvent,
	type FocusEvent,
	type FormEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import {
	fetchSchoolDashboardNotificationHistory,
	sendSchoolCustomNotification,
	signSchoolMedia,
	type CustomNotificationAudience,
	type SchoolDashboardNotificationHistoryEntry,
	type SchoolStudentRosterEntry,
	uploadSchoolNotificationImage,
} from "../../lib/api";

type NotificationAudienceMode = Extract<
	CustomNotificationAudience,
	"school" | "student" | "onesignal" | "subscription"
>;
type StudentIdPhotoSlot = "front" | "back";
type StudentIdPhotoKeys = Partial<Record<StudentIdPhotoSlot, string>>;
type StudentRosterPhotoKeyMap = Record<string, StudentIdPhotoKeys>;
type NotificationTargetTag = {
	key: "user_uuid" | "membership_uuid" | "student_id";
	value: string;
};

type Props = {
	activeSchoolId: string;
	managedAppId: string;
	studentRoster: SchoolStudentRosterEntry[];
	schoolStudentMediaUrls: Record<string, string>;
	schoolStudentPhotoKeys: StudentRosterPhotoKeyMap;
	studentProfilePhotoUrls: Record<string, string>;
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
	targetExternalIDs: string[];
	targetTags: NotificationTargetTag[];
	targetOneSignalIDs: string[];
	targetSubscriptionIDs: string[];
	providerMessage?: string;
	providerRecipients?: unknown;
	providerResponse?: Record<string, unknown>;
	providerTargeting?: Record<string, unknown>;
};

type NotificationImageChoice = "default" | "white_bolt" | "black_bolt" | "custom";

type NotificationHistoryEntry = {
	id: string;
	createdAt: number;
	audience: CustomNotificationAudience;
	targetLabel: string;
	selectedUserUUID?: string;
	selectedUserUUIDs?: string[];
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

function normalizeNotificationUserUUID(value?: string | null): string {
	return value?.trim() ?? "";
}

function resolveNotificationIdentifierVariants(value?: string | null): string[] {
	const normalized = normalizeNotificationUserUUID(value);
	if (!normalized) {
		return [];
	}

	const variants = new Set<string>([normalized]);
	const entityPrefixMatch = normalized.match(/^[a-z]{2}-[a-z]{3}-\d+\.[a-z]+_(.+)$/i);
	if (entityPrefixMatch?.[1]) {
		variants.add(entityPrefixMatch[1]);
	}

	return Array.from(variants);
}

function resolveStudentUserUUID(entry: SchoolStudentRosterEntry): string {
	return (
		normalizeNotificationUserUUID(entry.user.k_guid) ||
		normalizeNotificationUserUUID(entry.membership.user_uuid)
	);
}

function resolveStudentUserUUIDs(entry: SchoolStudentRosterEntry | undefined) {
	if (!entry) {
		return [];
	}

	const canonicalUserUUID = resolveStudentUserUUID(entry);
	return canonicalUserUUID ? [canonicalUserUUID] : [];
}

function resolveStudentTargetTags(entry: SchoolStudentRosterEntry): NotificationTargetTag[] {
	return [
		...resolveNotificationIdentifierVariants(entry.user.k_guid).map((value) => ({
			key: "user_uuid" as const,
			value,
		})),
		...resolveNotificationIdentifierVariants(entry.membership.user_uuid).map((value) => ({
			key: "user_uuid" as const,
			value,
		})),
		...resolveNotificationIdentifierVariants(entry.membership.membership_uuid).map((value) => ({
			key: "membership_uuid" as const,
			value,
		})),
		{ key: "student_id" as const, value: entry.membership.student_id },
	].flatMap((tag) => {
		const value = tag.value?.trim() ?? "";
		return value ? [{ ...tag, value }] : [];
	});
}

function collectUniqueTargetTags(entries: SchoolStudentRosterEntry[]): NotificationTargetTag[] {
	const seen = new Set<string>();
	return entries.flatMap((entry) =>
		resolveStudentTargetTags(entry).filter((tag) => {
			const key = `${tag.key}:${tag.value}`;
			if (seen.has(key)) {
				return false;
			}
			seen.add(key);
			return true;
		}),
	);
}

function parseNotificationIdList(value: string): string[] {
	const seen = new Set<string>();
	return value
		.split(/[\s,]+/)
		.map((entry) => entry.trim())
		.filter((entry) => {
			if (!entry || seen.has(entry)) {
				return false;
			}
			seen.add(entry);
			return true;
		});
}

function resolveStudentPhotoUserUUIDs(entry: SchoolStudentRosterEntry | undefined) {
	if (!entry) {
		return [];
	}

	return Array.from(
		new Set(
			[entry.user.k_guid, entry.membership.user_uuid]
				.map((value) => value?.trim())
				.filter((value): value is string => Boolean(value)),
		),
	);
}

function resolveStudentPhotoUrl(
	entry: SchoolStudentRosterEntry,
	studentProfilePhotoUrls: Record<string, string>,
	schoolStudentPhotoKeys: StudentRosterPhotoKeyMap,
	schoolStudentMediaUrls: Record<string, string>,
) {
	const userUUIDs = resolveStudentPhotoUserUUIDs(entry);
	for (const userUUID of userUUIDs) {
		const photoUrl = studentProfilePhotoUrls[userUUID]?.trim();
		if (photoUrl) {
			return photoUrl;
		}
	}

	const membershipUUID = entry.membership.membership_uuid;
	const frontPhotoObjectKey =
		entry.membership.front_photo?.object_key?.trim() ||
		entry.membership.photo?.object_key?.trim() ||
		schoolStudentPhotoKeys[membershipUUID]?.front?.trim() ||
		"";
	if (frontPhotoObjectKey) {
		const frontPhotoUrl = schoolStudentMediaUrls[frontPhotoObjectKey]?.trim();
		if (frontPhotoUrl) {
			return frontPhotoUrl;
		}
	}

	const backPhotoObjectKey =
		entry.membership.back_photo?.object_key?.trim() ||
		schoolStudentPhotoKeys[membershipUUID]?.back?.trim() ||
		"";
	if (backPhotoObjectKey) {
		const backPhotoUrl = schoolStudentMediaUrls[backPhotoObjectKey]?.trim();
		if (backPhotoUrl) {
			return backPhotoUrl;
		}
	}

	return "";
}

function resolveStudentInitials(
	entry: SchoolStudentRosterEntry,
	formatNebulaUserName: Props["formatNebulaUserName"],
) {
	const name = formatNebulaUserName(entry.user);
	const source =
		name || entry.membership.student_id || entry.user.email || entry.user.username || "?";
	const parts = source.trim().split(/\s+/).filter(Boolean);
	if (parts.length >= 2) {
		return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
	}

	return source.slice(0, 2).toUpperCase();
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

function buildNotificationHistoryKey(managedAppId: string, activeSchoolId: string) {
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
		return Array.isArray(parsed) ? parsed.slice(0, notificationHistoryLimit) : [];
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

function normalizeHistoryTimestamp(value: number) {
	if (!Number.isFinite(value) || value <= 0) {
		return Date.now();
	}
	return value < 10_000_000_000 ? value * 1000 : value;
}

function resolveHistoryIconChoice(value: string): NotificationImageChoice {
	const normalized = value.trim();
	if (!normalized) {
		return "default";
	}
	const largeMatch = largeIconOptions.find((option) => option.providerValue === normalized);
	const smallMatch = smallIconOptions.find((option) => option.providerValue === normalized);
	return largeMatch?.value ?? smallMatch?.value ?? "custom";
}

function mapRemoteNotificationHistoryEntry(
	entry: SchoolDashboardNotificationHistoryEntry,
): NotificationHistoryEntry {
	const largeIconChoice = resolveHistoryIconChoice(entry.large_icon ?? "");
	const smallIconChoice = resolveHistoryIconChoice(entry.small_icon ?? "");
	return {
		id: entry.notification_uuid,
		createdAt: normalizeHistoryTimestamp(entry.created_at),
		audience: entry.audience as CustomNotificationAudience,
		targetLabel: entry.target_label || entry.audience || "Notification",
		selectedUserUUIDs: entry.target_user_uuids ?? [],
		oneSignalId: (entry.target_onesignal_ids ?? []).join("\n"),
		subscriptionId: (entry.target_subscription_ids ?? []).join("\n"),
		title: entry.title,
		message: entry.message,
		url: entry.url ?? "",
		imageUrl: entry.image_url ?? "",
		largeIconChoice,
		customLargeIcon: largeIconChoice === "custom" ? entry.large_icon ?? "" : "",
		smallIconChoice,
		customSmallIcon: smallIconChoice === "custom" ? entry.small_icon ?? "" : "",
		status: entry.status === "failed" ? "failed" : "sent",
		errorMessage: entry.error_message,
		providerMessageId: entry.provider_message_id,
		recipientCount:
			typeof entry.recipient_count === "number" ? entry.recipient_count : null,
	};
}

function isRemoteImageUrl(value: string) {
	return /^https?:\/\//i.test(value.trim());
}

function NotificationStudentAvatar({ photoUrl, initials }: { photoUrl: string; initials: string }) {
	const [failedPhotoUrl, setFailedPhotoUrl] = useState("");
	const normalizedPhotoUrl = photoUrl.trim();
	const showPhoto = normalizedPhotoUrl !== "" && failedPhotoUrl !== normalizedPhotoUrl;

	return (
		<span className="notification-student-avatar">
			{showPhoto ? (
				<img
					src={normalizedPhotoUrl}
					alt=""
					onError={() => setFailedPhotoUrl(normalizedPhotoUrl)}
				/>
			) : (
				initials || "?"
			)}
		</span>
	);
}

export function NotificationsScreen({
	activeSchoolId,
	managedAppId,
	studentRoster,
	schoolStudentMediaUrls,
	schoolStudentPhotoKeys,
	studentProfilePhotoUrls,
	formatNebulaUserName,
}: Props) {
	const [audience, setAudience] = useState<NotificationAudienceMode>("school");
	const [selectedUserUUIDs, setSelectedUserUUIDs] = useState<string[]>([]);
	const [oneSignalIdsText, setOneSignalIdsText] = useState("");
	const [subscriptionIdsText, setSubscriptionIdsText] = useState("");
	const [studentSearch, setStudentSearch] = useState("");
	const [studentPickerOpen, setStudentPickerOpen] = useState(false);
	const studentPickerRef = useRef<HTMLDivElement | null>(null);
	const [title, setTitle] = useState("");
	const [message, setMessage] = useState("");
	const [url, setUrl] = useState("");
	const [imageUrl, setImageUrl] = useState("");
	const [imageUploadBusy, setImageUploadBusy] = useState(false);
	const [imageUploadName, setImageUploadName] = useState("");
	const [largeIconChoice, setLargeIconChoice] = useState<NotificationImageChoice>("default");
	const [customLargeIcon, setCustomLargeIcon] = useState("");
	const [smallIconChoice, setSmallIconChoice] = useState<NotificationImageChoice>("default");
	const [customSmallIcon, setCustomSmallIcon] = useState("");
	const [busy, setBusy] = useState(false);
	const [statusMessage, setStatusMessage] = useState("");
	const [errorMessage, setErrorMessage] = useState("");
	const [deliveryDetails, setDeliveryDetails] = useState<NotificationDeliveryDetails | null>(
		null,
	);
	const [locallySignedStudentMediaUrls, setLocallySignedStudentMediaUrls] = useState<
		Record<string, string>
	>({});
	const [history, setHistory] = useState<NotificationHistoryEntry[]>(() =>
		loadNotificationHistory(managedAppId, activeSchoolId),
	);
	const [historyBusy, setHistoryBusy] = useState(false);
	const [historyError, setHistoryError] = useState("");

	const refreshNotificationHistory = useCallback(async () => {
		if (!activeSchoolId || !managedAppId) {
			setHistory([]);
			return;
		}
		setHistoryBusy(true);
		setHistoryError("");
		try {
			const remoteHistory = await fetchSchoolDashboardNotificationHistory(
				managedAppId,
				activeSchoolId,
				notificationHistoryLimit,
			);
			const mappedHistory = remoteHistory.map(mapRemoteNotificationHistoryEntry);
			setHistory(mappedHistory);
			saveNotificationHistory(managedAppId, activeSchoolId, mappedHistory);
		} catch (error) {
			setHistory(loadNotificationHistory(managedAppId, activeSchoolId));
			setHistoryError(
				error instanceof Error
					? error.message
					: "Unable to load notification history.",
			);
		} finally {
			setHistoryBusy(false);
		}
	}, [activeSchoolId, managedAppId]);

	useEffect(() => {
		void refreshNotificationHistory();
	}, [refreshNotificationHistory]);

	useEffect(() => {
		setLocallySignedStudentMediaUrls({});
	}, [activeSchoolId]);

	const studentOptions = useMemo(
		() =>
			[...studentRoster]
				.filter((entry) => resolveStudentUserUUID(entry))
				.sort((left, right) =>
					formatNebulaUserName(left.user).localeCompare(formatNebulaUserName(right.user)),
				),
		[formatNebulaUserName, studentRoster],
	);
	const resolvedStudentMediaUrls = useMemo(
		() => ({
			...schoolStudentMediaUrls,
			...locallySignedStudentMediaUrls,
		}),
		[locallySignedStudentMediaUrls, schoolStudentMediaUrls],
	);

	useEffect(() => {
		if (!activeSchoolId || studentOptions.length === 0) {
			return;
		}

		const missingObjectKeys = Array.from(
			new Set(
				studentOptions
					.flatMap((entry) => [
						entry.membership.front_photo?.object_key?.trim() ?? "",
						entry.membership.photo?.object_key?.trim() ?? "",
						entry.membership.back_photo?.object_key?.trim() ?? "",
					])
					.filter(
						(objectKey) =>
							objectKey &&
							!resolvedStudentMediaUrls[objectKey] &&
							!locallySignedStudentMediaUrls[objectKey],
					),
			),
		);

		if (missingObjectKeys.length === 0) {
			return;
		}

		let cancelled = false;
		async function signMissingStudentMedia() {
			const signedUrls = await signSchoolMedia(activeSchoolId, missingObjectKeys).catch(
				() => ({}) as Record<string, string>,
			);

			if (cancelled) {
				return;
			}

			if (Object.keys(signedUrls).length === 0) {
				return;
			}

			setLocallySignedStudentMediaUrls((current) => ({
				...current,
				...signedUrls,
			}));
		}

		void signMissingStudentMedia();

		return () => {
			cancelled = true;
		};
	}, [activeSchoolId, locallySignedStudentMediaUrls, resolvedStudentMediaUrls, studentOptions]);

	const selectedUserUUIDSet = useMemo(() => new Set(selectedUserUUIDs), [selectedUserUUIDs]);
	useEffect(() => {
		const availableUserUUIDs = new Set(
			studentOptions.map((entry) => resolveStudentUserUUID(entry)),
		);
		setSelectedUserUUIDs((current) =>
			current.filter((userUUID) => availableUserUUIDs.has(userUUID)),
		);
	}, [studentOptions]);
	const selectedStudents = useMemo(
		() =>
			studentOptions.filter((entry) =>
				selectedUserUUIDSet.has(resolveStudentUserUUID(entry)),
			),
		[studentOptions, selectedUserUUIDSet],
	);
	const normalizedStudentSearch = studentSearch.trim().toLowerCase();
	const filteredStudentOptions = useMemo(() => {
		if (!normalizedStudentSearch) {
			return studentOptions;
		}

		return studentOptions.filter((entry) => {
			const searchableText = [
				formatNebulaUserName(entry.user),
				entry.membership.student_id,
				entry.user.email,
				entry.user.username,
				entry.user.k_guid,
				entry.membership.user_uuid,
			]
				.filter(Boolean)
				.join(" ")
				.toLowerCase();
			return searchableText.includes(normalizedStudentSearch);
		});
	}, [formatNebulaUserName, normalizedStudentSearch, studentOptions]);
	const selectedStudentLabel =
		selectedStudents.length === 0
			? ""
			: selectedStudents.length === 1
				? formatNebulaUserName(selectedStudents[0].user) ||
					selectedStudents[0].membership.student_id ||
					selectedStudents[0].user.k_guid
				: `${selectedStudents.length} selected students`;
	const parsedOneSignalIds = parseNotificationIdList(oneSignalIdsText);
	const parsedSubscriptionIds = parseNotificationIdList(subscriptionIdsText);
	const targetPreviewLabel =
		audience === "school"
			? "Campus Wide"
			: audience === "onesignal"
				? `${parsedOneSignalIds.length || "No"} OneSignal ID${parsedOneSignalIds.length === 1 ? "" : "s"}`
				: audience === "subscription"
					? `${parsedSubscriptionIds.length || "No"} Subscriber ID${parsedSubscriptionIds.length === 1 ? "" : "s"}`
					: selectedStudents.length > 0
						? selectedStudentLabel
						: "No students selected";
	const resolvedLargeIcon =
		largeIconChoice === "custom"
			? customLargeIcon.trim()
			: largeIconOptions.find((option) => option.value === largeIconChoice)?.providerValue ||
				"";
	const resolvedSmallIcon =
		smallIconChoice === "custom"
			? customSmallIcon.trim()
			: smallIconOptions.find((option) => option.value === smallIconChoice)?.providerValue ||
				"";
	const previewTitle = title.trim() || "Parking update";
	const previewMessage = message.trim() || "Add the message students should receive.";
	const previewUrl = url.trim();
	const previewImageUrl = imageUrl.trim();
	const previewLargeIcon = resolvedLargeIcon.trim();
	const previewSmallIconLabel =
		smallIconChoice === "custom"
			? customSmallIcon.trim() || "Custom"
			: smallIconOptions.find((option) => option.value === smallIconChoice)?.label ||
				"Default";
	const previewLargeIconLabel =
		largeIconChoice === "custom"
			? customLargeIcon.trim() || "Custom"
			: largeIconOptions.find((option) => option.value === largeIconChoice)?.label ||
				"Default";

	const addHistoryEntry = (entry: NotificationHistoryEntry) => {
		setHistory((current) => {
			const next = [
				entry,
				...current.filter((historyEntry) => historyEntry.id !== entry.id),
			].slice(0, notificationHistoryLimit);
			saveNotificationHistory(managedAppId, activeSchoolId, next);
			return next;
		});
	};

	const handleToggleStudent = (userUUID: string) => {
		setSelectedUserUUIDs((current) =>
			current.includes(userUUID)
				? current.filter((value) => value !== userUUID)
				: [...current, userUUID],
		);
	};

	const handleClearSelectedStudents = () => {
		setSelectedUserUUIDs([]);
	};

	const handleStudentPickerBlur = (event: FocusEvent<HTMLDivElement>) => {
		const nextFocusedElement = event.relatedTarget;
		if (
			nextFocusedElement instanceof Node &&
			studentPickerRef.current?.contains(nextFocusedElement)
		) {
			return;
		}

		setStudentPickerOpen(false);
	};

	const handleCopyNotification = (entry: NotificationHistoryEntry) => {
		setAudience(
			entry.audience === "onesignal"
				? "onesignal"
				: entry.audience === "subscription"
					? "subscription"
					: entry.audience === "student"
						? "student"
						: "school",
		);
		setSelectedUserUUIDs(
			entry.selectedUserUUIDs ?? (entry.selectedUserUUID ? [entry.selectedUserUUID] : []),
		);
		setOneSignalIdsText(entry.oneSignalId);
		setSubscriptionIdsText(entry.subscriptionId);
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
				error instanceof Error ? error.message : "Unable to upload notification image.",
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
		if (!activeSchoolId || !managedAppId) {
			setErrorMessage("A school-scoped admin session is required.");
			return;
		}
		if (!trimmedTitle || !trimmedMessage) {
			setErrorMessage("Title and message are required.");
			return;
		}
		if (audience === "student" && selectedUserUUIDs.length === 0) {
			setErrorMessage("Choose at least one student before sending.");
			return;
		}
		if (audience === "onesignal" && parsedOneSignalIds.length === 0) {
			setErrorMessage("Add at least one OneSignal ID before sending.");
			return;
		}
		if (audience === "subscription" && parsedSubscriptionIds.length === 0) {
			setErrorMessage("Add at least one subscriber ID before sending.");
			return;
		}

		setBusy(true);
		let targetLabel = "Campus Wide";
		let targetUserUUIDs: string[] = [];
		const targetExternalIDs: string[] = [];
		let targetOneSignalIDs: string[] = [];
		let targetSubscriptionIDs: string[] = [];
		let targetTags: NotificationTargetTag[] = [];
		let deliveryAudience: CustomNotificationAudience = audience;
		try {
			targetUserUUIDs =
				audience === "student"
					? Array.from(
							new Set(
								selectedStudents.flatMap((entry) => resolveStudentUserUUIDs(entry)),
							),
						)
					: [];
			if (audience === "student" && targetUserUUIDs.length === 0) {
				setErrorMessage("Choose at least one student before sending.");
				return;
			}
			if (audience === "onesignal") {
				targetOneSignalIDs = parsedOneSignalIds;
				if (targetOneSignalIDs.length === 0) {
					setErrorMessage("Add at least one OneSignal ID before sending.");
					return;
				}
			}
			if (audience === "subscription") {
				targetSubscriptionIDs = parsedSubscriptionIds;
				if (targetSubscriptionIDs.length === 0) {
					setErrorMessage("Add at least one subscriber ID before sending.");
					return;
				}
			}
			targetLabel =
				audience === "onesignal"
					? `${targetOneSignalIDs.length} OneSignal ID${targetOneSignalIDs.length === 1 ? "" : "s"}`
					: audience === "subscription"
						? `${targetSubscriptionIDs.length} Subscriber ID${targetSubscriptionIDs.length === 1 ? "" : "s"}`
						: audience === "student"
							? selectedStudentLabel || "selected student"
							: "Campus Wide";
			if (audience === "student") {
				deliveryAudience = "student_tags";
				targetTags = collectUniqueTargetTags(selectedStudents);
				if (targetTags.length === 0) {
					setErrorMessage("Could not resolve a push target for that student.");
					return;
				}
			}

			const response = await sendSchoolCustomNotification(managedAppId, activeSchoolId, {
				audience: deliveryAudience,
				target_label: targetLabel,
				title: trimmedTitle,
				message: trimmedMessage,
				url: trimmedUrl || undefined,
				image_url: trimmedImageUrl || undefined,
				large_icon: trimmedLargeIcon || undefined,
				small_icon: trimmedSmallIcon || undefined,
				user_uuids: audience === "student" ? targetUserUUIDs : undefined,
				target_tags: deliveryAudience === "student_tags" ? targetTags : undefined,
				onesignal_ids: deliveryAudience === "onesignal" ? targetOneSignalIDs : undefined,
				subscription_ids:
					deliveryAudience === "subscription" ? targetSubscriptionIDs : undefined,
				data: {
					dashboard_section: "notifications",
				},
			});

			const providerId = response.provider_message_id
				? ` Provider id: ${response.provider_message_id}.`
				: "";
			const recipientCount =
				resolveRecipientCount(response.provider_recipients) ??
				resolveRecipientCount(response.provider_response);
			setDeliveryDetails({
				audience: deliveryAudience,
				provider: response.provider,
				providerMessageId: response.provider_message_id,
				recipientCount,
				targetUserUUIDs,
				targetExternalIDs,
				targetTags,
				targetOneSignalIDs,
				targetSubscriptionIDs,
				providerMessage: response.message,
				providerRecipients: response.provider_recipients,
				providerResponse: response.provider_response,
				providerTargeting: response.provider_targeting,
			});
			const providerErrorMessage = resolveProviderErrorMessage(response.provider_response);
			if (providerErrorMessage) {
				addHistoryEntry({
					id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
					createdAt: Date.now(),
					audience,
					targetLabel,
					selectedUserUUIDs,
					oneSignalId: targetOneSignalIDs.join("\n"),
					subscriptionId: targetSubscriptionIDs.join("\n"),
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
				void refreshNotificationHistory();
				throw new Error(providerErrorMessage);
			}
			if (recipientCount === 0) {
				addHistoryEntry({
					id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
					createdAt: Date.now(),
					audience,
					targetLabel,
					selectedUserUUIDs,
					oneSignalId: targetOneSignalIDs.join("\n"),
					subscriptionId: targetSubscriptionIDs.join("\n"),
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
				void refreshNotificationHistory();
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
				selectedUserUUIDs,
				oneSignalId: targetOneSignalIDs.join("\n"),
				subscriptionId: targetSubscriptionIDs.join("\n"),
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
			void refreshNotificationHistory();
			setTitle("");
			setMessage("");
			setUrl("");
			setImageUrl("");
			if (audience === "onesignal") {
				setOneSignalIdsText("");
			}
			if (audience === "subscription") {
				setSubscriptionIdsText("");
			}
		} catch (error) {
			setErrorMessage(
				error instanceof Error ? error.message : "Unable to send notification.",
			);
			void refreshNotificationHistory();
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
			</section>

			<div className="notification-workspace">
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
								Campus Wide
							</button>
							<button
								className={
									audience === "student"
										? "dashboard-segment dashboard-segment-active"
										: "dashboard-segment"
								}
								type="button"
								onClick={() => setAudience("student")}>
								Students
							</button>
						</div>
					</div>

					<div className="notification-audience-desc">
						{audience === "school" ? (
							<>
								<span className="notification-audience-desc-icon">📢</span>
								<span>
									<strong>Campus Wide</strong> — these notifications will be
									delivered to all students enrolled at this school.
								</span>
							</>
						) : (
							<>
								<span className="notification-audience-desc-icon">🎯</span>
								<span>
									<strong>Students</strong> — these notifications will only be
									delivered to the specific students you select below.
								</span>
							</>
						)}
					</div>

					<div className="form-grid">
						{audience === "student" ? (
							<div
								className="field field-span-2 notification-student-picker"
								ref={studentPickerRef}
								onBlur={handleStudentPickerBlur}
								onFocus={() => setStudentPickerOpen(true)}>
								<div className="notification-picker-header">
									<div>
										<span>Students</span>
										<strong>{selectedStudents.length} selected</strong>
									</div>
									{selectedStudents.length > 0 ? (
										<button
											className="secondary-button"
											type="button"
											onClick={handleClearSelectedStudents}>
											Clear
										</button>
									) : null}
								</div>
								<input
									value={studentSearch}
									onChange={(event) => setStudentSearch(event.target.value)}
									onClick={() => setStudentPickerOpen(true)}
									placeholder="Search name or student ID"
								/>
								{selectedStudents.length > 0 ? (
									<div className="notification-selected-students">
										{selectedStudents.map((entry) => {
											const userUUID = resolveStudentUserUUID(entry);
											const name =
												formatNebulaUserName(entry.user) ||
												entry.user.email ||
												entry.membership.student_id ||
												"Student";
											return (
												<button
													className="notification-selected-chip"
													key={userUUID}
													type="button"
													onClick={() => handleToggleStudent(userUUID)}>
													{name}
													<span aria-hidden="true">x</span>
												</button>
											);
										})}
									</div>
								) : null}
								{studentPickerOpen ? (
									<div className="notification-student-results">
										{filteredStudentOptions.length === 0 ? (
											<p className="empty-state notification-send-status">
												No students match that search.
											</p>
										) : (
											filteredStudentOptions.map((entry) => {
												const userUUID = resolveStudentUserUUID(entry);
												const name =
													formatNebulaUserName(entry.user) ||
													entry.user.email ||
													entry.user.username ||
													"Unnamed student";
												const studentId =
													entry.membership.student_id.trim();
												const photoUrl = resolveStudentPhotoUrl(
													entry,
													studentProfilePhotoUrls,
													schoolStudentPhotoKeys,
													resolvedStudentMediaUrls,
												);
												const isSelected =
													selectedUserUUIDSet.has(userUUID);
												return (
													<button
														className={
															isSelected
																? "notification-student-option notification-student-option-selected"
																: "notification-student-option"
														}
														key={userUUID}
														type="button"
														onClick={() =>
															handleToggleStudent(userUUID)
														}>
														<NotificationStudentAvatar
															photoUrl={photoUrl}
															initials={resolveStudentInitials(
																entry,
																formatNebulaUserName,
															)}
														/>
														<span className="notification-student-copy">
															<strong>{name}</strong>
															<span>
																{studentId
																	? `ID ${studentId}`
																	: "No student ID"}
															</span>
														</span>
														<span className="notification-student-check">
															{isSelected ? "Selected" : "Add"}
														</span>
													</button>
												);
											})
										)}
									</div>
								) : null}
							</div>
						) : null}

						{audience === "onesignal" ? (
							<label className="field field-span-2">
								<span>OneSignal IDs</span>
								<textarea
									value={oneSignalIdsText}
									onChange={(event) => setOneSignalIdsText(event.target.value)}
									placeholder="Paste one or more OneSignal IDs. Separate multiple IDs with commas, spaces, or new lines."
									required
								/>
							</label>
						) : null}

						{audience === "subscription" ? (
							<label className="field field-span-2">
								<span>Subscriber IDs</span>
								<textarea
									value={subscriptionIdsText}
									onChange={(event) => setSubscriptionIdsText(event.target.value)}
									placeholder="Paste one or more subscriber IDs. Separate multiple IDs with commas, spaces, or new lines."
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
								<span>External IDs</span>
								<code>
									{deliveryDetails.targetExternalIDs.length
										? deliveryDetails.targetExternalIDs.join(", ")
										: "None"}
								</code>
							</div>
							<div className="notification-diagnostics-wide">
								<span>Target tags</span>
								<pre>
									{deliveryDetails.targetTags.length
										? formatDiagnosticValue(deliveryDetails.targetTags)
										: "None"}
								</pre>
							</div>
							<div className="notification-diagnostics-wide">
								<span>OneSignal IDs</span>
								<pre>
									{deliveryDetails.targetOneSignalIDs.length
										? deliveryDetails.targetOneSignalIDs.join("\n")
										: "None"}
								</pre>
							</div>
							<div className="notification-diagnostics-wide">
								<span>Subscriber IDs</span>
								<pre>
									{deliveryDetails.targetSubscriptionIDs.length
										? deliveryDetails.targetSubscriptionIDs.join("\n")
										: "None"}
								</pre>
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
								(audience === "student" && selectedUserUUIDs.length === 0) ||
								(audience === "onesignal" && parsedOneSignalIds.length === 0) ||
								(audience === "subscription" && parsedSubscriptionIds.length === 0)
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
							<span>Audience</span>
							<strong>{targetPreviewLabel}</strong>
						</div>
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
						<h3>Notification history</h3>
						<p>Manual dashboard notifications sent to students and campus-wide audiences.</p>
					</div>
					<button
						className="secondary-button"
						type="button"
						onClick={() => void refreshNotificationHistory()}
						disabled={historyBusy}>
						{historyBusy ? "Refreshing..." : "Refresh"}
					</button>
				</div>

				{historyError ? (
					<p className="notification-history-error">
						Showing cached notification history. {historyError}
					</p>
				) : null}
				{history.length === 0 ? (
					<p className="empty-state notification-send-status">
						{historyBusy
							? "Loading notification history..."
							: "No dashboard notifications have been sent for this school yet."}
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
									{entry.providerMessageId ? (
										<span>Provider {entry.providerMessageId}</span>
									) : null}
								</div>
								{entry.errorMessage ? (
									<p className="notification-history-error">
										{entry.errorMessage}
									</p>
								) : null}
								<details className="notification-history-details">
									<summary>View notification</summary>
									<div className="notification-history-detail-grid">
										<div>
											<span>Title</span>
											<strong>{entry.title}</strong>
										</div>
										<div>
											<span>Audience</span>
											<strong>{entry.targetLabel}</strong>
										</div>
										<div className="notification-history-detail-wide">
											<span>Message</span>
											<p>{entry.message}</p>
										</div>
										{entry.url ? (
											<div className="notification-history-detail-wide">
												<span>URL</span>
												<p>{entry.url}</p>
											</div>
										) : null}
										{entry.imageUrl ? (
											<div className="notification-history-detail-wide">
												<span>Image</span>
												<p>{entry.imageUrl}</p>
											</div>
										) : null}
									</div>
								</details>
								<div className="form-actions notification-history-actions">
									<button
										className="secondary-button"
										type="button"
										onClick={() => handleCopyNotification(entry)}>
										Reuse / resend
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
