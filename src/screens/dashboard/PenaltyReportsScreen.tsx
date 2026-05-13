import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
        fetchSchoolParkingViolationMedia,
        fetchParkingViolationFeeRules,
        fetchSchoolParkingViolationHistory,
        fetchSchoolParkingViolations,
        fetchStudentProfile,
        fetchUserMediaAssets,
        signSchoolMedia,
        type RegisteredDevice,
        type SchoolStudentRosterEntry,
        type StudentParkingViolation,
        type StudentParkingViolationHistoryEvent,
        type ParkingViolationFeeRule,
        updateSchoolParkingViolation,
        uploadSchoolParkingViolationMedia,
        type UploadedEntityMedia,
        type UserMediaAsset,
} from "../../lib/api";

type Props = {
        activeSchoolId: string;
        managedAppId: string;
        studentRoster: SchoolStudentRosterEntry[];
        studentProfilePhotoUrls: Record<string, string>;
        onOpenStudent: (membershipUUID: string) => void;
        onOpenStudentDevice: (membershipUUID: string, deviceUUID: string) => void;
};

const openStatusTokens = [
        "reported",
        "awaiting_payment",
        "appealed",
        "under_review",
];

const statusOptions = [
        "reported",
        "under_review",
        "awaiting_payment",
        "appealed",
        "dismissed",
        "paid",
        "resolved",
        "closed",
];

const fallbackViolationTypes = [
        "no_permit",
        "wrong_spot",
        "expired_reservation",
        "blocking_access",
        "unauthorized_parking",
        "other",
];

const customViolationTypeValue = "__custom_violation_type__";

function getErrorMessage(error: unknown): string {
        return error instanceof Error ? error.message : "Something went wrong.";
}

function formatStatus(status: string): string {
        const normalized = status.trim() || "reported";
        return normalized
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

function formatCurrencyFromCents(value?: number | null): string {
        if (!value || value <= 0) {
                return "Not set";
        }

        return new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: "USD",
        }).format(value / 100);
}

function formatCentsForInput(value?: number | null): string {
        if (!value || value <= 0) {
                return "";
        }

        return (value / 100).toFixed(2);
}

function parseCurrencyCents(value: string): number | null {
        const normalized = value.replace(/[$,\s]/g, "");
        if (!normalized) {
                return null;
        }

        const amount = Number(normalized);
        if (!Number.isFinite(amount) || amount <= 0) {
                return null;
        }

        return Math.round(amount * 100);
}

function formatStudentName(entry?: SchoolStudentRosterEntry | null): string {
        if (!entry) {
                return "Student";
        }

        const fullName = `${entry.user.first_name?.trim() ?? ""} ${
                entry.user.last_name?.trim() ?? ""
        }`.trim();
        return fullName || entry.user.username || entry.user.email || "Student";
}

function getStudentInitials(entry?: SchoolStudentRosterEntry | null): string {
        return formatStudentName(entry)
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((word) => word[0])
                .join("")
                .toUpperCase();
}

function formatDeviceName(device?: RegisteredDevice | null): string {
        if (!device) {
                return "Registered device";
        }

        return (
                device.nickname?.trim() ||
                [device.make, device.model].filter(Boolean).join(" ").trim() ||
                device.device_type?.trim() ||
                "Registered device"
        );
}

function formatDeviceMeta(device?: RegisteredDevice | null): string {
        if (!device) {
                return "Device details unavailable";
        }

        return (
                [
                        device.device_type?.trim(),
                        device.powertrain_type?.trim(),
                        device.color?.trim(),
                        device.serial_number?.trim(),
                ]
                        .filter(Boolean)
                        .join(" · ") || "Device details unavailable"
        );
}

function normalizeRuleToken(value?: string | null): string {
        return value?.trim().toLowerCase() ?? "";
}

function normalizeViolationType(value?: string | null): string {
        return (value ?? "")
                .trim()
                .toLowerCase()
                .replace(/[\s-]+/g, "_")
                .replace(/[^a-z0-9_]/g, "")
                .replace(/_+/g, "_")
                .replace(/^_+|_+$/g, "");
}

function normalizeStatusValue(value: string): string {
        return value
                .trim()
                .toLowerCase()
                .replace(/[\s-]+/g, "_");
}

