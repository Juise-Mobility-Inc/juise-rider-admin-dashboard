import { useEffect, useMemo, useState } from "react";

import {
  fetchMyEnforcementOfficerMemberships,
  fetchSchools,
  fetchSchoolStudentRoster,
  type School,
  type SchoolStudentRosterEntry,
} from "../../lib/api";
import { PenaltyReportsScreen } from "./PenaltyReportsScreen";

type Props = {
  managedAppId: string;
  userUuid: string;
  onLogout: () => void;
};

const noop = () => undefined;

// The whole dashboard for an officer-only account: pick one of their
// schools, then view that school's parking violations, read-only. The
// backend refuses officers everything else the dashboard does.
export function OfficerViolationsView({
  managedAppId,
  userUuid,
  onLogout,
}: Props) {
  const [schoolIds, setSchoolIds] = useState<string[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [roster, setRoster] = useState<SchoolStudentRosterEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchMyEnforcementOfficerMemberships(managedAppId, userUuid),
      fetchSchools(managedAppId).catch(() => [] as School[]),
    ])
      .then(([memberships, allSchools]) => {
        if (cancelled) return;
        const ids = [
          ...new Set(
            memberships
              .map((membership) => membership.school_id.trim())
              .filter(Boolean),
          ),
        ];
        setSchoolIds(ids);
        setSchools(allSchools);
        setSchoolId((current) =>
          ids.includes(current) ? current : ids.length === 1 ? ids[0] : "",
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Unable to load your schools.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [managedAppId, userUuid]);

  useEffect(() => {
    // The violations list only renders once a school is chosen.
    if (!schoolId) return;
    let cancelled = false;
    fetchSchoolStudentRoster(managedAppId, schoolId)
      .then((entries) => {
        if (!cancelled) setRoster(entries);
      })
      .catch(() => {
        if (!cancelled) setRoster([]);
      });
    return () => {
      cancelled = true;
    };
  }, [managedAppId, schoolId]);

  const schoolName = useMemo(() => {
    const byId = new Map(schools.map((school) => [school.school_id, school]));
    return (id: string) => byId.get(id)?.title || byId.get(id)?.name || id;
  }, [schools]);

  return (
    <div className="officer-violations-shell">
      <header className="officer-violations-header">
        <div>
          <p className="eyebrow">Enforcement officer · view only</p>
          <h2>{schoolId ? schoolName(schoolId) : "Parking violations"}</h2>
        </div>
        <div className="officer-violations-actions">
          {schoolIds.length > 1 ? (
            <select
              value={schoolId}
              onChange={(event) => setSchoolId(event.target.value)}
              aria-label="School"
            >
              <option value="" disabled>
                Choose a school
              </option>
              {schoolIds.map((id) => (
                <option key={id} value={id}>
                  {schoolName(id)}
                </option>
              ))}
            </select>
          ) : null}
          <button className="text-button" type="button" onClick={onLogout}>
            Sign Out
          </button>
        </div>
      </header>

      {loading ? (
        <p className="muted-text">Loading your schools…</p>
      ) : loadError ? (
        <p className="error-text">{loadError}</p>
      ) : schoolIds.length === 0 ? (
        <p className="empty-state">
          Your account isn&apos;t assigned to a school yet. Ask a school admin
          to add you on their Staff &amp; Access page.
        </p>
      ) : !schoolId ? (
        <p className="empty-state">Choose a school to view its violations.</p>
      ) : (
        <PenaltyReportsScreen
          key={schoolId}
          activeSchoolId={schoolId}
          managedAppId={managedAppId}
          studentRoster={roster}
          studentProfilePhotoUrls={{}}
          onOpenStudent={noop}
          onOpenStudentDevice={noop}
          readOnly
        />
      )}
    </div>
  );
}
