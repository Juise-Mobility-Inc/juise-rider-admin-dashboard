// The one list of parking violation reasons, shared with the Juise e-nforce
// app (keep both in sync). Officers and admins pick one of these; "other"
// carries a short title the person writes themselves (violation_title).

export type ViolationReason = {
  value: string;
  label: string;
  description: string;
};

export const OTHER_VIOLATION_REASON = "other";
export const VIOLATION_TITLE_MAX_LENGTH = 80;

export const VIOLATION_REASONS: ViolationReason[] = [
  {
    value: "blocking_access",
    label: "Blocking Access",
    description:
      "Vehicle is parked indoors or in the middle of a sidewalk, blocking foot or car traffic.",
  },
  {
    value: "expired_identification",
    label: "Expired Identification",
    description: "The ID on the vehicle is no longer valid.",
  },
  {
    value: "no_identification",
    label: "No Identification",
    description: "There is no identification on the vehicle at all.",
  },
  {
    value: "unauthorized_parking",
    label: "Unauthorized Parking",
    description:
      "Vehicle is parked in a spot meant for an e-mobility vehicle, but the spot isn't theirs.",
  },
  {
    value: OTHER_VIOLATION_REASON,
    label: "Other",
    description: "Something else. Give it a short title and describe the issue.",
  },
];

// Older types were folded into the list above by a server migration; these
// keep any stale copy readable.
const LEGACY_REASONS: Record<string, string> = {
  no_permit: "no_identification",
  expired_reservation: "expired_identification",
  wrong_spot: "unauthorized_parking",
};

export function normalizeViolationReason(value?: string | null): string {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return LEGACY_REASONS[normalized] ?? normalized;
}

export function findViolationReason(value?: string | null): ViolationReason | undefined {
  const normalized = normalizeViolationReason(value);
  return VIOLATION_REASONS.find((reason) => reason.value === normalized);
}

function titleCase(value: string): string {
  return value
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// "Blocking Access", "Other: Bike chained to railing", or a readable version
// of a type that isn't on the list.
export function violationReasonLabel(
  violationType?: string | null,
  violationTitle?: string | null,
): string {
  const reason = findViolationReason(violationType);
  const title = violationTitle?.trim() ?? "";
  if (reason?.value === OTHER_VIOLATION_REASON) {
    return title ? `Other: ${title}` : reason.label;
  }
  if (reason) {
    return reason.label;
  }
  return titleCase(violationType?.trim() ?? "");
}