function matchParkingViolationFeeRule(
        rules: ParkingViolationFeeRule[],
        report: StudentParkingViolation | null,
        device: RegisteredDevice | null,
        campusId: string,
        violationType: string,
): ParkingViolationFeeRule | null {
        const normalizedViolationType = normalizeViolationType(violationType);
        if (!report || !normalizedViolationType) {
                return null;
        }
        const normalizedCampus = normalizeRuleToken(campusId);
        const normalizedDeviceType = normalizeRuleToken(device?.device_type);
        const normalizedPowertrain = normalizeRuleToken(device?.powertrain_type);

        return (
                [...rules]
                        .filter(
                                (rule) =>
                                        rule.active &&
                                        normalizeViolationType(rule.violation_type) ===
                                                normalizedViolationType &&
                                        (!rule.campus_id ||
                                                normalizeRuleToken(rule.campus_id) === normalizedCampus) &&
                                        (!rule.device_type ||
                                                normalizeRuleToken(rule.device_type) === normalizedDeviceType) &&
                                        (!rule.powertrain_type ||
                                                normalizeRuleToken(rule.powertrain_type) === normalizedPowertrain),
                        )
                        .sort((left, right) => {
                                const leftScore =
                                        (left.campus_id ? 4 : 0) +
                                        (left.device_type ? 2 : 0) +
                                        (left.powertrain_type ? 1 : 0);
                                const rightScore =
                                        (right.campus_id ? 4 : 0) +
                                        (right.device_type ? 2 : 0) +
                                        (right.powertrain_type ? 1 : 0);
                                if (leftScore !== rightScore) {
                                        return rightScore - leftScore;
                                }
                                return right.updated_at - left.updated_at;
                        })[0] ?? null
        );
}

function resolveMediaObjectKey(asset?: Pick<UserMediaAsset, "object_key">) {
        return asset?.object_key?.trim() ?? "";
}

function resolveDevicePhotoObjectKey(assets: UserMediaAsset[]): string {
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
                        })[0]
                        ?.object_key?.trim() ?? ""
        );
}

function buildViolationTypeOptions(
        feeRules: ParkingViolationFeeRule[],
        currentType?: string | null,
) {
        const options: string[] = [];
        const pushOption = (value?: string | null) => {
                const normalized = normalizeViolationType(value);
                if (
                        normalized &&
                        !options.some((option) => normalizeViolationType(option) === normalized)
                ) {
                        options.push(normalized);
                }
        };

        pushOption(currentType);
        feeRules
                .filter((rule) => rule.active)
                .forEach((rule) => pushOption(rule.violation_type));
        fallbackViolationTypes.forEach(pushOption);

        return options.sort((left, right) => left.localeCompare(right));
}

function isOpenReport(report: StudentParkingViolation): boolean {
        if (!report.active) {
                return false;
        }
        const status = report.status.trim().toLowerCase();
        if (!status) {
                return true;
        }
        if (openStatusTokens.includes(status)) {
                return true;
        }
        return !["dismissed", "paid", "resolved", "closed"].some((token) =>
                status.includes(token),
        );
}

function isResolvedReport(report: StudentParkingViolation): boolean {
        return !isOpenReport(report);
}

function formatHistoryEvent(
        event: StudentParkingViolationHistoryEvent,
): string {
        const status = event.status ? ` · ${formatStatus(event.status)}` : "";
        switch (event.event_type) {
                case "status_created":
                        return `Report created${status}`;
                case "status_updated":
                        return `Status updated${status}`;
                case "appeal_submitted":
                        return "Student appeal submitted";
                case "payment_requested":
                        return "Payment requested";
                case "payment_completed":
                        return "Payment completed";
                case "payment_collected":
                        return "Payment collected";
                case "photo_added":
                        return "Photo added";
                case "note_updated":
                        return "Admin notes updated";
                default:
                        return event.event_type
                                .split(/[_\-\s]+/)
                                .filter(Boolean)
                                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                                .join(" ");
        }
}

