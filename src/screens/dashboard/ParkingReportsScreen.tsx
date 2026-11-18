import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  assignSchoolParkingIncidentReport,
  clearSchoolParkingIncidentReportFlag,
  deleteSchoolParkingIncidentReport,
  fetchParkingViolationFeeRules,
  fetchSchoolParkingIncidentReport,
  fetchSchoolParkingIncidentReportContext,
  fetchSchoolParkingIncidentReports,
  fetchSchoolRegisteredDevices,
  flagSchoolParkingIncidentReport,
  issueSchoolParkingIncidentReportViolation,
  signSchoolMedia,
  type ParkingIncidentRelatedRecord,
  type ParkingIncidentReportContext,
  type ParkingIncidentResponsibilityConsequence,
  type ParkingIncidentScannedPass,
  type ParkingViolationFeeRule,
  type ParkingIncidentReportStatus,
  type ParkingIncidentReportType,
  type RegisteredDeviceReviewEntry,
  type SchoolStudentRosterEntry,
  type StudentParkingIncidentReport,
  updateSchoolParkingIncidentReport,
} from "../../lib/api";
import { useDetailParamSync } from "../../lib/useDetailParamSync";

type Props = {
  activeSchoolId: string;
  managedAppId: string;
  studentRoster: SchoolStudentRosterEntry[];
  studentProfilePhotoUrls: Record<string, string>;
  onOpenStudent: (membershipUUID: string) => void;
  onOpenStudentDevice: (membershipUUID: string, deviceUUID: string) => void;
  onOpenReportCountChange?: (count: number) => void;
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
  return (
    fullName ||
    entry.user.username ||
    entry.user.email ||
    report.reporter_user_uuid
  );
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
  const words = label.trim().split(/\s+/).filter(Boolean);
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

function countOpenReports(reports: StudentParkingIncidentReport[]): number {
  return reports.filter((report) => {
    if (report.active === false) {
      return false;
    }
    return (report.status ?? "submitted").trim().toLowerCase() === "submitted";
  }).length;
}

function isClosedReport(report: StudentParkingIncidentReport): boolean {
  const status = (report.status ?? "submitted").trim().toLowerCase();
  return status === "resolved" || status === "dismissed";
}

function formatLocationValue(report: StudentParkingIncidentReport): string {
  if (
    typeof report.violation_latitude !== "number" ||
    typeof report.violation_longitude !== "number"
  ) {
    return "Location unavailable";
  }
  return `${report.violation_latitude.toFixed(6)}, ${report.violation_longitude.toFixed(6)}`;
}

function getDeviceLabel(entry: RegisteredDeviceReviewEntry): string {
  const device = entry.device;
  return (
    device.nickname?.trim() ||
    [device.make, device.model].filter(Boolean).join(" ").trim() ||
    device.serial_number?.trim() ||
    device.registered_device_uuid
  );
}

function getStudentLabel(entry: SchoolStudentRosterEntry): string {
  const fullName = [entry.user.first_name?.trim(), entry.user.last_name?.trim()]
    .filter(Boolean)
    .join(" ");
  return (
    fullName || entry.user.username || entry.user.email || entry.user.k_guid
  );
}

function describePassStatus(pass: ParkingIncidentScannedPass): string {
  if (pass.status === "active") {
    return "Active";
  }
  if (pass.status === "unassigned") {
    return "Not registered";
  }
  switch (pass.deactivated_reason) {
    case "lost":
      return "Inactive · reported lost";
    case "replaced":
      return "Inactive · replaced";
    case "device_deleted":
      return "Inactive · vehicle removed";
    case "admin":
      return "Inactive · deactivated";
    default:
      return "Inactive";
  }
}

type HistoryItem = {
  kind: "report" | "violation";
  record: ParkingIncidentRelatedRecord;
};

function HistoryBadge({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }
  return (
    <span className="prd-history-badge" title="Other reports and violations">
      {count} before
    </span>
  );
}

function centsToDollars(value: number): string {
  return (value / 100).toFixed(2);
}

export function ParkingReportsScreen({
  activeSchoolId,
  managedAppId,
  studentRoster,
  studentProfilePhotoUrls,
  onOpenStudent,
  onOpenStudentDevice,
  onOpenReportCountChange,
}: Props) {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<
    "all" | ParkingIncidentReportStatus
  >("all");
  const [typeFilter, setTypeFilter] = useState<
    "all" | ParkingIncidentReportType
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [draftStatusFilter, setDraftStatusFilter] = useState<
    "all" | ParkingIncidentReportStatus
  >("all");
  const [draftTypeFilter, setDraftTypeFilter] = useState<
    "all" | ParkingIncidentReportType
  >("all");
  const [detailOpen, setDetailOpen] = useState(false);
  const [reports, setReports] = useState<StudentParkingIncidentReport[]>([]);
  const [selectedReportId, setSelectedReportId] = useState("");
  // The open report's tag and history, keyed so a stale response for another
  // report (or an older version of this one) is never shown.
  const [reportContext, setReportContext] = useState<{
    key: string;
    value: ParkingIncidentReportContext | null;
    error: string;
  }>({ key: "", value: null, error: "" });
  const [historyOpen, setHistoryOpen] = useState(false);
  // Reports opened from "Seen before" that aren't in the table's results,
  // by UUID. Kept apart from `reports` so they never show up in a filtered
  // table, and all kept so browser Back/Forward through them still resolves.
  const [historyReports, setHistoryReports] = useState<
    Record<string, StudentParkingIncidentReport>
  >({});
  const [expandedPhotoUrl, setExpandedPhotoUrl] = useState("");

  useDetailParamSync(
    "report",
    detailOpen && selectedReportId ? selectedReportId : "",
    (value) => {
      if (value) {
        setSelectedReportId(value);
        setDetailOpen(true);
      } else {
        setDetailOpen(false);
      }
    },
  );
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [registeredDevices, setRegisteredDevices] = useState<
    RegisteredDeviceReviewEntry[]
  >([]);
  const [feeRules, setFeeRules] = useState<ParkingViolationFeeRule[]>([]);
  const [loadBusy, setLoadBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [statusDraft, setStatusDraft] =
    useState<ParkingIncidentReportStatus>("submitted");
  const [adminNotesDraft, setAdminNotesDraft] = useState("");
  const [studentNoteDraft, setStudentNoteDraft] = useState("");
  const [assignedUserDraft, setAssignedUserDraft] = useState("");
  const [assignedDeviceDraft, setAssignedDeviceDraft] = useState("");
  const [assignmentNoteDraft, setAssignmentNoteDraft] = useState("");
  const [responsibilityConsequenceDraft, setResponsibilityConsequenceDraft] =
    useState<ParkingIncidentResponsibilityConsequence>("none");
  const [responsibilityPointsDraft, setResponsibilityPointsDraft] =
    useState("");
  const [responsibilityFineDollarsDraft, setResponsibilityFineDollarsDraft] =
    useState("");
  const [responsibilityNoteDraft, setResponsibilityNoteDraft] = useState("");
  const [flagPriorityDraft, setFlagPriorityDraft] = useState<"normal" | "urgent">(
    "normal",
  );
  const [flagNoteDraft, setFlagNoteDraft] = useState("");
  const [issueViolationType, setIssueViolationType] = useState("other");
  const [issueStatus, setIssueStatus] = useState("reported");
  const [issueAmountDollars, setIssueAmountDollars] = useState("");
  const [issueAdminNotes, setIssueAdminNotes] = useState("");
  const [issueStudentNote, setIssueStudentNote] = useState("");

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
    () =>
      reports.find((report) => report.report_uuid === selectedReportId) ??
      historyReports[selectedReportId] ??
      null,
    [historyReports, reports, selectedReportId],
  );

  const closedReportCount = useMemo(
    () => reports.filter(isClosedReport).length,
    [reports],
  );

  const filteredReports = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let sortedReports = [...reports].sort(
      (left, right) => (right.created_at ?? 0) - (left.created_at ?? 0),
    );
    if (statusFilter === "all" && !showClosed) {
      sortedReports = sortedReports.filter((report) => !isClosedReport(report));
    }
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
  }, [reports, searchQuery, showClosed, statusFilter, studentByMembership, studentByUser]);

  const refreshReports = useCallback(async () => {
    const isUnfilteredReportView =
      statusFilter === "all" && typeFilter === "all";
    if (!activeSchoolId || !managedAppId) {
      setReports([]);
      setSelectedReportId("");
      setDetailOpen(false);
      setSignedUrls({});
      onOpenReportCountChange?.(0);
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
      if (isUnfilteredReportView) {
        onOpenReportCountChange?.(countOpenReports(nextReports));
      }
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
          Array.from(objectKeysBySchool.entries()).map(
            ([schoolId, objectKeys]) => signSchoolMedia(schoolId, objectKeys),
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
  }, [
    activeSchoolId,
    managedAppId,
    onOpenReportCountChange,
    statusFilter,
    typeFilter,
  ]);

  useEffect(() => {
    void refreshReports();
  }, [refreshReports]);

  useEffect(() => {
    let cancelled = false;
    if (!activeSchoolId || !managedAppId) {
      setRegisteredDevices([]);
      setFeeRules([]);
      return;
    }
            Promise.allSettled([
              fetchSchoolRegisteredDevices(managedAppId, activeSchoolId),
              fetchParkingViolationFeeRules(managedAppId, activeSchoolId, {
                includeInactive: true,
              }),
            ]).then(([deviceResult, feeRuleResult]) => {
      if (cancelled) {
        return;
      }
      setRegisteredDevices(
        deviceResult.status === "fulfilled" ? deviceResult.value : [],
      );
      setFeeRules(feeRuleResult.status === "fulfilled" ? feeRuleResult.value : []);
    });
    return () => {
      cancelled = true;
    };
  }, [activeSchoolId, managedAppId]);

  useEffect(() => {
    if (detailOpen && !selectedReport) {
      setDetailOpen(false);
    }
  }, [detailOpen, selectedReport]);

  useEffect(() => {
    if (!selectedReport) {
      setStatusDraft("submitted");
      setAdminNotesDraft("");
      setStudentNoteDraft("");
      setAssignedUserDraft("");
      setAssignedDeviceDraft("");
      setAssignmentNoteDraft("");
      setFlagPriorityDraft("normal");
      setFlagNoteDraft("");
      setIssueModalOpen(false);
      return;
    }
    setStatusDraft(selectedReport.status);
    setAdminNotesDraft(selectedReport.admin_notes ?? "");
    setStudentNoteDraft(selectedReport.student_visible_note ?? "");
    setAssignedUserDraft(selectedReport.assigned_user_uuid ?? "");
    setAssignedDeviceDraft(selectedReport.assigned_registered_device_uuid ?? "");
    setAssignmentNoteDraft(selectedReport.assignment_note ?? "");
    const nextConsequence =
      selectedReport.responsibility_consequence === "points" ||
      selectedReport.responsibility_consequence === "fine"
        ? selectedReport.responsibility_consequence
        : "none";
    setResponsibilityConsequenceDraft(nextConsequence);
    setResponsibilityPointsDraft(
      selectedReport.responsibility_points_lost
        ? String(selectedReport.responsibility_points_lost)
        : "",
    );
    setResponsibilityFineDollarsDraft(
      selectedReport.responsibility_fine_cents
        ? (selectedReport.responsibility_fine_cents / 100).toFixed(2)
        : "",
    );
    setResponsibilityNoteDraft(selectedReport.responsibility_note ?? "");
    setFlagPriorityDraft(
      selectedReport.flag_priority === "urgent" ? "urgent" : "normal",
    );
    setFlagNoteDraft(selectedReport.flag_note ?? "");
    setIssueViolationType("other");
    setIssueStatus("reported");
    setIssueAmountDollars(
      selectedReport.responsibility_fine_cents
        ? (selectedReport.responsibility_fine_cents / 100).toFixed(2)
        : "",
    );
    setIssueAdminNotes(selectedReport.admin_notes ?? "");
    setIssueStudentNote(selectedReport.student_visible_note ?? "");
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
      replaceReport(updated);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setSaveBusy(false);
    }
  }

  function replaceReport(updated: StudentParkingIncidentReport) {
    setHistoryReports((current) =>
      current[updated.report_uuid]
        ? { ...current, [updated.report_uuid]: updated }
        : current,
    );
    setReports((current) => {
      const nextReports = current.map((report) =>
        report.report_uuid === updated.report_uuid ? updated : report,
      );
      if (statusFilter === "all" && typeFilter === "all") {
        onOpenReportCountChange?.(countOpenReports(nextReports));
      }
      return nextReports;
    });
  }

  async function saveAssignment() {
    if (!selectedReport || !assignedUserDraft) {
      setError("Choose a responsible student before saving assignment.");
      return;
    }
    const pointLoss =
      responsibilityPointsDraft.trim() === ""
        ? 0
        : Math.round(Number(responsibilityPointsDraft));
    if (
      responsibilityConsequenceDraft === "points" &&
      (!Number.isFinite(pointLoss) || pointLoss <= 0)
    ) {
      setError("Enter the number of points this student should lose.");
      return;
    }
    const fineCents =
      responsibilityFineDollarsDraft.trim() === ""
        ? 0
        : Math.round(Number(responsibilityFineDollarsDraft) * 100);
    if (
      responsibilityConsequenceDraft === "fine" &&
      (!Number.isFinite(fineCents) || fineCents <= 0)
    ) {
      setError("Enter the fine amount.");
      return;
    }
    setActionBusy("assignment");
    setError("");
    try {
      const membershipUUID =
        assignmentDraftStudent?.membership.membership_uuid ??
        selectedReport.assigned_membership_uuid ??
        null;
      const updated = await assignSchoolParkingIncidentReport(
        selectedReport.app_id || managedAppId,
        selectedReport.school_id || activeSchoolId,
        selectedReport.report_uuid,
        {
          assigned_user_uuid: assignedUserDraft,
          assigned_membership_uuid: membershipUUID,
          assigned_registered_device_uuid: assignedDeviceDraft || null,
          assignment_note: assignmentNoteDraft,
          responsibility_consequence: responsibilityConsequenceDraft,
          responsibility_points_lost:
            responsibilityConsequenceDraft === "points" ? pointLoss : 0,
          responsibility_fine_cents:
            responsibilityConsequenceDraft === "fine" ? fineCents : null,
          responsibility_note: responsibilityNoteDraft,
        },
      );
      replaceReport(updated);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setActionBusy("");
    }
  }

  async function saveFlag() {
    if (!selectedReport) {
      return;
    }
    setActionBusy("flag");
    setError("");
    try {
      const updated = await flagSchoolParkingIncidentReport(
        selectedReport.app_id || managedAppId,
        selectedReport.school_id || activeSchoolId,
        selectedReport.report_uuid,
        {
          priority: flagPriorityDraft,
          note: flagNoteDraft,
        },
      );
      replaceReport(updated);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setActionBusy("");
    }
  }

  async function clearFlag() {
    if (!selectedReport) {
      return;
    }
    setActionBusy("clear-flag");
    setError("");
    try {
      const updated = await clearSchoolParkingIncidentReportFlag(
        selectedReport.app_id || managedAppId,
        selectedReport.school_id || activeSchoolId,
        selectedReport.report_uuid,
      );
      replaceReport(updated);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setActionBusy("");
    }
  }

  async function deleteSelectedReport() {
    if (!selectedReport) {
      return;
    }
    const confirmed = window.confirm(
      `Delete this parking report permanently?\n\nThis removes the report from the dashboard and student history. This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }
    setActionBusy("delete");
    setError("");
    try {
      await deleteSchoolParkingIncidentReport(
        selectedReport.app_id || managedAppId,
        selectedReport.school_id || activeSchoolId,
        selectedReport.report_uuid,
      );
      setReports((current) => {
        const nextReports = current.filter(
          (report) => report.report_uuid !== selectedReport.report_uuid,
        );
        if (statusFilter === "all" && typeFilter === "all") {
          onOpenReportCountChange?.(countOpenReports(nextReports));
        }
        setSelectedReportId(nextReports[0]?.report_uuid ?? "");
        return nextReports;
      });
      setHistoryReports((current) => {
        if (!current[selectedReport.report_uuid]) {
          return current;
        }
        const next = { ...current };
        delete next[selectedReport.report_uuid];
        return next;
      });
      setDetailOpen(false);
      setSignedUrls((current) => {
        const next = { ...current };
        for (const asset of selectedReport.media_assets ?? []) {
          if (asset.object_key) {
            delete next[asset.object_key];
          }
        }
        return next;
      });
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setActionBusy("");
    }
  }

  async function issueViolation() {
    if (!selectedReport) {
      return;
    }
    const responsibleUserUUID =
      assignedUserDraft || selectedReport.assigned_user_uuid || "";
    if (!responsibleUserUUID) {
      setError("Choose a responsible student before issuing a violation.");
      return;
    }
    const amountCents =
      issueAmountDollars.trim() === ""
        ? null
        : Math.max(0, Math.round(Number(issueAmountDollars) * 100));
    if (issueAmountDollars.trim() !== "" && !Number.isFinite(amountCents ?? NaN)) {
      setError("Enter a valid dollar amount.");
      return;
    }
    setActionBusy("issue");
    setError("");
    try {
      const response = await issueSchoolParkingIncidentReportViolation(
        selectedReport.app_id || managedAppId,
        selectedReport.school_id || activeSchoolId,
        selectedReport.report_uuid,
        {
          user_uuid: responsibleUserUUID,
          membership_uuid:
            assignmentDraftStudent?.membership.membership_uuid ??
            selectedReport.assigned_membership_uuid ??
            null,
          registered_device_uuid:
            assignedDeviceDraft ||
            selectedReport.assigned_registered_device_uuid ||
            null,
          violation_type: issueViolationType,
          description: selectedReport.description || "Parking incident report",
          status: issueStatus,
          admin_notes: issueAdminNotes,
          student_visible_note: issueStudentNote,
          payment_amount_cents: amountCents,
          payment_requested_at:
            issueStatus === "awaiting_payment"
              ? Math.floor(Date.now() / 1000)
              : null,
          violation_latitude: selectedReport.violation_latitude ?? null,
          violation_longitude: selectedReport.violation_longitude ?? null,
          location_accuracy_meters:
            selectedReport.location_accuracy_meters ?? null,
          location_captured_at: selectedReport.location_captured_at ?? null,
        },
      );
      replaceReport(response.report);
      setIssueModalOpen(false);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setActionBusy("");
    }
  }

  const incidentObjectKey = getMediaObjectKey(selectedReport, "incident_photo");
  const qrObjectKey = getMediaObjectKey(selectedReport, "device_qr_photo");
  const incidentPhotoUrl = incidentObjectKey
    ? signedUrls[incidentObjectKey]
    : "";
  const qrPhotoUrl = qrObjectKey ? signedUrls[qrObjectKey] : "";
  const selectedReporter =
    selectedReport &&
    ((selectedReport.reporter_membership_uuid
      ? studentByMembership.get(selectedReport.reporter_membership_uuid)
      : undefined) ??
      studentByUser.get(selectedReport.reporter_user_uuid));
  const selectedReporterAvatar = selectedReporter?.user.k_guid
    ? studentProfilePhotoUrls[selectedReporter.user.k_guid]
    : "";
  const selectedAssignedStudent = selectedReport?.assigned_user_uuid
    ? studentByUser.get(selectedReport.assigned_user_uuid)
    : undefined;
  const assignmentDraftStudent = assignedUserDraft
    ? studentByUser.get(assignedUserDraft)
    : undefined;
  const assignmentDraftDevices = registeredDevices.filter(
    (entry) => entry.device.user_uuid === assignedUserDraft,
  );
  const activeFeeRules = feeRules.filter((rule) => rule.active !== false);
  const hasLocation =
    typeof selectedReport?.violation_latitude === "number" &&
    typeof selectedReport?.violation_longitude === "number";
  const mapUrl =
    hasLocation && selectedReport
      ? `https://www.google.com/maps/search/?api=1&query=${selectedReport.violation_latitude},${selectedReport.violation_longitude}`
      : "";
  const activeFilterCount =
    (statusFilter === "all" ? 0 : 1) + (typeFilter === "all" ? 0 : 1);

  const contextKey =
    detailOpen && selectedReport
      ? `${selectedReport.report_uuid}:${selectedReport.updated_at}`
      : "";
  useEffect(() => {
    if (!contextKey || !selectedReport) {
      return;
    }
    let cancelled = false;
    fetchSchoolParkingIncidentReportContext(
      selectedReport.app_id || managedAppId,
      selectedReport.school_id || activeSchoolId,
      selectedReport.report_uuid,
    ).then(
      (value) => {
        if (!cancelled) {
          setReportContext({ key: contextKey, value, error: "" });
        }
      },
      (nextError: unknown) => {
        if (!cancelled) {
          setReportContext({
            key: contextKey,
            value: null,
            error: getErrorMessage(nextError),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // selectedReport changes identity on every list refresh; contextKey
    // captures the parts that matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey, managedAppId, activeSchoolId]);

  const context = reportContext.key === contextKey ? reportContext.value : null;
  const contextError =
    reportContext.key === contextKey ? reportContext.error : "";
  const scannedPass = context?.scanned_pass ?? null;
  const tagStudent = scannedPass?.user_uuid
    ? studentByUser.get(scannedPass.user_uuid)
    : undefined;
  const responsibleStudent = selectedAssignedStudent;
  const isTagMatch = selectedReport?.assignment_source === "tag";
  const vehicleUUID =
    selectedReport?.assigned_registered_device_uuid ||
    context?.registered_device_uuid ||
    "";
  const vehicleEntry = vehicleUUID
    ? registeredDevices.find(
        (entry) => entry.device.registered_device_uuid === vehicleUUID,
      )
    : undefined;
  const historyItems: HistoryItem[] = [
    ...(context?.related_reports ?? []).map((record) => ({
      kind: "report" as const,
      record,
    })),
    ...(context?.related_violations ?? []).map((record) => ({
      kind: "violation" as const,
      record,
    })),
  ].sort((left, right) => right.record.created_at - left.record.created_at);
  const historyCount = historyItems.length;
  const historyCounts = {
    student: historyItems.filter((item) =>
      item.record.matched_on.includes("student"),
    ).length,
    vehicle: historyItems.filter((item) =>
      item.record.matched_on.includes("vehicle"),
    ).length,
    tag: historyItems.filter((item) => item.record.matched_on.includes("tag"))
      .length,
  };
  const reportHistoryCount = context?.related_reports.length ?? 0;
  const violationHistoryCount = context?.related_violations.length ?? 0;
  const historySummary = [
    violationHistoryCount > 0
      ? `${violationHistoryCount} violation${violationHistoryCount === 1 ? "" : "s"}`
      : "",
    reportHistoryCount > 0
      ? `${reportHistoryCount} other report${reportHistoryCount === 1 ? "" : "s"}`
      : "",
  ]
    .filter(Boolean)
    .join(" and ") +
    " involving this " +
    [
      historyCounts.student > 0 ? "student" : "",
      historyCounts.vehicle > 0 ? "vehicle" : "",
      historyCounts.tag > 0 ? "ID tag" : "",
    ]
      .filter(Boolean)
      .join(", ")
      .replace(/, ([^,]*)$/, " or $1") +
    ".";

  async function openHistoryItem(item: HistoryItem) {
    if (item.kind === "violation") {
      navigate(`/penalty-reports?report=${encodeURIComponent(item.record.uuid)}`);
      return;
    }
    const reportUUID = item.record.uuid;
    if (
      !reports.some((report) => report.report_uuid === reportUUID) &&
      !historyReports[reportUUID]
    ) {
      // The report can be outside the loaded list (filtered out, or past the
      // 100 most recent): fetch it and hold it beside the list, so the
      // detail doesn't close on a selection it can't resolve and the table
      // still shows only the filtered results.
      setActionBusy("history");
      setError("");
      try {
        const report = await fetchSchoolParkingIncidentReport(
          managedAppId,
          activeSchoolId,
          reportUUID,
        );
        const objectKeys = (report.media_assets ?? [])
          .map((asset) => asset.object_key?.trim() ?? "")
          .filter(Boolean);
        if (objectKeys.length > 0) {
          try {
            const signed = await signSchoolMedia(
              report.school_id || activeSchoolId,
              objectKeys,
            );
            setSignedUrls((current) => ({ ...current, ...signed }));
          } catch {
            // The report still opens; its photo shows as unavailable.
          }
        }
        setHistoryReports((current) => ({
          ...current,
          [report.report_uuid]: report,
        }));
      } catch (nextError) {
        setError(getErrorMessage(nextError));
        return;
      } finally {
        setActionBusy("");
      }
    }
    setHistoryOpen(false);
    setSelectedReportId(reportUUID);
    setDetailOpen(true);
  }

  useEffect(() => {
    if (!expandedPhotoUrl) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExpandedPhotoUrl("");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedPhotoUrl]);

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
                <h2 className="cd-sidebar-title">
                  {detailOpen && selectedReport
                    ? "Parking Report Details"
                    : "Parking Reports"}
                </h2>
              </div>
            </div>
            <div className="parking-reports-actions">
              {!detailOpen ? (
                <>
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
                    onClick={openFilterModal}
                  >
                    Filter table
                    {activeFilterCount > 0 ? (
                      <span className="parking-report-filter-count">
                        {activeFilterCount}
                      </span>
                    ) : null}
                  </button>
                  {statusFilter === "all" && closedReportCount > 0 ? (
                    <button
                      className={`cd-table-btn${showClosed ? " cd-table-btn-active" : ""}`}
                      type="button"
                      onClick={() => setShowClosed((current) => !current)}
                    >
                      {showClosed
                        ? "Hide closed"
                        : `Show closed (${closedReportCount})`}
                    </button>
                  ) : null}
                </>
              ) : null}
              <button
                className="secondary-button"
                type="button"
                onClick={() => void refreshReports()}
              >
                {loadBusy ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
        </div>

        <div className="parking-reports-body">
          {error ? <div className="form-error">{error}</div> : null}

          {!detailOpen ? (
            <div className="parking-reports-student-note">
              <span className="parking-reports-student-note-icon" aria-hidden="true">
                ℹ️
              </span>
              <div>
                <strong>Student-submitted reports.</strong> These are unverified
                reports from students — not confirmed violations. Review the
                evidence before assigning responsibility or issuing an official
                violation.
              </div>
            </div>
          ) : null}

          {!detailOpen ? (
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
                      <th>Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReports.map((report) => {
                      const incidentKey = getMediaObjectKey(
                        report,
                        "incident_photo",
                      );
                      const incidentUrl = incidentKey
                        ? signedUrls[incidentKey]
                        : "";
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
                          : undefined) ??
                        studentByUser.get(report.reporter_user_uuid);
                      const reporterAvatar = reporterEntry?.user.k_guid
                        ? studentProfilePhotoUrls[reporterEntry.user.k_guid]
                        : "";
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
                          onClick={() => {
                            setSelectedReportId(report.report_uuid);
                            setDetailOpen(true);
                          }}
                        >
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
                                    <div className="parking-report-status-stack">
                                      <span
                                        className={`cd-status ${getReportStatusClass(
                                          report.status,
                                        )}`}
                                      >
                                        {formatStatus(report.status)}
                                      </span>
                                      {report.flagged_for_enforcement ? (
                                        <span className="cd-status cd-status-declined">
                                          {report.flag_priority === "urgent"
                                            ? "Urgent flag"
                                            : "Flagged"}
                                        </span>
                                      ) : null}
                                      {report.assigned_user_uuid ? (
                                        <span className="cd-tag">
                                          {report.assignment_source === "tag"
                                            ? "Tag match"
                                            : "Assigned"}
                                        </span>
                                      ) : report.scanned_pass_uuid ? (
                                        <span className="cd-tag">ID tag</span>
                                      ) : null}
                                    </div>
                                  </td>
                          <td className="cd-table-date">
                            {formatDateTime(report.created_at)}
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
          ) : null}

          {detailOpen && selectedReport ? (
            <>
              <div className="cd-detail-back-bar parking-report-detail-back-bar">
                <button
                  type="button"
                  className="cd-detail-back-btn"
                  onClick={() => setDetailOpen(false)}
                >
                  ← Parking Reports
                </button>
                <span className="cd-detail-back-label">
                  {filteredReports.length.toLocaleString()} report
                  {filteredReports.length !== 1 ? "s" : ""}
                </span>
              </div>
              <article className="penalty-report-detail parking-report-detail-section parking-report-detail-screen prd">
                <header className="prd-header">
                  <div className="prd-header-copy">
                    <p className="eyebrow">
                      Parking report · Submitted{" "}
                      {formatDateTime(selectedReport.created_at)}
                    </p>
                    <h3>{formatStatus(selectedReport.report_type)}</h3>
                    <div className="prd-chips">
                      <span
                        className={`cd-status ${getReportStatusClass(
                          selectedReport.status,
                        )}`}
                      >
                        {formatStatus(selectedReport.status)}
                      </span>
                      {selectedReport.flagged_for_enforcement ? (
                        <span className="cd-status cd-status-declined">
                          {selectedReport.flag_priority === "urgent"
                            ? "Urgent enforcement flag"
                            : "Flagged for enforcement"}
                        </span>
                      ) : null}
                      {selectedReport.linked_violation_uuid ? (
                        <span className="cd-status cd-status-approved">
                          Violation issued
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="danger-button"
                    disabled={actionBusy === "delete"}
                    onClick={() => void deleteSelectedReport()}
                  >
                    {actionBusy === "delete" ? "Deleting..." : "Delete report"}
                  </button>
                </header>

                {historyCount > 0 ? (
                  <div className="prd-history">
                    <button
                      type="button"
                      className="prd-history-summary"
                      aria-expanded={historyOpen}
                      onClick={() => setHistoryOpen((current) => !current)}
                    >
                      <span className="prd-history-icon" aria-hidden="true">
                        !
                      </span>
                      <span>
                        <strong>Seen before:</strong> {historySummary}
                      </span>
                      <span className="prd-history-toggle">
                        {historyOpen ? "Hide" : "Show"}
                      </span>
                    </button>
                    {historyOpen ? (
                      <ul className="prd-history-list">
                        {historyItems.map((item) => (
                          <li key={`${item.kind}-${item.record.uuid}`}>
                            <button
                              type="button"
                              className="prd-history-item"
                              disabled={actionBusy === "history"}
                              onClick={() => void openHistoryItem(item)}
                            >
                              <span className="prd-history-kind">
                                {item.kind === "violation"
                                  ? "Violation"
                                  : "Report"}
                              </span>
                              <span className="prd-history-title">
                                {formatStatus(item.record.type || "other")}
                                <small>
                                  {formatDateTime(item.record.created_at)} ·{" "}
                                  {formatStatus(item.record.status)}
                                </small>
                              </span>
                              <span className="prd-history-matches">
                                {item.record.matched_on.map((match) => (
                                  <span key={match} className="cd-tag">
                                    Same {match === "vehicle" ? "vehicle" : match === "tag" ? "ID tag" : "student"}
                                  </span>
                                ))}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                <div className="prd-layout">
                  <section className="prd-evidence" aria-label="Evidence">
                    {incidentPhotoUrl ? (
                      <button
                        type="button"
                        className="prd-photo"
                        onClick={() => setExpandedPhotoUrl(incidentPhotoUrl)}
                        aria-label="Expand incident photo"
                      >
                        <img src={incidentPhotoUrl} alt="Incident evidence" />
                        <span className="prd-photo-hint">Click to expand</span>
                      </button>
                    ) : (
                      <div className="parking-report-evidence-empty">
                        No incident photo available.
                      </div>
                    )}
                    {qrPhotoUrl ? (
                      <button
                        type="button"
                        className="prd-photo-secondary"
                        onClick={() => setExpandedPhotoUrl(qrPhotoUrl)}
                      >
                        <img src={qrPhotoUrl} alt="" />
                        <span>Device QR photo (older report)</span>
                      </button>
                    ) : null}

                    <div className="prd-block">
                      <p className="vr-block-label">What the reporter said</p>
                      <p className="prd-description">
                        {selectedReport.description || "No description."}
                      </p>
                    </div>

                    <dl className="prd-facts">
                      <div>
                        <dt>Location</dt>
                        <dd>
                          {formatLocationValue(selectedReport)}
                          {selectedReport.location_accuracy_meters ? (
                            <small>
                              {" "}
                              ±
                              {Math.round(
                                selectedReport.location_accuracy_meters,
                              )}
                              m
                            </small>
                          ) : null}
                          {mapUrl ? (
                            <a href={mapUrl} target="_blank" rel="noreferrer">
                              Open map
                            </a>
                          ) : null}
                        </dd>
                      </div>
                      {selectedReport.pack_uuid ? (
                        <div>
                          <dt>Pack</dt>
                          <dd>{selectedReport.pack_uuid}</dd>
                        </div>
                      ) : null}
                      {selectedReport.spot_uuid ? (
                        <div>
                          <dt>Spot</dt>
                          <dd>{selectedReport.spot_uuid}</dd>
                        </div>
                      ) : null}
                      <div>
                        <dt>Last updated</dt>
                        <dd>{formatDateTime(selectedReport.updated_at)}</dd>
                      </div>
                      <div>
                        <dt>Report ID</dt>
                        <dd className="prd-mono">{selectedReport.report_uuid}</dd>
                      </div>
                    </dl>

                    <div className="prd-block">
                      <p className="vr-block-label">People and vehicle</p>
                      <ul className="prd-people">
                        <li>
                          <span className="prd-people-role">Reported by</span>
                          <span className="prd-people-name">
                            {selectedReporterAvatar ? (
                              <img
                                className="cd-table-avatar"
                                src={selectedReporterAvatar}
                                alt=""
                              />
                            ) : null}
                            {getReporterLabel(
                              selectedReport,
                              studentByMembership,
                              studentByUser,
                            )}
                            {selectedReporter?.membership.student_id ? (
                              <small>
                                ID {selectedReporter.membership.student_id}
                              </small>
                            ) : null}
                          </span>
                          {selectedReporter ? (
                            <button
                              type="button"
                              className="prd-link"
                              onClick={() =>
                                onOpenStudent(
                                  selectedReporter.membership.membership_uuid,
                                )
                              }
                            >
                              View student
                            </button>
                          ) : null}
                        </li>
                        <li>
                          <span className="prd-people-role">ID tag</span>
                          <span className="prd-people-name">
                            {selectedReport.scanned_pass_uuid ? (
                              <>
                                <span className="prd-mono">
                                  {selectedReport.scanned_pass_uuid.slice(0, 8)}
                                </span>
                                {scannedPass ? (
                                  <span
                                    className={`cd-status ${
                                      scannedPass.status === "active"
                                        ? "cd-status-approved"
                                        : "cd-status-inactive"
                                    }`}
                                  >
                                    {describePassStatus(scannedPass)}
                                  </span>
                                ) : null}
                                <HistoryBadge count={historyCounts.tag} />
                              </>
                            ) : (
                              <span className="muted">Not scanned</span>
                            )}
                          </span>
                          {selectedReport.scanned_pass_uuid ? (
                            <button
                              type="button"
                              className="prd-link"
                              onClick={() =>
                                navigate(
                                  `/device-tags?pass=${encodeURIComponent(
                                    selectedReport.scanned_pass_uuid ?? "",
                                  )}`,
                                )
                              }
                            >
                              View tag
                            </button>
                          ) : null}
                        </li>
                        {scannedPass?.user_uuid ? (
                          <li>
                            <span className="prd-people-role">
                              {scannedPass.status === "active"
                                ? "Tag belongs to"
                                : "Tag last registered to"}
                            </span>
                            <span className="prd-people-name">
                              {tagStudent
                                ? getStudentLabel(tagStudent)
                                : "A student not at this school"}
                              {tagStudent?.membership.student_id ? (
                                <small>
                                  ID {tagStudent.membership.student_id}
                                </small>
                              ) : null}
                              {context?.student_user_uuid ===
                              scannedPass.user_uuid ? (
                                <HistoryBadge count={historyCounts.student} />
                              ) : null}
                            </span>
                            {tagStudent ? (
                              <button
                                type="button"
                                className="prd-link"
                                onClick={() =>
                                  onOpenStudent(
                                    tagStudent.membership.membership_uuid,
                                  )
                                }
                              >
                                View student
                              </button>
                            ) : null}
                          </li>
                        ) : null}
                        {responsibleStudent &&
                        responsibleStudent.user.k_guid !==
                          tagStudent?.user.k_guid ? (
                          <li>
                            <span className="prd-people-role">Responsible</span>
                            <span className="prd-people-name">
                              {getStudentLabel(responsibleStudent)}
                              {responsibleStudent.membership.student_id ? (
                                <small>
                                  ID {responsibleStudent.membership.student_id}
                                </small>
                              ) : null}
                              <HistoryBadge count={historyCounts.student} />
                            </span>
                            <button
                              type="button"
                              className="prd-link"
                              onClick={() =>
                                onOpenStudent(
                                  responsibleStudent.membership.membership_uuid,
                                )
                              }
                            >
                              View student
                            </button>
                          </li>
                        ) : null}
                        <li>
                          <span className="prd-people-role">Vehicle</span>
                          <span className="prd-people-name">
                            {vehicleEntry ? (
                              getDeviceLabel(vehicleEntry)
                            ) : vehicleUUID ? (
                              <span className="prd-mono">
                                {vehicleUUID.slice(0, 8)}
                              </span>
                            ) : (
                              <span className="muted">Not identified</span>
                            )}
                            {vehicleUUID ? (
                              <HistoryBadge count={historyCounts.vehicle} />
                            ) : null}
                          </span>
                          {vehicleUUID ? (
                            <button
                              type="button"
                              className="prd-link"
                              onClick={() =>
                                onOpenStudentDevice(
                                  vehicleEntry?.student.membership
                                    ?.membership_uuid ??
                                    responsibleStudent?.membership
                                      .membership_uuid ??
                                    "",
                                  vehicleUUID,
                                )
                              }
                            >
                              View vehicle
                            </button>
                          ) : null}
                        </li>
                      </ul>
                      {contextError ? (
                        <p className="muted">
                          Couldn&apos;t load the tag and history: {contextError}
                        </p>
                      ) : null}
                    </div>
                  </section>

                  <section className="prd-manage" aria-label="Manage">
                    <div className="prd-card">
                      <p className="vr-block-label">Responsible student</p>
                      {isTagMatch ? (
                        <div className="prd-callout">
                          <strong>Matched from the scanned ID tag.</strong>{" "}
                          {responsibleStudent
                            ? getStudentLabel(responsibleStudent)
                            : "This student"}{" "}
                          hasn&apos;t been notified and can&apos;t see this
                          report until you confirm.
                        </div>
                      ) : null}
                      {!selectedReport.assigned_user_uuid &&
                      tagStudent &&
                      assignedUserDraft !== tagStudent.user.k_guid ? (
                        <div className="prd-callout">
                          The ID tag {scannedPass?.status === "active" ? "belongs" : "was last registered"} to{" "}
                          <strong>{getStudentLabel(tagStudent)}</strong>.{" "}
                          <button
                            type="button"
                            className="prd-link"
                            onClick={() => {
                              setAssignedUserDraft(tagStudent.user.k_guid);
                              setAssignedDeviceDraft(
                                scannedPass?.registered_device_uuid ?? "",
                              );
                            }}
                          >
                            Use this student
                          </button>
                        </div>
                      ) : null}
                      <div className="penalty-report-form-grid">
                        <label className="field">
                          <span>Student</span>
                          <select
                            value={assignedUserDraft}
                            onChange={(event) => {
                              setAssignedUserDraft(event.target.value);
                              setAssignedDeviceDraft("");
                            }}
                          >
                            <option value="">Choose a student</option>
                            {studentRoster.map((entry) => (
                              <option
                                key={entry.membership.membership_uuid}
                                value={entry.user.k_guid}
                              >
                                {getStudentLabel(entry)}
                                {entry.membership.student_id
                                  ? ` · ${entry.membership.student_id}`
                                  : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Vehicle</span>
                          <select
                            value={assignedDeviceDraft}
                            onChange={(event) =>
                              setAssignedDeviceDraft(event.target.value)
                            }
                            disabled={!assignedUserDraft}
                          >
                            <option value="">No vehicle selected</option>
                            {assignmentDraftDevices.map((entry) => (
                              <option
                                key={entry.device.registered_device_uuid}
                                value={entry.device.registered_device_uuid}
                              >
                                {getDeviceLabel(entry)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="penalty-report-form-grid">
                        <label className="field">
                          <span>Consequence</span>
                          <select
                            value={responsibilityConsequenceDraft}
                            onChange={(event) =>
                              setResponsibilityConsequenceDraft(
                                event.target
                                  .value as ParkingIncidentResponsibilityConsequence,
                              )
                            }
                          >
                            <option value="none">None yet</option>
                            <option value="points">Point loss</option>
                            <option value="fine">Fine</option>
                          </select>
                        </label>
                        {responsibilityConsequenceDraft === "points" ? (
                          <label className="field">
                            <span>Points lost</span>
                            <input
                              inputMode="numeric"
                              value={responsibilityPointsDraft}
                              onChange={(event) =>
                                setResponsibilityPointsDraft(event.target.value)
                              }
                              placeholder="10"
                            />
                          </label>
                        ) : null}
                        {responsibilityConsequenceDraft === "fine" ? (
                          <label className="field">
                            <span>Fine amount</span>
                            <input
                              inputMode="decimal"
                              value={responsibilityFineDollarsDraft}
                              onChange={(event) =>
                                setResponsibilityFineDollarsDraft(
                                  event.target.value,
                                )
                              }
                              placeholder="25.00"
                            />
                          </label>
                        ) : null}
                      </div>
                      <details className="prd-more">
                        <summary>Notes</summary>
                        <label className="field">
                          <span>Assignment note</span>
                          <textarea
                            value={assignmentNoteDraft}
                            onChange={(event) =>
                              setAssignmentNoteDraft(event.target.value)
                            }
                            rows={2}
                          />
                        </label>
                        <label className="field">
                          <span>Consequence note</span>
                          <textarea
                            value={responsibilityNoteDraft}
                            onChange={(event) =>
                              setResponsibilityNoteDraft(event.target.value)
                            }
                            rows={2}
                            placeholder="Why this student, or why this consequence."
                          />
                        </label>
                      </details>
                      <div className="penalty-report-actions">
                        <button
                          type="button"
                          className="primary-button"
                          disabled={
                            actionBusy === "assignment" || !assignedUserDraft
                          }
                          onClick={() => void saveAssignment()}
                        >
                          {actionBusy === "assignment"
                            ? "Saving..."
                            : isTagMatch &&
                                assignedUserDraft ===
                                  selectedReport.assigned_user_uuid
                              ? "Confirm and notify student"
                              : "Save and notify student"}
                        </button>
                      </div>
                    </div>

                    <div className="prd-card">
                      <p className="vr-block-label">Status and notes</p>
                      <div className="vr-status-grid">
                        {statusOptions
                          .filter((status) => status !== "all")
                          .map((status) => (
                            <button
                              key={status}
                              type="button"
                              className={`vr-status-btn vr-status-btn-${status.replace(
                                /_/g,
                                "-",
                              )}${
                                statusDraft === status
                                  ? " vr-status-btn-active"
                                  : ""
                              }`}
                              onClick={() =>
                                setStatusDraft(
                                  status as ParkingIncidentReportStatus,
                                )
                              }
                            >
                              <span className="vr-status-dot" />
                              {formatStatus(status)}
                            </button>
                          ))}
                      </div>
                      <label className="field">
                        <span>Internal notes</span>
                        <textarea
                          value={adminNotesDraft}
                          onChange={(event) =>
                            setAdminNotesDraft(event.target.value)
                          }
                          rows={2}
                        />
                      </label>
                      <label className="field">
                        <span>Note to the reporter</span>
                        <textarea
                          value={studentNoteDraft}
                          onChange={(event) =>
                            setStudentNoteDraft(event.target.value)
                          }
                          rows={2}
                        />
                      </label>
                      <div className="penalty-report-actions">
                        <button
                          type="button"
                          className="primary-button"
                          disabled={saveBusy}
                          onClick={() => void saveSelectedReport()}
                        >
                          {saveBusy ? "Saving..." : "Save status"}
                        </button>
                      </div>
                    </div>

                    <div className="prd-card">
                      <p className="vr-block-label">Enforcement</p>
                      {selectedReport.flagged_for_enforcement ? (
                        <div className="prd-row">
                          <span>
                            Flagged
                            {selectedReport.flag_priority === "urgent"
                              ? " (urgent)"
                              : ""}
                            {selectedReport.flag_note
                              ? `: ${selectedReport.flag_note}`
                              : ""}
                          </span>
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={actionBusy === "clear-flag"}
                            onClick={() => void clearFlag()}
                          >
                            {actionBusy === "clear-flag"
                              ? "Clearing..."
                              : "Clear flag"}
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="penalty-report-form-grid">
                            <label className="field">
                              <span>Priority</span>
                              <select
                                value={flagPriorityDraft}
                                onChange={(event) =>
                                  setFlagPriorityDraft(
                                    event.target.value === "urgent"
                                      ? "urgent"
                                      : "normal",
                                  )
                                }
                              >
                                <option value="normal">Normal</option>
                                <option value="urgent">Urgent</option>
                              </select>
                            </label>
                            <label className="field">
                              <span>Note for officers</span>
                              <input
                                value={flagNoteDraft}
                                onChange={(event) =>
                                  setFlagNoteDraft(event.target.value)
                                }
                                placeholder="What should enforcement know?"
                              />
                            </label>
                          </div>
                          <div className="penalty-report-actions">
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={actionBusy === "flag"}
                              onClick={() => void saveFlag()}
                            >
                              {actionBusy === "flag"
                                ? "Flagging..."
                                : "Flag for enforcement"}
                            </button>
                          </div>
                        </>
                      )}

                      <div className="prd-row prd-violation-row">
                        {selectedReport.linked_violation_uuid ? (
                          <>
                            <span>
                              Official violation issued{" "}
                              {formatDateTime(selectedReport.violation_issued_at)}
                            </span>
                            <button
                              type="button"
                              className="prd-link"
                              onClick={() =>
                                navigate(
                                  `/penalty-reports?report=${encodeURIComponent(
                                    selectedReport.linked_violation_uuid ?? "",
                                  )}`,
                                )
                              }
                            >
                              View violation
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="muted">
                              {!selectedReport.assigned_user_uuid
                                ? "Choose a responsible student to issue a violation."
                                : isTagMatch
                                  ? "Confirm the responsible student to issue a violation."
                                  : "Ready to ticket the responsible student."}
                            </span>
                            <button
                              type="button"
                              className="primary-button"
                              disabled={
                                !selectedReport.assigned_user_uuid || isTagMatch
                              }
                              onClick={() => setIssueModalOpen(true)}
                            >
                              Issue violation
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              </article>
            </>
          ) : detailOpen ? (
            <>
              <div className="cd-detail-back-bar parking-report-detail-back-bar">
                <button
                  type="button"
                  className="cd-detail-back-btn"
                  onClick={() => setDetailOpen(false)}
                >
                  ← Parking Reports
                </button>
                <span className="cd-detail-back-label">
                  {filteredReports.length.toLocaleString()} report
                  {filteredReports.length !== 1 ? "s" : ""}
                </span>
              </div>
              <article className="penalty-report-detail penalty-report-detail-empty parking-report-detail-section parking-report-detail-screen">
                <strong>Select a report to review</strong>
                <p className="muted-text">
                  Choose a parking report from the table to view evidence,
                  context, and review actions.
                </p>
              </article>
            </>
          ) : null}
        </div>
      </div>

              {expandedPhotoUrl ? (
                <div
                  className="prd-lightbox"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Incident photo"
                  onClick={() => setExpandedPhotoUrl("")}
                >
                  <img
                    src={expandedPhotoUrl}
                    alt="Incident evidence, full size"
                    onClick={(event) => event.stopPropagation()}
                  />
                  <div className="prd-lightbox-actions">
                    <a
                      href={expandedPhotoUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                    >
                      Open original
                    </a>
                    <button type="button" onClick={() => setExpandedPhotoUrl("")}>
                      Close
                    </button>
                  </div>
                </div>
              ) : null}

              {filterModalOpen ? (
                <div
          className="management-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="parking-report-filter-title"
          onClick={() => setFilterModalOpen(false)}
        >
          <div
            className="management-modal-sheet parking-report-filter-modal"
            onClick={(event) => event.stopPropagation()}
          >
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
                onClick={() => setFilterModalOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="parking-report-filter-grid">
              <div className="parking-report-filter-group">
                <span className="parking-report-filter-label">Status</span>
                <div className="parking-report-filter-chips">
                  {statusOptions.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={`parking-report-filter-chip${
                        draftStatusFilter === status
                          ? " parking-report-filter-chip-active"
                          : ""
                      }`}
                      aria-pressed={draftStatusFilter === status}
                      onClick={() => setDraftStatusFilter(status)}
                    >
                      {status === "all" ? "All statuses" : formatStatus(status)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="parking-report-filter-group">
                <span className="parking-report-filter-label">Report type</span>
                <div className="parking-report-filter-chips">
                  {reportTypeOptions.map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={`parking-report-filter-chip${
                        draftTypeFilter === type
                          ? " parking-report-filter-chip-active"
                          : ""
                      }`}
                      aria-pressed={draftTypeFilter === type}
                      onClick={() => setDraftTypeFilter(type)}
                    >
                      {type === "all" ? "All types" : formatStatus(type)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="parking-report-filter-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={resetFilterModal}
              >
                Reset
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={applyFilterModal}
              >
                Apply filters
              </button>
            </div>
          </div>
                </div>
              ) : null}

              {issueModalOpen && selectedReport ? (
                <div
                  className="management-modal-backdrop"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="parking-report-issue-title"
                  onClick={() => setIssueModalOpen(false)}
                >
                  <div
                    className="management-modal-sheet parking-report-filter-modal"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="management-modal-header">
                      <div>
                        <p className="section-eyebrow">Official enforcement</p>
                        <h3 id="parking-report-issue-title">
                          Issue parking violation
                        </h3>
                        <p className="muted">
                          This creates a formal parking violation and notifies the
                          responsible student through the normal ticket flow.
                        </p>
                      </div>
                      <button
                        className="management-modal-close"
                        type="button"
                        onClick={() => setIssueModalOpen(false)}
                      >
                        Close
                      </button>
                    </div>
                    <div className="parking-report-filter-grid">
                      <label>
                        Violation type
                        <select
                          value={issueViolationType}
                          onChange={(event) => {
                            const nextType = event.target.value;
                            setIssueViolationType(nextType);
                            const rule = activeFeeRules.find(
                              (item) => item.violation_type === nextType,
                            );
                            if (rule) {
                              setIssueAmountDollars(centsToDollars(rule.amount_cents));
                            }
                          }}
                        >
                          <option value="other">Other</option>
                          {activeFeeRules.map((rule) => (
                            <option
                              key={rule.fee_rule_uuid}
                              value={rule.violation_type}
                            >
                              {rule.label || formatStatus(rule.violation_type)} · $
                              {centsToDollars(rule.amount_cents)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Status
                        <select
                          value={issueStatus}
                          onChange={(event) => setIssueStatus(event.target.value)}
                        >
                          <option value="reported">Reported</option>
                          <option value="awaiting_payment">Awaiting payment</option>
                          <option value="under_review">Under review</option>
                        </select>
                      </label>
                      <label>
                        Fee / punishment amount
                        <input
                          value={issueAmountDollars}
                          onChange={(event) =>
                            setIssueAmountDollars(event.target.value)
                          }
                          placeholder="0.00"
                          inputMode="decimal"
                        />
                      </label>
                      <label>
                        Student note
                        <input
                          value={issueStudentNote}
                          onChange={(event) =>
                            setIssueStudentNote(event.target.value)
                          }
                          placeholder="Visible to the student"
                        />
                      </label>
                    </div>
                    <label className="field">
                      <span>Internal admin notes</span>
                      <textarea
                        value={issueAdminNotes}
                        onChange={(event) => setIssueAdminNotes(event.target.value)}
                        rows={4}
                      />
                    </label>
                    <div className="parking-report-filter-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => setIssueModalOpen(false)}
                      >
                        Cancel
                      </button>
                      <button
                        className="primary-button"
                        type="button"
                        disabled={actionBusy === "issue"}
                        onClick={() => void issueViolation()}
                      >
                        {actionBusy === "issue"
                          ? "Issuing..."
                          : "Issue violation"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        }
