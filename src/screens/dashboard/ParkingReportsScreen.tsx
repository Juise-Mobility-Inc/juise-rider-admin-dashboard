import { useCallback, useEffect, useMemo, useState } from "react";

import {
  assignSchoolParkingIncidentReport,
  clearSchoolParkingIncidentReportFlag,
  fetchParkingViolationFeeRules,
  fetchSchoolParkingIncidentReports,
  fetchSchoolRegisteredDevices,
  flagSchoolParkingIncidentReport,
  issueSchoolParkingIncidentReportViolation,
  signSchoolMedia,
  type ParkingIncidentResponsibilityConsequence,
  type ParkingViolationFeeRule,
  type ParkingIncidentReportStatus,
  type ParkingIncidentReportType,
  type RegisteredDeviceReviewEntry,
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

function centsToDollars(value: number): string {
  return (value / 100).toFixed(2);
}

export function ParkingReportsScreen({
  activeSchoolId,
  managedAppId,
  studentRoster,
  studentProfilePhotoUrls,
  onOpenStudent,
  onOpenReportCountChange,
}: Props) {
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
  const [detailTab, setDetailTab] = useState<"evidence" | "details" | "review">(
    "evidence",
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [reports, setReports] = useState<StudentParkingIncidentReport[]>([]);
  const [selectedReportId, setSelectedReportId] = useState("");
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
      reports.find((report) => report.report_uuid === selectedReportId) ?? null,
    [reports, selectedReportId],
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
    setDetailTab("evidence");
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
      setReports((current) => {
        const nextReports = current.map((report) =>
          report.report_uuid === updated.report_uuid ? updated : report,
        );
        if (statusFilter === "all" && typeFilter === "all") {
          onOpenReportCountChange?.(countOpenReports(nextReports));
        }
        return nextReports;
      });
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setSaveBusy(false);
    }
  }

  function replaceReport(updated: StudentParkingIncidentReport) {
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
  const selectedAssignedStudentLabel =
    selectedAssignedStudent && selectedReport
      ? getReporterLabel(
          {
            ...selectedReport,
            reporter_user_uuid: selectedAssignedStudent.user.k_guid,
            reporter_membership_uuid:
              selectedAssignedStudent.membership.membership_uuid,
          },
          studentByMembership,
          studentByUser,
        )
      : selectedReport?.assigned_user_uuid || "";
  const assignmentDraftStudent = assignedUserDraft
    ? studentByUser.get(assignedUserDraft)
    : undefined;
  const assignmentDraftDevices = registeredDevices.filter(
    (entry) => entry.device.user_uuid === assignedUserDraft,
  );
  const activeFeeRules = feeRules.filter((rule) => rule.active !== false);
  const linkedViolationLabel = selectedReport?.linked_violation_uuid
    ? `Official violation ${selectedReport.linked_violation_uuid}`
    : "";
  const responsibilityConsequenceLabel = selectedReport
    ? selectedReport.responsibility_consequence === "points"
      ? `${selectedReport.responsibility_points_lost ?? 0} point loss`
      : selectedReport.responsibility_consequence === "fine"
        ? `$${((selectedReport.responsibility_fine_cents ?? 0) / 100).toFixed(
            2,
          )} fine`
        : "No punishment"
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
                                        <span className="cd-tag">Assigned</span>
                                      ) : null}
                                    </div>
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
              <article className="penalty-report-detail parking-report-detail-section parking-report-detail-screen">
                <div className="penalty-report-detail-header">
                  <div>
                    <p className="eyebrow">Parking report</p>
                    <h3>{formatStatus(selectedReport.report_type)}</h3>
                    <p className="muted">
                      Submitted {formatDateTime(selectedReport.created_at)}
                    </p>
                  </div>
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
                        </div>

                <div className="penalty-report-detail-grid">
                  <div className="penalty-report-student-card">
                    <div className="penalty-report-student-avatar">
                      {selectedReporterAvatar ? (
                        <img src={selectedReporterAvatar} alt="" />
                      ) : (
                        getInitials(
                          getReporterLabel(
                            selectedReport,
                            studentByMembership,
                            studentByUser,
                          ),
                        )
                      )}
                    </div>
                    <div className="penalty-report-student-copy">
                      <span>Reporter</span>
                      <strong>
                        {getReporterLabel(
                          selectedReport,
                          studentByMembership,
                          studentByUser,
                        )}
                      </strong>
                      <small>
                        Student ID{" "}
                        {selectedReporter?.membership.student_id || "N/A"}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="secondary-button penalty-report-student-link"
                      disabled={!selectedReporter}
                      onClick={() => {
                        if (selectedReporter) {
                          onOpenStudent(
                            selectedReporter.membership.membership_uuid,
                          );
                        }
                      }}
                    >
                      View Student
                    </button>
                  </div>

                  <div>
                    <span>Report type</span>
                    <strong>{formatStatus(selectedReport.report_type)}</strong>
                  </div>
                  <div>
                    <span>Submitted</span>
                    <strong>{formatDateTime(selectedReport.created_at)}</strong>
                  </div>
                  <div>
                    <span>Updated</span>
                    <strong>{formatDateTime(selectedReport.updated_at)}</strong>
                  </div>
                          <div>
                            <span>Status</span>
                            <strong>{formatStatus(selectedReport.status)}</strong>
                          </div>
                          <div>
                            <span>Responsible student</span>
                            <strong>{selectedAssignedStudentLabel || "Unassigned"}</strong>
                          </div>
                          <div>
                            <span>Consequence</span>
                            <strong>{responsibilityConsequenceLabel || "No punishment"}</strong>
                          </div>
                          <div>
                            <span>Linked violation</span>
                            <strong>{linkedViolationLabel || "None"}</strong>
                          </div>
                          {selectedReport.responsibility_note ? (
                            <div>
                              <span>Consequence note</span>
                              <strong>{selectedReport.responsibility_note}</strong>
                            </div>
                          ) : null}
                          <div className="penalty-report-location-card">
                    <span>Report location</span>
                    <strong>{formatLocationValue(selectedReport)}</strong>
                    {selectedReport.location_accuracy_meters ? (
                      <small>
                        Accuracy{" "}
                        {Math.round(selectedReport.location_accuracy_meters)}m
                      </small>
                    ) : null}
                    {mapUrl ? (
                      <a href={mapUrl} target="_blank" rel="noreferrer">
                        Open in Google Maps
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="penalty-report-detail-tabs">
                  {(["evidence", "details", "review"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className={
                        detailTab === tab
                          ? "penalty-report-detail-tab penalty-report-detail-tab-active"
                          : "penalty-report-detail-tab"
                      }
                      onClick={() => setDetailTab(tab)}
                    >
                      {tab === "evidence"
                        ? "Evidence"
                        : tab === "details"
                          ? "Details"
                          : "Review"}
                    </button>
                  ))}
                </div>

                {detailTab === "evidence" ? (
                  <div className="parking-report-evidence-grid">
                    <div className="parking-report-evidence-card">
                      <div className="penalty-report-media-header">
                        <div>
                          <span>Incident photo</span>
                          <h4>Submitted evidence</h4>
                        </div>
                      </div>
                      {incidentPhotoUrl ? (
                        <img src={incidentPhotoUrl} alt="Incident evidence" />
                      ) : (
                        <div className="parking-report-evidence-empty">
                          No signed incident photo available.
                        </div>
                      )}
                    </div>
                    <div className="parking-report-evidence-card">
                      <div className="penalty-report-media-header">
                        <div>
                          <span>Device QR photo</span>
                          <h4>Optional identifier</h4>
                        </div>
                      </div>
                      {qrPhotoUrl ? (
                        <img src={qrPhotoUrl} alt="Device QR evidence" />
                      ) : (
                        <div className="parking-report-evidence-empty">
                          No QR photo attached.
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

                {detailTab === "details" ? (
                  <div className="penalty-report-detail-grid parking-report-info-grid">
                    <div className="parking-report-full-card">
                      <span>Description</span>
                      <p>{selectedReport.description}</p>
                    </div>
                    <div>
                      <span>Pack</span>
                      <strong>{selectedReport.pack_uuid || "N/A"}</strong>
                    </div>
                    <div>
                      <span>Spot</span>
                      <strong>{selectedReport.spot_uuid || "N/A"}</strong>
                    </div>
                    <div>
                      <span>Reservation</span>
                      <strong>
                        {selectedReport.reservation_uuid || "N/A"}
                      </strong>
                    </div>
                    <div>
                      <span>Report ID</span>
                      <strong>{selectedReport.report_uuid}</strong>
                    </div>
                    <div>
                      <span>App</span>
                      <strong>{selectedReport.app_id}</strong>
                    </div>
                    <div>
                      <span>School</span>
                      <strong>{selectedReport.school_id}</strong>
                    </div>
                  </div>
                ) : null}

                        {detailTab === "review" ? (
                          <div className="parking-report-review-panel">
                            <div className="vr-form-block">
                              <p className="vr-block-label">Responsible student</p>
                              <p className="muted">
                                This identifies the student as responsible for the incident
                                and immediately notifies them in the customer app.
                              </p>
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
                                    {studentRoster.map((entry) => {
                                      const name = [
                                        entry.user.first_name,
                                        entry.user.last_name,
                                      ]
                                        .filter(Boolean)
                                        .join(" ")
                                        .trim();
                                      return (
                                        <option
                                          key={entry.membership.membership_uuid}
                                          value={entry.user.k_guid}
                                        >
                                          {name ||
                                            entry.user.username ||
                                            entry.user.email ||
                                            entry.user.k_guid}
                                          {entry.membership.student_id
                                            ? ` · ${entry.membership.student_id}`
                                            : ""}
                                        </option>
                                      );
                                    })}
                                  </select>
                                </label>
                                <label className="field">
                                  <span>Device</span>
                                  <select
                                    value={assignedDeviceDraft}
                                    onChange={(event) =>
                                      setAssignedDeviceDraft(event.target.value)
                                    }
                                    disabled={!assignedUserDraft}
                                  >
                                    <option value="">No device selected</option>
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
                              <label className="field">
                                <span>Assignment note</span>
                                <textarea
                                  value={assignmentNoteDraft}
                                  onChange={(event) =>
                                    setAssignmentNoteDraft(event.target.value)
                                  }
                                  rows={3}
                                />
                              </label>
                              <div className="penalty-report-form-grid">
                                <label className="field">
                                  <span>Student consequence</span>
                                  <select
                                    value={responsibilityConsequenceDraft}
                                    onChange={(event) =>
                                      setResponsibilityConsequenceDraft(
                                        event.target
                                          .value as ParkingIncidentResponsibilityConsequence,
                                      )
                                    }
                                  >
                                    <option value="none">No punishment yet</option>
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
                                        setResponsibilityPointsDraft(
                                          event.target.value,
                                        )
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
                              <label className="field">
                                <span>Consequence note</span>
                                <textarea
                                  value={responsibilityNoteDraft}
                                  onChange={(event) =>
                                    setResponsibilityNoteDraft(event.target.value)
                                  }
                                  rows={3}
                                  placeholder="Explain why this student is responsible or why this punishment was chosen."
                                />
                              </label>
                              {responsibilityConsequenceDraft === "fine" ? (
                                <p className="muted">
                                  Save responsibility first, then use “Issue official
                                  violation” to create the payable ticket for this fine.
                                </p>
                              ) : null}
                              <div className="penalty-report-actions">
                                <button
                                  type="button"
                                  className="primary-button"
                                  disabled={actionBusy === "assignment"}
                                  onClick={() => void saveAssignment()}
                                >
                                  {actionBusy === "assignment"
                                    ? "Saving..."
                                    : "Save responsibility"}
                                </button>
                              </div>
                            </div>

                            <div className="vr-form-block">
                              <p className="vr-block-label">Enforcement flag</p>
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
                                  <span>Flag note</span>
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
                                  className="primary-button"
                                  disabled={actionBusy === "flag"}
                                  onClick={() => void saveFlag()}
                                >
                                  {actionBusy === "flag"
                                    ? "Flagging..."
                                    : "Flag for enforcement"}
                                </button>
                                <button
                                  type="button"
                                  className="secondary-button"
                                  disabled={
                                    actionBusy === "clear-flag" ||
                                    !selectedReport.flagged_for_enforcement
                                  }
                                  onClick={() => void clearFlag()}
                                >
                                  {actionBusy === "clear-flag"
                                    ? "Clearing..."
                                    : "Clear flag"}
                                </button>
                              </div>
                            </div>

                            <div className="vr-form-block">
                              <p className="vr-block-label">Set status</p>
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
                    </div>

                    <div className="penalty-report-form-grid">
                      <label className="field">
                        <span>Internal notes</span>
                        <textarea
                          value={adminNotesDraft}
                          onChange={(event) =>
                            setAdminNotesDraft(event.target.value)
                          }
                          rows={4}
                        />
                      </label>
                      <label className="field">
                        <span>Student-visible note</span>
                        <textarea
                          value={studentNoteDraft}
                          onChange={(event) =>
                            setStudentNoteDraft(event.target.value)
                          }
                          rows={4}
                        />
                      </label>
                    </div>

                            <div className="penalty-report-actions">
                              <button
                        type="button"
                        className="primary-button"
                        disabled={saveBusy}
                        onClick={() => void saveSelectedReport()}
                      >
                                {saveBusy ? "Saving..." : "Save review"}
                              </button>
                              <button
                                type="button"
                                className="secondary-button"
                                disabled={!!selectedReport.linked_violation_uuid}
                                onClick={() => setIssueModalOpen(true)}
                              >
                                {selectedReport.linked_violation_uuid
                                  ? "Violation already issued"
                                  : "Issue official violation"}
                              </button>
                            </div>
                          </div>
                ) : null}
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