export function PenaltyReportsScreen({
        activeSchoolId,
        managedAppId,
        onOpenStudentDevice,
        onOpenStudent,
        studentProfilePhotoUrls,
        studentRoster,
}: Props) {
        const [searchParams] = useSearchParams();
        const dlReport = useRef(searchParams.get("report"));
        const dlConsumed = useRef(false);

        const [reports, setReports] = useState<StudentParkingViolation[]>([]);
        const [selectedReportId, setSelectedReportId] = useState("");
        const [media, setMedia] = useState<UploadedEntityMedia["media"][]>([]);
        const [history, setHistory] = useState<StudentParkingViolationHistoryEvent[]>(
                [],
        );
        const [listMode, setListMode] = useState<"open" | "history">("open");
        const [detailTab, setDetailTab] = useState<"details" | "photos" | "history">(
                "details",
        );
        const [statusDraft, setStatusDraft] = useState("reported");
        const [notesDraft, setNotesDraft] = useState("");
        const [violationTypeDraft, setViolationTypeDraft] = useState("");
        const [paymentAmountDraft, setPaymentAmountDraft] = useState("");
        const [feeRules, setFeeRules] = useState<ParkingViolationFeeRule[]>([]);
        const [feeRulesBusy, setFeeRulesBusy] = useState(false);
        const [loadBusy, setLoadBusy] = useState(false);
        const [saveBusy, setSaveBusy] = useState(false);
        const [uploadBusy, setUploadBusy] = useState(false);
        const [deviceBusy, setDeviceBusy] = useState(false);
        const [selectedDevice, setSelectedDevice] = useState<RegisteredDevice | null>(
                null,
        );
        const [selectedDevicePhotoUrl, setSelectedDevicePhotoUrl] = useState("");
        const [error, setError] = useState("");
        const [success, setSuccess] = useState("");

        const openReports = useMemo(() => reports.filter(isOpenReport), [reports]);
        const resolvedReports = useMemo(
                () => reports.filter(isResolvedReport),
                [reports],
        );
        const visibleReports = listMode === "open" ? openReports : resolvedReports;
        const selectedReport = useMemo(
                () =>
                        visibleReports.find(
                                (report) => report.violation_uuid === selectedReportId,
                        ) ??
                        visibleReports[0] ??
                        null,
                [selectedReportId, visibleReports],
        );
        const selectedStudentEntry = useMemo(() => {
                if (!selectedReport) {
                        return null;
                }

                const membershipUUID = selectedReport.membership_uuid?.trim() ?? "";
                if (membershipUUID) {
                        const byMembership = studentRoster.find(
                                (entry) => entry.membership.membership_uuid === membershipUUID,
                        );
                        if (byMembership) {
                                return byMembership;
                        }
                }

                return (
                        studentRoster.find(
                                (entry) =>
                                        entry.user.k_guid === selectedReport.user_uuid ||
                                        entry.membership.user_uuid === selectedReport.user_uuid,
                        ) ?? null
                );
        }, [selectedReport, studentRoster]);
        const selectedStudentPhotoUrl = selectedStudentEntry
                ? studentProfilePhotoUrls[selectedStudentEntry.user.k_guid] ||
                        studentProfilePhotoUrls[selectedStudentEntry.membership.user_uuid] ||
                        ""
                : "";
        const selectedDeviceUUID =
                selectedReport?.registered_device_uuid?.trim() ?? "";
        const selectedCampusId =
                selectedStudentEntry?.membership.campus_id?.trim() ?? "";
        const violationTypeOptions = useMemo(
                () => buildViolationTypeOptions(feeRules, selectedReport?.violation_type),
                [feeRules, selectedReport?.violation_type],
        );
        const selectedViolationTypeOption = useMemo(() => {
                const normalizedDraft = normalizeViolationType(violationTypeDraft);
                return (
                        violationTypeOptions.find(
                                (option) => normalizeViolationType(option) === normalizedDraft,
                        ) ?? customViolationTypeValue
                );
        }, [violationTypeDraft, violationTypeOptions]);
        const isCustomViolationType =
                selectedViolationTypeOption === customViolationTypeValue;
        const isPaidLocked =
                normalizeStatusValue(selectedReport?.status ?? "") === "paid";
        const matchedFeeRule = useMemo(
                () =>
                        matchParkingViolationFeeRule(
                                feeRules,
                                selectedReport,
                                selectedDevice,
                                selectedCampusId,
                                violationTypeDraft,
                        ),
                [
                        feeRules,
                        selectedCampusId,
                        selectedDevice,
                        selectedReport,
                        violationTypeDraft,
                ],
        );

        const refreshReports = useCallback(async () => {
                if (!activeSchoolId) {
                        setReports([]);
                        setSelectedReportId("");
                        return;
                }

                setLoadBusy(true);
                setError("");
                try {
                        const nextReports = await fetchSchoolParkingViolations(
                                managedAppId,
                                activeSchoolId,
                                { includeInactive: true },
                        );
                        setReports(nextReports);
                        setSelectedReportId((current) => {
                                if (nextReports.some((report) => report.violation_uuid === current)) {
                                        return current;
                                }
                                return (
                                        nextReports.find(
                                                listMode === "open" ? isOpenReport : isResolvedReport,
                                        )?.violation_uuid ??
                                        nextReports.find(isOpenReport)?.violation_uuid ??
                                        nextReports[0]?.violation_uuid ??
                                        ""
                                );
                        });
                } catch (nextError) {
                        setError(getErrorMessage(nextError));
                } finally {
                        setLoadBusy(false);
                }
        }, [activeSchoolId, listMode, managedAppId]);

        const refreshFeeRules = useCallback(async () => {
                if (!activeSchoolId || !managedAppId) {
                        setFeeRules([]);
                        return;
                }
                setFeeRulesBusy(true);
                try {
                        setFeeRules(
                                await fetchParkingViolationFeeRules(managedAppId, activeSchoolId),
                        );
                } catch (nextError) {
                        setError(getErrorMessage(nextError));
                } finally {
                        setFeeRulesBusy(false);
                }
        }, [activeSchoolId, managedAppId]);

        // Deep-link: once reports load, auto-select the report from URL param
        useEffect(() => {
                if (dlConsumed.current || !dlReport.current || reports.length === 0) return;
                const target = reports.find((r) => r.violation_uuid === dlReport.current);
                if (!target) return;
                dlConsumed.current = true;
                // Switch to history tab if the report is resolved
                const isResolved = !isOpenReport(target);
                if (isResolved) setListMode("history");
                setSelectedReportId(target.violation_uuid);
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [reports]);

        const refreshMedia = useCallback(
                async (report: StudentParkingViolation | null) => {
                        if (!report) {
                                setMedia([]);
                                return;
                        }

                        try {
                                const nextMedia = await fetchSchoolParkingViolationMedia(
                                        managedAppId,
                                        activeSchoolId,
                                        report.violation_uuid,
                                        report.user_uuid,
                                );
                                setMedia(nextMedia);
                        } catch {
                                setMedia([]);
                        }
                },
                [activeSchoolId, managedAppId],
        );

        const refreshHistory = useCallback(
                async (report: StudentParkingViolation | null) => {
                        if (!report) {
                                setHistory([]);
                                return;
                        }

                        try {
                                const nextHistory = await fetchSchoolParkingViolationHistory(
                                        managedAppId,
                                        activeSchoolId,
                                        report.violation_uuid,
                                );
                                setHistory(nextHistory);
                        } catch {
                                setHistory([]);
                        }
                },
                [activeSchoolId, managedAppId],
        );

        useEffect(() => {
                void refreshReports();
        }, [refreshReports]);

        useEffect(() => {
                void refreshFeeRules();
        }, [refreshFeeRules]);

        useEffect(() => {
                if (visibleReports.length === 0) {
                        return;
                }
                if (
                        !visibleReports.some(
                                (report) => report.violation_uuid === selectedReportId,
                        )
                ) {
                        setSelectedReportId(visibleReports[0].violation_uuid);
                }
        }, [selectedReportId, visibleReports]);

        useEffect(() => {
                setStatusDraft(selectedReport?.status || "reported");
                setNotesDraft(selectedReport?.admin_notes || "");
                setViolationTypeDraft(selectedReport?.violation_type || "");
                setPaymentAmountDraft(
                        formatCentsForInput(selectedReport?.payment_amount_cents),
                );
                void refreshMedia(selectedReport);
                void refreshHistory(selectedReport);
        }, [refreshHistory, refreshMedia, selectedReport]);

        useEffect(() => {
                if (
                        matchedFeeRule &&
                        normalizeStatusValue(statusDraft) === "awaiting_payment"
                ) {
                        setPaymentAmountDraft(formatCentsForInput(matchedFeeRule.amount_cents));
                }
        }, [matchedFeeRule, statusDraft]);

        useEffect(() => {
                let canceled = false;

                async function loadSelectedDevice() {
                        setSelectedDevice(null);
                        setSelectedDevicePhotoUrl("");

                        if (!selectedReport || !selectedDeviceUUID || !activeSchoolId) {
                                setDeviceBusy(false);
                                return;
                        }

                        setDeviceBusy(true);
                        try {
                                const profile = await fetchStudentProfile(
                                        managedAppId,
                                        selectedReport.user_uuid,
                                );
                                if (canceled) {
                                        return;
                                }

                                const device =
                                        profile.devices.find(
                                                (candidate) =>
                                                        candidate.registered_device_uuid === selectedDeviceUUID,
                                        ) ?? null;
                                setSelectedDevice(device);

                                if (!device) {
                                        return;
                                }

                                const mediaAssets = await fetchUserMediaAssets(
                                        managedAppId,
                                        device.user_uuid || selectedReport.user_uuid,
                                        "registered_device",
                                        device.registered_device_uuid,
                                ).catch(() => []);
                                if (canceled) {
                                        return;
                                }

                                const objectKey =
                                        resolveDevicePhotoObjectKey(mediaAssets) ||
                                        resolveMediaObjectKey(mediaAssets[0]);
                                if (!objectKey) {
                                        return;
                                }

                                const signedUrls = await signSchoolMedia(activeSchoolId, [
                                        objectKey,
                                ]).catch(() => ({}) as Record<string, string>);
                                if (!canceled) {
                                        setSelectedDevicePhotoUrl(signedUrls[objectKey] ?? "");
                                }
                        } catch {
                                if (!canceled) {
                                        setSelectedDevice(null);
                                        setSelectedDevicePhotoUrl("");
                                }
                        } finally {
                                if (!canceled) {
                                        setDeviceBusy(false);
                                }
                        }
                }

                void loadSelectedDevice();

                return () => {
                        canceled = true;
                };
        }, [activeSchoolId, managedAppId, selectedDeviceUUID, selectedReport]);

        async function saveReport(
                nextStatus = statusDraft,
                options?: {
                        paymentRequestedAt?: number;
                        paymentCollectedAt?: number;
                        paymentAmountCents?: number;
                        active?: boolean;
                },
        ) {
                if (!selectedReport) {
                        return;
                }

                setSaveBusy(true);
                setError("");
                setSuccess("");
                try {
                        const normalizedViolationType =
                                normalizeViolationType(violationTypeDraft);
                        const parsedPaymentAmountCents = parseCurrencyCents(paymentAmountDraft);
                        const isRequestingPayment =
                                normalizeStatusValue(nextStatus) === "awaiting_payment";
                        const hasMatchedRule = Boolean(matchedFeeRule);
                        let paymentAmountCents: number | undefined;
                        if (isRequestingPayment && !normalizedViolationType) {
                                setError(
                                        "Select or create a violation type before requesting payment.",
                                );
                                return;
                        }
                        if (isRequestingPayment && hasMatchedRule) {
                                paymentAmountCents = undefined;
                        } else if (options?.paymentAmountCents != null) {
                                paymentAmountCents = options.paymentAmountCents;
                        } else if (paymentAmountDraft.trim()) {
                                paymentAmountCents = parsedPaymentAmountCents ?? undefined;
                        }
                        if (
                                paymentAmountDraft.trim() &&
                                parsedPaymentAmountCents == null &&
                                !hasMatchedRule
                        ) {
                                setError("Enter a valid payment amount before saving.");
                                return;
                        }
                        if (
                                isRequestingPayment &&
                                !hasMatchedRule &&
                                (!paymentAmountCents || paymentAmountCents <= 0)
                        ) {
                                setError(
                                        "No fee rule matched this violation. Enter a manual amount before requesting payment.",
                                );
                                return;
                        }

                        const updated = await updateSchoolParkingViolation(
                                managedAppId,
                                activeSchoolId,
                                selectedReport.violation_uuid,
                                {
                                        status: nextStatus,
                                        admin_notes: notesDraft,
                                        violation_type: normalizedViolationType || undefined,
                                        payment_amount_cents: paymentAmountCents,
                                        payment_requested_at: options?.paymentRequestedAt ?? null,
                                        payment_collected_at: options?.paymentCollectedAt ?? null,
                                        active: options?.active,
                                },
                        );
                        setReports((current) =>
                                current.map((report) =>
                                        report.violation_uuid === updated.violation_uuid ? updated : report,
                                ),
                        );
                        setSelectedReportId(updated.violation_uuid);
                        if (isRequestingPayment) {
                                setSuccess("Payment requested. The rider can pay from the app.");
                        } else {
                                setSuccess("Report updated.");
                        }
                } catch (nextError) {
                        setError(getErrorMessage(nextError));
                } finally {
                        setSaveBusy(false);
                }
        }

        async function handleFileSelected(fileList: FileList | null) {
                const file = fileList?.[0];
                if (!file || !selectedReport) {
                        return;
                }

                setUploadBusy(true);
                setError("");
                setSuccess("");
                try {
                        await uploadSchoolParkingViolationMedia(
                                managedAppId,
                                activeSchoolId,
                                selectedReport,
                                file,
                                "admin_update",
                        );
                        await refreshMedia(selectedReport);
                        await refreshHistory(selectedReport);
                        setSuccess("Photo attached.");
                } catch (nextError) {
                        setError(getErrorMessage(nextError));
                } finally {
                        setUploadBusy(false);
                }
        }

        return (
                <section className="panel penalty-reports-section">
                        <div className="panel-header">
                                <div>
                                        <p className="eyebrow">Penalty Reports</p>
                                        <h2>Active penalty reports</h2>
                                </div>
                                <button
                                        className="primary-button"
                                        type="button"
                                        onClick={() => void refreshReports()}
                                        disabled={loadBusy || !activeSchoolId}>
                                        {loadBusy ? "Refreshing..." : "Refresh Reports"}
                                </button>
                        </div>

                        {error ? <p className="error-text">{error}</p> : null}
                        {success ? <p className="success-text">{success}</p> : null}

                        <div className="penalty-reports-layout">
                                <aside className="penalty-reports-list">
                                        <div className="penalty-reports-list-header">
                                                <strong>{openReports.length.toLocaleString()} open</strong>
                                                <span>{reports.length.toLocaleString()} total</span>
                                        </div>
                                        <div className="penalty-report-list-tabs">
                                                <button
                                                        className={
                                                                listMode === "open"
                                                                        ? "penalty-report-list-tab penalty-report-list-tab-active"
                                                                        : "penalty-report-list-tab"
                                                        }
                                                        type="button"
                                                        onClick={() => setListMode("open")}>
                                                        Open
                                                </button>
                                                <button
                                                        className={
                                                                listMode === "history"
                                                                        ? "penalty-report-list-tab penalty-report-list-tab-active"
                                                                        : "penalty-report-list-tab"
                                                        }
                                                        type="button"
                                                        onClick={() => setListMode("history")}>
                                                        History
                                                </button>
                                        </div>
                                        {loadBusy ? (
                                                <p className="muted-text">Loading reports...</p>
                                        ) : visibleReports.length === 0 ? (
                                                <p className="empty-state">
                                                        {listMode === "open"
                                                                ? "No open penalty reports."
                                                                : "No resolved parking penalties yet."}
                                                </p>
                                        ) : (
                                                visibleReports.map((report) => {
                                                        const statusKey = (report.status || "reported").replace(/_/g, "-");
                                                        return (
                                                                <button
                                                                        className={
                                                                                selectedReport?.violation_uuid === report.violation_uuid
                                                                                        ? "penalty-report-list-item penalty-report-list-item-active"
                                                                                        : "penalty-report-list-item"
                                                                        }
                                                                        key={report.violation_uuid}
                                                                        type="button"
                                                                        onClick={() => setSelectedReportId(report.violation_uuid)}>
                                                                        <div className="vr-list-item-row">
                                                                                <strong>{report.description || "Parking report"}</strong>
                                                                                {report.violation_type ? (
                                                                                        <span className="vr-list-type-badge">
                                                                                                {formatStatus(report.violation_type)}
                                                                                        </span>
                                                                                ) : null}
                                                                        </div>
                                                                        <span className={`vr-status-badge vr-status-badge-${statusKey}`}>
                                                                                {formatStatus(report.status || "reported")}
                                                                        </span>
                                                                        <small>{formatDateTime(report.created_at)}</small>
                                                                </button>
                                                        );
                                                })
                                        )}
                                </aside>

                                {selectedReport ? (
                                        <article className="penalty-report-detail">
                                                <div className="penalty-report-detail-header">
                                                        <div>
                                                                <p className="eyebrow">Report detail</p>
                                                                <h3>{selectedReport.description || "Parking report"}</h3>
                                                        </div>
                                                        <span className="dashboard-penalty-chip">
                                                                {formatStatus(selectedReport.status)}
                                                        </span>
                                                </div>

                                                <div className="penalty-report-detail-grid">
                                                        <div className="penalty-report-student-card">
                                                                <div className="penalty-report-student-avatar">
                                                                        {selectedStudentPhotoUrl ? (
                                                                                <img
                                                                                        src={selectedStudentPhotoUrl}
                                                                                        alt={`${formatStudentName(selectedStudentEntry)} profile`}
                                                                                />
                                                                        ) : (
                                                                                getStudentInitials(selectedStudentEntry) || "?"
                                                                        )}
                                                                </div>
                                                                <div className="penalty-report-student-copy">
                                                                        <span>Student</span>
                                                                        <strong>{formatStudentName(selectedStudentEntry)}</strong>
                                                                        <small>
                                                                                ID:{" "}
                                                                                {selectedStudentEntry?.membership.student_id ||
                                                                                        "Unavailable"}
                                                                        </small>
                                                                </div>
                                                                <button
                                                                        className="secondary-button penalty-report-student-link"
                                                                        type="button"
                                                                        disabled={!selectedStudentEntry}
                                                                        onClick={() => {
                                                                                if (selectedStudentEntry) {
                                                                                        onOpenStudent(
                                                                                                selectedStudentEntry.membership.membership_uuid,
                                                                                        );
                                                                                }
                                                                        }}>
                                                                        View Student
                                                                </button>
                                                        </div>
                                                        <div className="penalty-report-device-card">
                                                                <div className="penalty-report-device-thumb">
                                                                        {selectedDevicePhotoUrl ? (
                                                                                <img
                                                                                        src={selectedDevicePhotoUrl}
                                                                                        alt={`${formatDeviceName(selectedDevice)} device`}
                                                                                />
                                                                        ) : (
                                                                                (
                                                                                        selectedDevice?.device_type?.slice(0, 1) || "D"
                                                                                ).toUpperCase()
                                                                        )}
                                                                </div>
                                                                <div className="penalty-report-device-copy">
                                                                        <span>Device</span>
                                                                        <strong>
                                                                                {deviceBusy
                                                                                        ? "Loading device..."
                                                                                        : formatDeviceName(selectedDevice)}
                                                                        </strong>
                                                                        <small>{formatDeviceMeta(selectedDevice)}</small>
                                                                </div>
                                                                <button
                                                                        className="secondary-button penalty-report-device-link"
                                                                        type="button"
                                                                        disabled={!selectedStudentEntry || !selectedDeviceUUID}
                                                                        onClick={() => {
                                                                                if (selectedStudentEntry && selectedDeviceUUID) {
                                                                                        onOpenStudentDevice(
                                                                                                selectedStudentEntry.membership.membership_uuid,
                                                                                                selectedDeviceUUID,
                                                                                        );
                                                                                }
                                                                        }}>
                                                                        View Device
                                                                </button>
                                                        </div>
                                                        <div>
                                                                <span>Reported</span>
                                                                <strong>{formatDateTime(selectedReport.created_at)}</strong>
                                                        </div>
                                                        <div>
                                                                <span>Updated</span>
                                                                <strong>{formatDateTime(selectedReport.updated_at)}</strong>
                                                        </div>
                                                        <div>
                                                                <span>Payment amount</span>
                                                                <strong>
                                                                        {formatCurrencyFromCents(selectedReport.payment_amount_cents)}
                                                                </strong>
                                                        </div>
                                                        <div>
                                                                <span>Violation type</span>
                                                                <strong>
                                                                        {selectedReport.violation_type
                                                                                ? formatStatus(selectedReport.violation_type)
                                                                                : "Not set"}
                                                                </strong>
                                                        </div>
                                                </div>

                                                {selectedReport.appeal_description ? (
                                                        <div className="penalty-report-appeal">
                                                                <span>Student appeal</span>
                                                                <p>{selectedReport.appeal_description}</p>
                                                                <small>{formatDateTime(selectedReport.appealed_at)}</small>
                                                        </div>
                                                ) : null}

                                                <div className="penalty-report-detail-tabs">
                                                        {(["details", "photos", "history"] as const).map((tab) => (
                                                                <button
                                                                        className={
                                                                                detailTab === tab
                                                                                        ? "penalty-report-detail-tab penalty-report-detail-tab-active"
                                                                                        : "penalty-report-detail-tab"
                                                                        }
                                                                        key={tab}
                                                                        type="button"
                                                                        onClick={() => setDetailTab(tab)}>
                                                                        {tab === "details"
                                                                                ? "Details"
                                                                                : tab === "photos"
                                                                                        ? "Photos"
                                                                                        : "History"}
                                                                </button>
                                                        ))}
                                                </div>

                                                {detailTab === "details" ? (
                                                        <>
                                                                {isPaidLocked ? (
                                                                        <div className="vr-paid-lock">
                                                                                <div className="vr-paid-lock-icon">✓</div>
                                                                                <div className="vr-paid-lock-copy">
                                                                                        <strong>Payment Received</strong>
                                                                                        <p>
                                                                                                This violation has been marked as paid and
                                                                                                is locked from further edits.
                                                                                        </p>
                                                                                </div>
                                                                        </div>
                                                                ) : (
                                                                        <>
                                                                                <div className="vr-form-block">
                                                                                        <p className="vr-block-label">Set status</p>
                                                                                        <div className="vr-status-grid">
                                                                                                {statusOptions.map((status) => (
                                                                                                        <button
                                                                                                                key={status}
                                                                                                                type="button"
                                                                                                                className={`vr-status-btn vr-status-btn-${status.replace(/_/g, "-")}${statusDraft === status ? " vr-status-btn-active" : ""}`}
                                                                                                                onClick={() =>
                                                                                                                        setStatusDraft(status)
                                                                                                                }>
                                                                                                                <span className="vr-status-dot" />
                                                                                                                {formatStatus(status)}
                                                                                                        </button>
                                                                                                ))}
                                                                                        </div>
                                                                                </div>

                                                                                <div className="vr-form-block">
                                                                                        <p className="vr-block-label">Violation type</p>
                                                                                        <div className="vr-type-grid">
                                                                                                {violationTypeOptions.map((type) => (
                                                                                                        <button
                                                                                                                key={type}
                                                                                                                type="button"
                                                                                                                className={`vr-type-btn${normalizeViolationType(violationTypeDraft) === type && !isCustomViolationType ? " vr-type-btn-active" : ""}`}
                                                                                                                onClick={() =>
                                                                                                                        setViolationTypeDraft(
                                                                                                                                type,
                                                                                                                        )
                                                                                                                }>
                                                                                                                {formatStatus(type)}
                                                                                                        </button>
                                                                                                ))}
                                                                                                <button
                                                                                                        type="button"
                                                                                                        className={`vr-type-btn vr-type-btn-custom${isCustomViolationType ? " vr-type-btn-active" : ""}`}
                                                                                                        onClick={() =>
                                                                                                                setViolationTypeDraft("")
                                                                                                        }>
                                                                                                        Custom…
                                                                                                </button>
                                                                                        </div>
                                                                                        {isCustomViolationType ? (
                                                                                                <input
                                                                                                        className="vr-type-custom"
                                                                                                        value={violationTypeDraft}
                                                                                                        onChange={(event) =>
                                                                                                                setViolationTypeDraft(
                                                                                                                        event.target.value,
                                                                                                                )
                                                                                                        }
                                                                                                        placeholder={
                                                                                                                feeRulesBusy
                                                                                                                        ? "Loading types…"
                                                                                                                        : "Enter type, e.g. no_permit"
                                                                                                        }
                                                                                                />
                                                                                        ) : null}
                                                                                </div>

                                                                                <div className="penalty-report-form-grid">
                                                                                        <label className="field">
                                                                                                <span>Admin notes</span>
                                                                                                <textarea
                                                                                                        value={notesDraft}
                                                                                                        onChange={(event) =>
                                                                                                                setNotesDraft(event.target.value)
                                                                                                        }
                                                                                                        placeholder="Add internal notes, payment context, or appeal review notes."
                                                                                                />
                                                                                        </label>
                                                                                        <label className="field">
                                                                                                <span>Payment amount</span>
                                                                                                <input
                                                                                                        type="number"
                                                                                                        min="0"
                                                                                                        step="0.01"
                                                                                                        value={paymentAmountDraft}
                                                                                                        onChange={(event) =>
                                                                                                                setPaymentAmountDraft(
                                                                                                                        event.target.value,
                                                                                                                )
                                                                                                        }
                                                                                                        disabled={Boolean(matchedFeeRule)}
                                                                                                        placeholder="40.00"
                                                                                                />
                                                                                        </label>
                                                                                </div>

                                                                                <div className="penalty-report-fee-match">
                                                                                        {matchedFeeRule ? (
                                                                                                <span>
                                                                                                        Matched fee:{" "}
                                                                                                        <strong>
                                                                                                                {matchedFeeRule.label ||
                                                                                                                        formatStatus(
                                                                                                                                matchedFeeRule.violation_type,
                                                                                                                        )}
                                                                                                        </strong>{" "}
                                                                                                        {formatCurrencyFromCents(
                                                                                                                matchedFeeRule.amount_cents,
                                                                                                        )}
                                                                                                </span>
                                                                                        ) : (
                                                                                                <span>
                                                                                                        No matching fee rule. Manual amount
                                                                                                        will be used.
                                                                                                </span>
                                                                                        )}
                                                                                </div>

                                                                                <div className="penalty-report-actions">
                                                                                        <button
                                                                                                className="primary-button"
                                                                                                type="button"
                                                                                                onClick={() => void saveReport()}
                                                                                                disabled={saveBusy}>
                                                                                                {saveBusy ? "Saving..." : "Save Changes"}
                                                                                        </button>
                                                                                </div>
                                                                        </>
                                                                )}
                                                        </>
                                                ) : null}

                                                {detailTab === "photos" ? (
                                                        <div className="penalty-report-media">
                                                                <div className="penalty-report-media-header">
                                                                        <div>
                                                                                <h4>Photos</h4>
                                                                                <span>{media.length.toLocaleString()} attached</span>
                                                                        </div>
                                                                        <label className="secondary-button penalty-report-upload-button">
                                                                                {uploadBusy ? "Uploading..." : "Add Photo"}
                                                                                <input
                                                                                        type="file"
                                                                                        accept="image/*"
                                                                                        disabled={uploadBusy}
                                                                                        onChange={(event) =>
                                                                                                void handleFileSelected(event.target.files)
                                                                                        }
                                                                                />
                                                                        </label>
                                                                </div>
                                                                {media.length === 0 ? (
                                                                        <p className="empty-state">No photos attached yet.</p>
                                                                ) : (
                                                                        <div className="penalty-report-photo-grid">
                                                                                {media.map((item) => (
                                                                                        <button
                                                                                                className="penalty-report-photo-card"
                                                                                                key={item.media_uuid}
                                                                                                type="button">
                                                                                                {item.get_url ? (
                                                                                                        <img
                                                                                                                src={item.get_url}
                                                                                                                alt="Penalty report evidence"
                                                                                                        />
                                                                                                ) : (
                                                                                                        <span>No preview</span>
                                                                                                )}
                                                                                        </button>
                                                                                ))}
                                                                        </div>
                                                                )}
                                                        </div>
                                                ) : null}

                                                {detailTab === "history" ? (
                                                        <div className="penalty-report-history">
                                                                {history.length === 0 ? (
                                                                        <p className="empty-state">No history events yet.</p>
                                                                ) : (
                                                                        history.map((event) => (
                                                                                <div
                                                                                        className="penalty-report-history-item"
                                                                                        key={event.history_uuid}>
                                                                                        <div>
                                                                                                <strong>{formatHistoryEvent(event)}</strong>
                                                                                                {event.note ? <p>{event.note}</p> : null}
                                                                                        </div>
                                                                                        <time>{formatDateTime(event.created_at)}</time>
                                                                                </div>
                                                                        ))
                                                                )}
                                                        </div>
                                                ) : null}
                                        </article>
                                ) : (
                                        <article className="penalty-report-detail penalty-report-detail-empty">
                                                <strong>Select a report</strong>
                                                <p className="muted-text">Choose a report to review details.</p>
                                        </article>
                                )}
                        </div>
                </section>
        );
}
