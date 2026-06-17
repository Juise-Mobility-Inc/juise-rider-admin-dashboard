import type { ChangeEvent, ComponentType, Dispatch, FormEvent, SetStateAction } from "react";
import { Fragment, useEffect, useState } from "react";
import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import {
  PackLocationPicker,
  type PackMapMarker,
  type PackMapPoint,
} from "../../components/PackLocationPicker";

import type {
  SchoolChallenge,
  SchoolChallengeCheckpoint,
  SchoolChallengeParticipantProgress,
} from "../../lib/api";
import {
  csvObjectRow,
  downloadCsv,
  sanitizeCsvFilename,
  type CsvCell,
} from "../../lib/csv";

type ChallengeDraft = {
  challenge_uuid: string;
  challenge_type: "route_metric" | "scavenger_hunt";
  audience_type: "user" | "campaign_group";
  title: string;
  description: string;
  image_url: string;
  metric_type: "distance_miles" | "points";
  target_value: string;
  min_accuracy_meters: string;
  checkpoints: ChallengeCheckpointDraft[];
  start_time: string;
  end_time: string;
  active: boolean;
  repeat_enabled: boolean;
  repeat_interval_value: string;
  repeat_interval_unit: "days" | "weeks";
  repeat_count: string;
};

type ChallengeCheckpointDraft = {
  checkpoint_uuid: string;
  title: string;
  description: string;
  clue: string;
  image_url: string;
  latitude: string;
  longitude: string;
  radius_meters: string;
  prize_points: string;
  sort_order: string;
  active: boolean;
};

type DetailRowComponent = ComponentType<{
  label: string;
  value: string;
}>;

type EntityImagePreviewProps = {
  imageUrl?: string;
  label: string;
  altSuffix?: string;
  fallbackLabel?: string;
};

const challengeExportColumns = [
  "row_type",
  "challenge_uuid",
  "challenge_title",
  "challenge_description",
  "challenge_image_url",
  "challenge_type",
  "challenge_audience_type",
  "challenge_audience_label",
  "challenge_status",
  "challenge_active",
  "challenge_metric_type",
  "challenge_target_value",
  "challenge_target_label",
  "challenge_checkpoint_count",
  "challenge_start_time",
  "challenge_end_time",
  "summary_joined_count",
  "summary_completed_count",
  "summary_completion_rate_percent",
  "participant_type",
  "participant_name",
  "participant_identifier",
  "participant_status",
  "participation_uuid",
  "user_uuid",
  "membership_uuid",
  "student_id",
  "username",
  "email",
  "campaign_group_uuid",
  "campaign_group_name",
  "campaign_group_owner_user_uuid",
  "campaign_group_member_count",
  "participant_joined_at",
  "participant_left_at",
  "participant_active",
  "participant_progress_value",
  "participant_progress_label",
  "participant_completion_percent",
  "participant_completed",
  "participant_total_sessions",
  "participant_checkpoint_count",
  "participant_visited_checkpoint_count",
  "participant_game_points_awarded",
  "participant_last_activity_at",
] as const;

type ChallengeExportColumn = (typeof challengeExportColumns)[number];
type ChallengeExportRow = Partial<Record<ChallengeExportColumn, CsvCell>>;

function StopMiniMap({ lat, lng, radiusMeters }: { lat: number; lng: number; radiusMeters: number }) {
  return (
    <MapContainer
      key={`${lat}-${lng}`}
      center={[lat, lng]}
      zoom={16}
      scrollWheelZoom={false}
      dragging={false}
      doubleClickZoom={false}
      zoomControl={false}
      attributionControl={false}
      touchZoom={false}
      keyboard={false}
      style={{ width: "100%", height: "100%", borderRadius: "inherit" }}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Circle
        center={[lat, lng]}
        radius={radiusMeters}
        pathOptions={{ color: "#27CC5E", fillColor: "#27CC5E", fillOpacity: 0.18, weight: 2 }}
      />
      <CircleMarker
        center={[lat, lng]}
        radius={6}
        pathOptions={{ color: "#fff", fillColor: "#27CC5E", fillOpacity: 1, weight: 2.5 }}
      />
    </MapContainer>
  );
}

function LiveProgressMapFitter({ stops }: { stops: SchoolChallengeCheckpoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (stops.length === 0) return;
    if (stops.length === 1) {
      map.setView([stops[0].latitude, stops[0].longitude], 16);
      return;
    }
    const lats = stops.map((s) => s.latitude);
    const lngs = stops.map((s) => s.longitude);
    map.fitBounds(
      [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
      { padding: [32, 32] },
    );
  }, [map, stops]);
  return null;
}

function LiveProgressMap({
  checkpoints,
  inProgressParticipants,
  formatNebulaUserName,
}: {
  checkpoints: SchoolChallengeCheckpoint[];
  inProgressParticipants: SchoolChallengeParticipantProgress[];
  formatNebulaUserName: (profile: { first_name?: string; last_name?: string; username?: string; email?: string }) => string;
}) {
  const mappableStops = checkpoints.filter(
    (cp) => Number.isFinite(cp.latitude) && Number.isFinite(cp.longitude) && cp.latitude !== 0,
  );

  if (mappableStops.length === 0) {
    return <p className="muted-text" style={{ textAlign: "center", padding: "16px 0" }}>No stops have location data yet.</p>;
  }

  const targetMap = new Map<string, string[]>();
  for (const p of inProgressParticipants) {
    const idx = p.visited_checkpoint_count ?? 0;
    const cp = checkpoints[idx];
    if (!cp) continue;
    const key = cp.checkpoint_uuid;
    if (!targetMap.has(key)) targetMap.set(key, []);
    targetMap.get(key)!.push(
      formatNebulaUserName({
        first_name: p.first_name,
        last_name: p.last_name,
        email: p.email,
        username: p.username,
      }),
    );
  }

  return (
    <MapContainer
      center={[mappableStops[0].latitude, mappableStops[0].longitude]}
      zoom={14}
      scrollWheelZoom={false}
      attributionControl={false}
      style={{ width: "100%", height: "100%", borderRadius: "inherit" }}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <LiveProgressMapFitter stops={mappableStops} />
      {mappableStops.map((cp, i) => {
        const studentsHere = targetMap.get(cp.checkpoint_uuid) ?? [];
        const isTargeted = studentsHere.length > 0;
        const stopNumber = checkpoints.indexOf(cp) + 1;
        return (
          <Fragment key={cp.checkpoint_uuid}>
            {cp.radius_meters > 0 && (
              <Circle
                center={[cp.latitude, cp.longitude]}
                radius={cp.radius_meters}
                pathOptions={
                  isTargeted
                    ? { color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.2, weight: 2.5 }
                    : { color: "#94a3b8", fillColor: "#94a3b8", fillOpacity: 0.1, weight: 1.5 }
                }
              />
            )}
            {isTargeted && cp.radius_meters > 0 && (
              <Circle
                center={[cp.latitude, cp.longitude]}
                radius={cp.radius_meters * 1.45}
                pathOptions={{ color: "#f59e0b", fillColor: "transparent", fillOpacity: 0, weight: 2, opacity: 0.5, dashArray: "6 5" }}
              />
            )}
            <CircleMarker
              center={[cp.latitude, cp.longitude]}
              radius={isTargeted ? 9 : 7}
              pathOptions={
                isTargeted
                  ? { color: "#fff", fillColor: "#f59e0b", fillOpacity: 1, weight: 2.5 }
                  : { color: "#fff", fillColor: "#64748b", fillOpacity: 1, weight: 2 }
              }
            >
              <Tooltip permanent direction="top" offset={[0, -10]} className="live-progress-stop-tooltip">
                <span className={`live-progress-stop-label${isTargeted ? " live-progress-stop-label-targeted" : ""}`}>
                  {stopNumber}. {cp.title || `Stop ${stopNumber}`}
                </span>
                {isTargeted && (
                  <span className="live-progress-stop-students">
                    → {studentsHere.slice(0, 3).join(", ")}
                    {studentsHere.length > 3 ? ` +${studentsHere.length - 3} more` : ""}
                  </span>
                )}
              </Tooltip>
            </CircleMarker>
          </Fragment>
        );
      })}
    </MapContainer>
  );
}

type Props = {
  mode?: "challenges" | "games";
  activeSchoolId: string;
  challengeBusy: boolean;
  challengeListBusy: boolean;
  challengeParticipantsBusy: boolean;
  challengeImageUploadBusy: boolean;
  selectedChallengeId: string;
  setSelectedChallengeId: Dispatch<SetStateAction<string>>;
  challengeDraft: ChallengeDraft;
  setChallengeDraft: Dispatch<SetStateAction<ChallengeDraft>>;
  createEmptyChallengeDraft: () => ChallengeDraft;
  refreshSchoolChallenges: () => Promise<void>;
  handleSaveChallenge: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  handleDeleteSelectedChallenge: () => Promise<void>;
  handleCopyChallengeForResubmit: (challenge: SchoolChallenge) => void;
  handleChallengeImageFileChange: (
    event: ChangeEvent<HTMLInputElement>,
  ) => void | Promise<void>;
  selectedChallenge: SchoolChallenge | null;
  schoolChallenges: SchoolChallenge[];
  currentAndUpcomingChallenges: SchoolChallenge[];
  pastChallenges: SchoolChallenge[];
  challengeParticipants: SchoolChallengeParticipantProgress[];
  challengeParticipantSummary: {
    joined: number;
    completed: number;
  };
  resolveChallengeStatus: (challenge: SchoolChallenge) => string;
  formatChallengeMetricValue: (
    metricType: ChallengeDraft["metric_type"],
    value: number,
  ) => string;
  formatDateTimeForDisplay: (value?: number) => string;
  formatNebulaUserName: (profile: {
    first_name?: string;
    last_name?: string;
    username?: string;
    email?: string;
  }) => string;
  EntityImagePreview: ComponentType<EntityImagePreviewProps>;
  DetailRow: DetailRowComponent;
  newChallengeSelectionId: string;
  handleImagePreview: (
    imageUrl: string,
    alt: string,
    label?: string,
  ) => void;
  uploadStopImage?: (file: File) => Promise<string>;
};

function statusClass(status: string): string {
  if (status === "Live") return "challenge-status-live";
  if (status === "Upcoming") return "challenge-status-upcoming";
  return "challenge-status-ended";
}

function formatChallengeAudienceLabel(
  audienceType?: SchoolChallenge["audience_type"],
): string {
  return audienceType === "campaign_group" ? "Campaign" : "Student";
}

function isScavengerHuntChallenge(
  challenge: Pick<SchoolChallenge, "challenge_type">,
): boolean {
  return challenge.challenge_type === "scavenger_hunt";
}

function formatChallengeTypeLabel(
  challengeType?: SchoolChallenge["challenge_type"] | ChallengeDraft["challenge_type"],
): string {
  return challengeType === "scavenger_hunt" ? "Scavenger hunt" : "Ride / points";
}

function getChallengeCheckpointCount(challenge: SchoolChallenge): number {
  return (challenge.checkpoints ?? []).filter((checkpoint) => checkpoint.active).length;
}

function getDraftActiveCheckpointCount(draft: ChallengeDraft): number {
  return draft.checkpoints.filter((checkpoint) => checkpoint.active).length;
}

function formatChallengeGoalLabel(
  challenge: SchoolChallenge,
  formatChallengeMetricValue: Props["formatChallengeMetricValue"],
): string {
  if (isScavengerHuntChallenge(challenge)) {
    const count = getChallengeCheckpointCount(challenge) || challenge.target_value;
    return `${count} stop${count === 1 ? "" : "s"}`;
  }

  return formatChallengeMetricValue(challenge.metric_type, challenge.target_value);
}

type ChallengeExportParams = {
  challenge: SchoolChallenge;
  participants: SchoolChallengeParticipantProgress[];
  participantSummary: Props["challengeParticipantSummary"];
  resolveChallengeStatus: Props["resolveChallengeStatus"];
  formatChallengeMetricValue: Props["formatChallengeMetricValue"];
  formatDateTimeForDisplay: Props["formatDateTimeForDisplay"];
  formatNebulaUserName: Props["formatNebulaUserName"];
};

function formatChallengeParticipantStatus(
  participant: SchoolChallengeParticipantProgress,
): string {
  if (participant.completed) {
    return "Completed";
  }

  if (participant.active) {
    return "In Progress";
  }

  return "Left";
}

function downloadChallengeCSV({
  challenge,
  participants,
  participantSummary,
  resolveChallengeStatus,
  formatChallengeMetricValue,
  formatDateTimeForDisplay,
  formatNebulaUserName,
}: ChallengeExportParams) {
  const completionRate =
    participantSummary.joined > 0
      ? Math.round(
          (participantSummary.completed / participantSummary.joined) * 100,
        )
      : "";
  const challengeStatus = resolveChallengeStatus(challenge);
  const checkpointCount = getChallengeCheckpointCount(challenge);
  const targetLabel = isScavengerHuntChallenge(challenge)
    ? `${checkpointCount || challenge.target_value} stop${
        (checkpointCount || challenge.target_value) === 1 ? "" : "s"
      }`
    : formatChallengeMetricValue(challenge.metric_type, challenge.target_value);
  const baseRow: ChallengeExportRow = {
    challenge_uuid: challenge.challenge_uuid,
    challenge_title: challenge.title,
    challenge_description: challenge.description,
    challenge_image_url: challenge.image_url,
    challenge_type: formatChallengeTypeLabel(challenge.challenge_type),
    challenge_audience_type: challenge.audience_type,
    challenge_audience_label: formatChallengeAudienceLabel(challenge.audience_type),
    challenge_status: challengeStatus,
    challenge_active: challenge.active,
    challenge_metric_type: challenge.metric_type,
    challenge_target_value: challenge.target_value,
    challenge_target_label: targetLabel,
    challenge_checkpoint_count: checkpointCount,
    challenge_start_time: formatDateTimeForDisplay(challenge.start_time),
    challenge_end_time: formatDateTimeForDisplay(challenge.end_time),
    summary_joined_count: participantSummary.joined,
    summary_completed_count: participantSummary.completed,
    summary_completion_rate_percent: completionRate,
  };
  const rows: ChallengeExportRow[] = [
    {
      ...baseRow,
      row_type: "challenge_summary",
    },
  ];

  participants.forEach((participant) => {
    const isCampaignParticipant = participant.participant_type === "campaign_group";
    const participantName = isCampaignParticipant
      ? participant.campaign_group_name?.trim() || "Campaign group"
      : formatNebulaUserName({
          first_name: participant.first_name,
          last_name: participant.last_name,
          email: participant.email,
          username: participant.username,
        });
    const participantIdentifier = isCampaignParticipant
      ? `${participant.member_count ?? 0} rider${
          participant.member_count === 1 ? "" : "s"
        }`
      : participant.student_id || participant.username || participant.email;

    rows.push({
      ...baseRow,
      row_type: "participant_progress",
      participant_type: participant.participant_type ?? challenge.audience_type,
      participant_name: participantName,
      participant_identifier: participantIdentifier,
      participant_status: formatChallengeParticipantStatus(participant),
      participation_uuid: participant.participation_uuid,
      user_uuid: participant.user_uuid,
      membership_uuid: participant.membership_uuid,
      student_id: participant.student_id,
      username: participant.username,
      email: participant.email,
      campaign_group_uuid: participant.campaign_group_uuid ?? "",
      campaign_group_name: participant.campaign_group_name ?? "",
      campaign_group_owner_user_uuid: participant.owner_user_uuid ?? "",
      campaign_group_member_count: participant.member_count ?? "",
      participant_joined_at: formatDateTimeForDisplay(participant.joined_at),
      participant_left_at: participant.left_at
        ? formatDateTimeForDisplay(participant.left_at)
        : "",
      participant_active: participant.active,
      participant_progress_value: participant.progress_value,
      participant_progress_label: formatChallengeMetricValue(
        participant.metric_type,
        participant.progress_value,
      ),
      participant_completion_percent: Math.round(participant.completion_percent),
      participant_completed: participant.completed,
      participant_total_sessions: participant.total_sessions,
      participant_checkpoint_count: participant.checkpoint_count ?? "",
      participant_visited_checkpoint_count: participant.visited_checkpoint_count ?? "",
      participant_game_points_awarded: participant.game_points_awarded ?? "",
      participant_last_activity_at: participant.last_activity_at
        ? formatDateTimeForDisplay(participant.last_activity_at)
        : "",
    });
  });

  downloadCsv(
    sanitizeCsvFilename(
      `${challenge.title || "challenge"}-progress-export`,
      "challenge-progress-export",
    ),
    [
      challengeExportColumns,
      ...rows.map((row) => csvObjectRow(challengeExportColumns, row)),
    ],
  );
}

export function ChallengesScreen(props: Props) {
  const {
    mode = "challenges",
    activeSchoolId,
    challengeBusy,
    challengeListBusy,
    challengeParticipantsBusy,
    challengeImageUploadBusy,
    selectedChallengeId,
    setSelectedChallengeId,
    challengeDraft,
    setChallengeDraft,
    createEmptyChallengeDraft,
    refreshSchoolChallenges,
    handleSaveChallenge,
    handleDeleteSelectedChallenge,
    handleCopyChallengeForResubmit,
    handleChallengeImageFileChange,
    selectedChallenge,
    schoolChallenges,
    currentAndUpcomingChallenges,
    pastChallenges,
    challengeParticipants,
    challengeParticipantSummary,
    resolveChallengeStatus,
    formatChallengeMetricValue,
    formatDateTimeForDisplay,
    formatNebulaUserName,
    EntityImagePreview,
    newChallengeSelectionId,
    handleImagePreview,
    uploadStopImage,
  } = props;

  const isCreating =
    selectedChallengeId === newChallengeSelectionId && !challengeDraft.challenge_uuid;
  const isEditing = Boolean(challengeDraft.challenge_uuid);
  const selectedChallengeIsCampaign =
    selectedChallenge?.audience_type === "campaign_group";
  const draftIsScavengerHunt = challengeDraft.challenge_type === "scavenger_hunt";
  const isGamesMode = mode === "games";
  const itemLabel = isGamesMode ? "game" : "challenge";
  const itemLabelTitle = isGamesMode ? "Game" : "Challenge";
  const createButtonLabel = isGamesMode ? "+ New Game" : "+ New Challenge";
  const activeListLabel = isGamesMode ? "Live & scheduled games" : "Active & Upcoming";
  const pastListLabel = isGamesMode ? "Archived games" : "Past";
  const activeStopCount = getDraftActiveCheckpointCount(challengeDraft);
  const totalStopCount = challengeDraft.checkpoints.length;
  const totalGameCount = schoolChallenges.length;
  const totalScheduledGameCount = currentAndUpcomingChallenges.length;

  function createEmptyCheckpointDraft(sortOrder = challengeDraft.checkpoints.length + 1) {
    return {
      checkpoint_uuid: "",
      title: "",
      description: "",
      clue: "",
      image_url: "",
      latitude: "",
      longitude: "",
      radius_meters: "50",
      prize_points: "0",
      sort_order: String(sortOrder),
      active: true,
    };
  }

  function setChallengeType(challengeType: ChallengeDraft["challenge_type"]) {
    setChallengeDraft((current) => {
      if (challengeType === "scavenger_hunt") {
        const checkpoints =
          current.checkpoints.length > 0
            ? current.checkpoints
            : [createEmptyCheckpointDraft(1)];
        return {
          ...current,
          challenge_type: "scavenger_hunt",
          audience_type: "user",
          metric_type: "points",
          target_value: String(
            checkpoints.filter((checkpoint) => checkpoint.active).length || 1,
          ),
          repeat_enabled: false,
          checkpoints,
        };
      }

      return {
        ...current,
        challenge_type: "route_metric",
        target_value:
          current.target_value ||
          (current.metric_type === "points" ? "100" : "10"),
      };
    });
  }

  function updateCheckpointDraft(index: number, patch: Partial<ChallengeCheckpointDraft>) {
    setChallengeDraft((current) => {
      const checkpoints = current.checkpoints.map((checkpoint, checkpointIndex) =>
        checkpointIndex === index ? { ...checkpoint, ...patch } : checkpoint,
      );
      return {
        ...current,
        checkpoints,
        target_value:
          current.challenge_type === "scavenger_hunt"
            ? String(checkpoints.filter((checkpoint) => checkpoint.active).length || 1)
            : current.target_value,
      };
    });
  }

  function removeCheckpointDraft(index: number) {
    setChallengeDraft((current) => {
      const checkpoints = current.checkpoints.filter(
        (_checkpoint, checkpointIndex) => checkpointIndex !== index,
      );
      return {
        ...current,
        checkpoints,
        target_value:
          current.challenge_type === "scavenger_hunt"
            ? String(checkpoints.filter((checkpoint) => checkpoint.active).length || 1)
            : current.target_value,
      };
    });
  }

  const emptyStopDraft: ChallengeCheckpointDraft = {
    checkpoint_uuid: "",
    title: "",
    description: "",
    clue: "",
    image_url: "",
    latitude: "",
    longitude: "",
    radius_meters: "50",
    prize_points: "0",
    sort_order: "1",
    active: true,
  };

  const [stopModal, setStopModal] = useState<{
    open: boolean;
    index: number | null;
    draft: ChallengeCheckpointDraft;
  }>({ open: false, index: null, draft: emptyStopDraft });

  function openStopModal(index?: number) {
    if (index !== undefined) {
      setStopModal({ open: true, index, draft: { ...challengeDraft.checkpoints[index] } });
    } else {
      const sortOrder = challengeDraft.checkpoints.length + 1;
      setStopModal({
        open: true,
        index: null,
        draft: { ...emptyStopDraft, sort_order: String(sortOrder) },
      });
    }
  }

  function closeStopModal() {
    setStopModal((prev) => ({ ...prev, open: false }));
  }

  function saveStopModal() {
    const { index, draft } = stopModal;
    if (index !== null) {
      updateCheckpointDraft(index, draft);
    } else {
      setChallengeDraft((current) => {
        const checkpoints = [
          ...current.checkpoints,
          { ...draft, sort_order: String(current.checkpoints.length + 1) },
        ];
        return {
          ...current,
          checkpoints,
          target_value:
            current.challenge_type === "scavenger_hunt"
              ? String(checkpoints.filter((cp) => cp.active).length || 1)
              : current.target_value,
        };
      });
    }
    closeStopModal();
  }

  function updateModalDraft(patch: Partial<ChallengeCheckpointDraft>) {
    setStopModal((prev) => ({ ...prev, draft: { ...prev.draft, ...patch } }));
  }

  const [stopImageBusy, setStopImageBusy] = useState(false);
  const [screenTab, setScreenTab] = useState<"list" | "participants">("list");
  const [showLiveMap, setShowLiveMap] = useState(true);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function handleCheckpointDragStart(index: number) {
    setDragIndex(index);
  }
  function handleCheckpointDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragOverIndex !== index) setDragOverIndex(index);
  }
  function handleCheckpointDrop(toIndex: number) {
    if (dragIndex === null || dragIndex === toIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    setChallengeDraft((prev) => {
      const items = [...prev.checkpoints];
      const [moved] = items.splice(dragIndex, 1);
      items.splice(toIndex, 0, moved);
      return { ...prev, checkpoints: items };
    });
    setDragIndex(null);
    setDragOverIndex(null);
  }
  function handleCheckpointDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
  }

  useEffect(() => {
    if (selectedChallengeId && selectedChallengeId !== newChallengeSelectionId) {
      setScreenTab("participants");
    } else {
      setScreenTab("list");
    }
  }, [selectedChallengeId, newChallengeSelectionId]);

  async function handleStopImageUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !uploadStopImage) return;
    setStopImageBusy(true);
    try {
      const url = await uploadStopImage(file);
      updateModalDraft({ image_url: url });
    } finally {
      setStopImageBusy(false);
    }
  }

  function handleSelectNew() {
    const draft = createEmptyChallengeDraft();
    setSelectedChallengeId(newChallengeSelectionId);
    setChallengeDraft(
      isGamesMode
        ? {
            ...draft,
            challenge_type: "scavenger_hunt",
            audience_type: "user",
            metric_type: "points",
            target_value: "1",
            min_accuracy_meters: draft.min_accuracy_meters || "50",
            repeat_enabled: false,
            checkpoints: [createEmptyCheckpointDraft(1)],
          }
        : {
            ...draft,
            challenge_type: "route_metric",
            checkpoints: [],
          },
    );
  }

  return (
    <section
      className={`panel challenge-master-panel ${isGamesMode ? "challenge-master-panel-games" : ""}`}
    >
      {/* ── Page header ── */}
      <div className="panel-header">
        <div>
          <p className="eyebrow">{isGamesMode ? "Games" : "Campaigns"}</p>
          <h2>{isGamesMode ? "Challenge Games" : "School challenges"}</h2>
        </div>
        <div className="form-actions">
          <button
            className="primary-button"
            type="button"
            onClick={handleSelectNew}
            disabled={!activeSchoolId}
          >
            {createButtonLabel}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void refreshSchoolChallenges()}
            disabled={challengeListBusy || !activeSchoolId}
          >
            Refresh
          </button>
        </div>
      </div>

      {!activeSchoolId ? (
        <p className="empty-state">This admin login is not scoped to a school.</p>
      ) : null}

      {activeSchoolId && isGamesMode ? (
        <div className="challenge-games-hero">
          <div className="challenge-games-hero-copy">
            <p className="eyebrow">Scavenger hunt builder</p>
            <h3>Design GPS check-in games students can join from the app.</h3>
            <p>
              Add temporary hunt stops, set a check-in radius, choose optional
              point prizes, and track each player&apos;s progress from the same screen.
            </p>
          </div>
          <div className="challenge-games-stats" aria-label="Challenge game summary">
            <span className="challenge-games-stat">
              <strong>{totalScheduledGameCount}</strong>
              <span>Live or scheduled</span>
            </span>
            <span className="challenge-games-stat">
              <strong>{totalGameCount}</strong>
              <span>Total games</span>
            </span>
            <span className="challenge-games-stat">
              <strong>
                {draftIsScavengerHunt ? `${activeStopCount}/${totalStopCount}` : "0/0"}
              </strong>
              <span>Draft stops active</span>
            </span>
          </div>
        </div>
      ) : null}

      {activeSchoolId ? (
        <div className="challenge-screen-layout">

          {/* Compact info header — visible when a challenge is selected and not creating/editing */}
          {selectedChallenge && !isCreating && !isEditing ? (
            <div className="challenge-detail-compact-header">
              <div className="challenge-detail-compact-thumb">
                {selectedChallenge.image_url.trim() ? (
                  <img
                    src={selectedChallenge.image_url}
                    alt={selectedChallenge.title}
                    onClick={() =>
                      handleImagePreview(
                        selectedChallenge.image_url,
                        selectedChallenge.title,
                        selectedChallenge.title,
                      )
                    }
                  />
                ) : (
                  <span className="challenge-detail-compact-thumb-fallback">
                    {isGamesMode ? "SH" : "CH"}
                  </span>
                )}
              </div>
              <div className="challenge-detail-compact-info">
                <div className="challenge-detail-compact-title-row">
                  <h3 className="challenge-detail-compact-title">{selectedChallenge.title}</h3>
                  <span className={`challenge-status-badge ${statusClass(resolveChallengeStatus(selectedChallenge))}`}>
                    {resolveChallengeStatus(selectedChallenge)}
                  </span>
                  {selectedChallenge.active ? null : (
                    <span className="challenge-status-badge challenge-status-ended">Inactive</span>
                  )}
                </div>
                <div className="challenge-detail-compact-chips">
                  <span className="challenge-form-chip">
                    {formatChallengeTypeLabel(selectedChallenge.challenge_type)}
                  </span>
                  <span className="challenge-form-chip">
                    🎯 {formatChallengeGoalLabel(selectedChallenge, formatChallengeMetricValue)}
                  </span>
                  <span className="challenge-form-chip">
                    📅 {formatDateTimeForDisplay(selectedChallenge.start_time)} → {formatDateTimeForDisplay(selectedChallenge.end_time)}
                  </span>
                </div>
              </div>
              <div className="challenge-detail-compact-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    setChallengeDraft({
                      challenge_uuid: selectedChallenge.challenge_uuid,
                      challenge_type:
                        selectedChallenge.challenge_type === "scavenger_hunt"
                          ? "scavenger_hunt"
                          : "route_metric",
                      audience_type:
                        selectedChallenge.challenge_type === "scavenger_hunt"
                          ? "user"
                          : selectedChallenge.audience_type,
                      title: selectedChallenge.title,
                      description: selectedChallenge.description,
                      image_url: selectedChallenge.image_url,
                      metric_type:
                        selectedChallenge.challenge_type === "scavenger_hunt"
                          ? "points"
                          : selectedChallenge.metric_type,
                      target_value:
                        selectedChallenge.challenge_type === "scavenger_hunt"
                          ? String(
                              getChallengeCheckpointCount(selectedChallenge) ||
                                selectedChallenge.target_value,
                            )
                          : String(selectedChallenge.target_value),
                      min_accuracy_meters:
                        typeof selectedChallenge.game_config?.min_accuracy_meters === "number"
                          ? String(selectedChallenge.game_config.min_accuracy_meters)
                          : "50",
                      checkpoints: (selectedChallenge.checkpoints ?? [])
                        .slice()
                        .sort((left, right) => left.sort_order - right.sort_order)
                        .map((checkpoint, index) => ({
                          checkpoint_uuid: checkpoint.checkpoint_uuid,
                          title: checkpoint.title,
                          description: checkpoint.description,
                          clue: checkpoint.clue,
                          image_url: checkpoint.image_url,
                          latitude: String(checkpoint.latitude),
                          longitude: String(checkpoint.longitude),
                          radius_meters: String(checkpoint.radius_meters),
                          prize_points: String(checkpoint.prize_points),
                          sort_order: String(checkpoint.sort_order || index + 1),
                          active: checkpoint.active,
                        })),
                      start_time: selectedChallenge.start_time
                        ? new Date(selectedChallenge.start_time * 1000)
                            .toISOString()
                            .slice(0, 16)
                        : "",
                      end_time: selectedChallenge.end_time
                        ? new Date(selectedChallenge.end_time * 1000)
                            .toISOString()
                            .slice(0, 16)
                        : "",
                      active: selectedChallenge.active,
                      repeat_enabled: false,
                      repeat_interval_value: "",
                      repeat_interval_unit: "weeks",
                      repeat_count: "",
                    })
                  }
                >
                  Edit
                </button>
                {resolveChallengeStatus(selectedChallenge) === "Ended" ? (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => handleCopyChallengeForResubmit(selectedChallenge)}
                    disabled={challengeBusy}
                  >
                    Copy &amp; Resubmit
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Screen-level nav tabs — always visible; clicking while editing/creating cancels form */}
          <div className="challenge-screen-tabs">
            <button
              type="button"
              className={`challenge-screen-tab ${screenTab === "list" && !isCreating && !isEditing ? "challenge-screen-tab-active" : ""}`}
              onClick={() => {
                if (isEditing) setChallengeDraft(createEmptyChallengeDraft());
                if (isCreating) setSelectedChallengeId("");
                setScreenTab("list");
              }}
            >
              {isGamesMode ? "Games" : "Challenges"}
            </button>
            <button
              type="button"
              className={`challenge-screen-tab ${screenTab === "participants" && !isCreating && !isEditing ? "challenge-screen-tab-active" : ""}`}
              onClick={() => {
                if (isCreating) return;
                if (isEditing) setChallengeDraft(createEmptyChallengeDraft());
                setScreenTab("participants");
              }}
              disabled={!selectedChallenge && !isEditing}
              title={!selectedChallenge && !isEditing ? `Select a ${itemLabel} first` : undefined}
            >
              Participants
            </button>
          </div>

          {/* ── Tab: Challenges table ── */}
          {!isCreating && !isEditing && screenTab === "list" ? (
            <div className="challenge-table-section">
              {challengeListBusy ? (
                <p className="muted-text" style={{ padding: "16px 0" }}>Loading…</p>
              ) : schoolChallenges.length === 0 ? (
                <div className="challenge-empty-detail">
                  <span className="challenge-empty-icon">{isGamesMode ? "SH" : "CH"}</span>
                  <h3>No {isGamesMode ? "games" : "challenges"} yet</h3>
                  <p>Create your first {itemLabel} to get started.</p>
                  <button className="primary-button" type="button" onClick={handleSelectNew}>
                    {createButtonLabel}
                  </button>
                </div>
              ) : (
                <table className="challenge-table">
                  <thead>
                    <tr>
                      <th className="challenge-table-th">{isGamesMode ? "Game" : "Challenge"}</th>
                      <th className="challenge-table-th">Status</th>
                      <th className="challenge-table-th">Goal</th>
                      <th className="challenge-table-th">Dates</th>
                      <th className="challenge-table-th"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentAndUpcomingChallenges.length > 0 ? (
                      <Fragment>
                        <tr className="challenge-table-group-row">
                          <td colSpan={5} className="challenge-table-group-label">{activeListLabel}</td>
                        </tr>
                        {currentAndUpcomingChallenges.map((ch) => {
                          const status = resolveChallengeStatus(ch);
                          const isSelected = ch.challenge_uuid === selectedChallengeId;
                          return (
                            <tr
                              key={ch.challenge_uuid}
                              className={`challenge-table-row ${isSelected ? "challenge-table-row-selected" : ""}`}
                              onClick={() => { setSelectedChallengeId(ch.challenge_uuid); setScreenTab("participants"); }}
                            >
                              <td className="challenge-table-td">
                                <div className="challenge-table-title-cell">
                                  <div className="challenge-table-thumb">
                                    {ch.image_url.trim() ? <img src={ch.image_url} alt={ch.title} /> : <span>{isGamesMode ? "SH" : "CH"}</span>}
                                  </div>
                                  <div>
                                    <div className="challenge-table-title">{ch.title}</div>
                                    <div className="challenge-table-type muted-text">{formatChallengeTypeLabel(ch.challenge_type)}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="challenge-table-td">
                                <span className={`challenge-status-badge ${statusClass(status)}`}>{status}</span>
                              </td>
                              <td className="challenge-table-td challenge-table-muted">
                                {formatChallengeGoalLabel(ch, formatChallengeMetricValue)}
                              </td>
                              <td className="challenge-table-td challenge-table-muted">
                                {formatDateTimeForDisplay(ch.start_time)} → {formatDateTimeForDisplay(ch.end_time)}
                              </td>
                              <td className="challenge-table-td challenge-table-action-cell">
                                <span className="challenge-table-view-arrow">→</span>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ) : null}
                    {pastChallenges.length > 0 ? (
                      <Fragment>
                        <tr className="challenge-table-group-row">
                          <td colSpan={5} className="challenge-table-group-label">{pastListLabel}</td>
                        </tr>
                        {pastChallenges.map((ch) => {
                          const status = resolveChallengeStatus(ch);
                          const isSelected = ch.challenge_uuid === selectedChallengeId;
                          return (
                            <tr
                              key={ch.challenge_uuid}
                              className={`challenge-table-row ${isSelected ? "challenge-table-row-selected" : ""}`}
                              onClick={() => { setSelectedChallengeId(ch.challenge_uuid); setScreenTab("participants"); }}
                            >
                              <td className="challenge-table-td">
                                <div className="challenge-table-title-cell">
                                  <div className="challenge-table-thumb">
                                    {ch.image_url.trim() ? <img src={ch.image_url} alt={ch.title} /> : <span>{isGamesMode ? "SH" : "CH"}</span>}
                                  </div>
                                  <div>
                                    <div className="challenge-table-title">{ch.title}</div>
                                    <div className="challenge-table-type muted-text">{formatChallengeTypeLabel(ch.challenge_type)}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="challenge-table-td">
                                <span className={`challenge-status-badge ${statusClass(status)}`}>{status}</span>
                              </td>
                              <td className="challenge-table-td challenge-table-muted">
                                {formatChallengeGoalLabel(ch, formatChallengeMetricValue)}
                              </td>
                              <td className="challenge-table-td challenge-table-muted">
                                {formatDateTimeForDisplay(ch.start_time)} → {formatDateTimeForDisplay(ch.end_time)}
                              </td>
                              <td className="challenge-table-td challenge-table-action-cell">
                                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                  <button
                                    className="secondary-button"
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleCopyChallengeForResubmit(ch); }}
                                    disabled={challengeBusy}
                                  >
                                    Copy &amp; Resubmit
                                  </button>
                                  <span className="challenge-table-view-arrow">→</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ) : null}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}

          {/* Participants empty state when no challenge selected */}
          {!isCreating && !isEditing && screenTab === "participants" && !selectedChallenge ? (
            <div className="challenge-empty-detail">
              <span className="challenge-empty-icon">{isGamesMode ? "SH" : "CH"}</span>
              <h3>Select a {itemLabel}</h3>
              <p>Pick a row from the {isGamesMode ? "Games" : "Challenges"} tab to view participant progress.</p>
            </div>
          ) : null}

            {/* Create / Edit form */}
            {(isCreating || isEditing) ? (
              <form className="challenge-editor-form" onSubmit={handleSaveChallenge}>
                {/* Form header */}
                <div className="challenge-form-header">
                  <div>
                    <p className="eyebrow">
                      {isEditing ? `Editing ${itemLabel}` : `New ${itemLabel}`}
                    </p>
                    <h3>
                      {challengeDraft.title.trim() ||
                        (isEditing ? "Untitled" : `Create a ${itemLabel}`)}
                    </h3>
                  </div>
                  {challengeBusy ? <span className="muted-text">Saving…</span> : null}
                </div>

                {/* Live preview chip row */}
                <div className="challenge-form-preview-row">
                  {challengeDraft.image_url.trim() ? (
                    <img
                      src={challengeDraft.image_url}
                      alt={`${itemLabelTitle} cover`}
                      className="challenge-form-preview-img"
                      onClick={() =>
                        handleImagePreview(
                          challengeDraft.image_url,
                          challengeDraft.title || itemLabelTitle,
                        )
                      }
                    />
                  ) : null}
                  <div className="challenge-form-preview-chips">
                    <span className="challenge-form-chip">
                      {formatChallengeTypeLabel(challengeDraft.challenge_type)}
                    </span>
                    {draftIsScavengerHunt ? (
                      <span className="challenge-form-chip">
                        {getDraftActiveCheckpointCount(challengeDraft)} active stop
                        {getDraftActiveCheckpointCount(challengeDraft) === 1 ? "" : "s"}
                      </span>
                    ) : challengeDraft.metric_type && challengeDraft.target_value ? (
                      <span className="challenge-form-chip">
                        🎯{" "}
                        {formatChallengeMetricValue(
                          challengeDraft.metric_type,
                          Number(challengeDraft.target_value),
                        )}
                      </span>
                    ) : null}
                    {challengeDraft.start_time ? (
                      <span className="challenge-form-chip">
                        📅 {challengeDraft.start_time.replace("T", " ")}
                        {challengeDraft.end_time
                          ? ` → ${challengeDraft.end_time.replace("T", " ")}`
                          : ""}
                      </span>
                    ) : null}
                    <span
                      className={`challenge-status-badge ${challengeDraft.active ? "challenge-status-live" : "challenge-status-ended"}`}
                    >
                      {challengeDraft.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>

                {/* Section: Details */}
                <div className="challenge-form-section">
                  <div className="challenge-form-section-label">Details</div>
                  {isGamesMode ? (
                    <div className="challenge-game-type-card">
                      <div className="challenge-game-type-icon">SH</div>
                      <div className="challenge-game-type-copy">
                        <strong>Scavenger Hunt</strong>
                        <span>
                          Individual challenge game with manual GPS check-ins and
                          optional per-stop point prizes.
                        </span>
                      </div>
                      <span className="challenge-game-type-pill">Student game</span>
                    </div>
                  ) : null}
                  <div className="form-grid">
                    {!isGamesMode ? (
                      <>
                        <label className="field">
                          <span>Challenge type</span>
                          <select
                            value={challengeDraft.challenge_type}
                            onChange={(e) =>
                              setChallengeType(e.target.value as ChallengeDraft["challenge_type"])
                            }
                          >
                            <option value="route_metric">Ride / Points Challenge</option>
                          </select>
                        </label>
                        <label className="field">
                          <span>Audience</span>
                          <select
                            value={challengeDraft.audience_type}
                            disabled={draftIsScavengerHunt}
                            onChange={(e) =>
                              setChallengeDraft((c) => ({
                                ...c,
                                audience_type: e.target.value as ChallengeDraft["audience_type"],
                              }))
                            }
                          >
                            <option value="user">Student challenge</option>
                            <option value="campaign_group">Campaign challenge</option>
                          </select>
                        </label>
                      </>
                    ) : null}
                    <label className="field field-span-2">
                      <span>Title</span>
                      <input
                        value={challengeDraft.title}
                        onChange={(e) =>
                          setChallengeDraft((c) => ({ ...c, title: e.target.value }))
                        }
                        placeholder={
                          isGamesMode
                            ? "Downtown scavenger hunt"
                            : "Ride 25 miles in 7 days"
                        }
                      />
                    </label>
                    <label className="field field-span-2">
                      <span>Description</span>
                      <textarea
                        value={challengeDraft.description}
                        onChange={(e) =>
                          setChallengeDraft((c) => ({ ...c, description: e.target.value }))
                        }
                        placeholder={
                          isGamesMode
                            ? "Invite students to visit each stop and check in from the app."
                            : "Invite students to participate and explain how they win."
                        }
                        rows={3}
                      />
                    </label>
                  </div>
                </div>

                {/* Section: Goal */}
                <div className="challenge-form-section">
                  <div className="challenge-form-section-label">Goal</div>
                  {draftIsScavengerHunt ? (
                    <div className="form-grid">
                      <label className="field">
                        <span>Completion target</span>
                        <input
                          value={`${getDraftActiveCheckpointCount(challengeDraft)} active stop${
                            getDraftActiveCheckpointCount(challengeDraft) === 1 ? "" : "s"
                          }`}
                          disabled
                        />
                      </label>
                      <label className="field">
                        <span>Minimum GPS accuracy (m)</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={challengeDraft.min_accuracy_meters}
                          onChange={(e) =>
                            setChallengeDraft((c) => ({
                              ...c,
                              min_accuracy_meters: e.target.value,
                            }))
                          }
                          placeholder="50"
                        />
                      </label>
                      <label className="field checkbox-field">
                        <span>Active</span>
                        <input
                          type="checkbox"
                          checked={challengeDraft.active}
                          onChange={(e) =>
                            setChallengeDraft((c) => ({ ...c, active: e.target.checked }))
                          }
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="form-grid">
                      <label className="field">
                        <span>Metric</span>
                        <select
                          value={challengeDraft.metric_type}
                          onChange={(e) =>
                            setChallengeDraft((c) => ({
                              ...c,
                              metric_type: e.target.value as ChallengeDraft["metric_type"],
                              target_value:
                                e.target.value === "points"
                                  ? c.metric_type === "points"
                                    ? c.target_value
                                    : "100"
                                  : c.metric_type === "distance_miles"
                                    ? c.target_value
                                    : "10",
                            }))
                          }
                        >
                          <option value="distance_miles">Distance (miles)</option>
                          <option value="points">Points</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>
                          Target{" "}
                          {challengeDraft.metric_type === "points" ? "(pts)" : "(mi)"}
                        </span>
                        <input
                          type="number"
                          min="0"
                          step={challengeDraft.metric_type === "points" ? "1" : "0.1"}
                          value={challengeDraft.target_value}
                          onChange={(e) =>
                            setChallengeDraft((c) => ({ ...c, target_value: e.target.value }))
                          }
                          placeholder={challengeDraft.metric_type === "points" ? "100" : "10"}
                        />
                      </label>
                      <label className="field checkbox-field">
                        <span>Active</span>
                        <input
                          type="checkbox"
                          checked={challengeDraft.active}
                          onChange={(e) =>
                            setChallengeDraft((c) => ({ ...c, active: e.target.checked }))
                          }
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Section: Schedule */}
                <div className="challenge-form-section">
                  <div className="challenge-form-section-label">Schedule</div>
                  <div className="form-grid">
                    <label className="field">
                      <span>Start</span>
                      <input
                        type="datetime-local"
                        value={challengeDraft.start_time}
                        onChange={(e) =>
                          setChallengeDraft((c) => ({ ...c, start_time: e.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>End</span>
                      <input
                        type="datetime-local"
                        value={challengeDraft.end_time}
                        onChange={(e) =>
                          setChallengeDraft((c) => ({ ...c, end_time: e.target.value }))
                        }
                      />
                    </label>
                  </div>
                </div>

                {!challengeDraft.challenge_uuid && !draftIsScavengerHunt ? (
                  <div className="challenge-form-section">
                    <div className="challenge-form-section-label">Schedule repeat</div>
                    <div className="form-grid">
                      <label className="field checkbox-field">
                        <span>Enable schedule</span>
                        <input
                          type="checkbox"
                          checked={challengeDraft.repeat_enabled}
                          onChange={(e) =>
                            setChallengeDraft((c) => ({
                              ...c,
                              repeat_enabled: e.target.checked,
                              repeat_interval_value: e.target.checked
                                ? c.repeat_interval_value || "1"
                                : "",
                              repeat_interval_unit: e.target.checked
                                ? c.repeat_interval_unit
                                : "weeks",
                              repeat_count: e.target.checked
                                ? c.repeat_count || "2"
                                : "",
                            }))
                          }
                        />
                      </label>
                      {challengeDraft.repeat_enabled ? (
                        <>
                          <label className="field">
                            <span>Every</span>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={challengeDraft.repeat_interval_value}
                              onChange={(e) =>
                                setChallengeDraft((c) => ({
                                  ...c,
                                  repeat_interval_value: e.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="field">
                            <span>Interval</span>
                            <select
                              value={challengeDraft.repeat_interval_unit}
                              onChange={(e) =>
                                setChallengeDraft((c) => ({
                                  ...c,
                                  repeat_interval_unit: e.target.value as ChallengeDraft["repeat_interval_unit"],
                                }))
                              }
                            >
                              <option value="days">Days</option>
                              <option value="weeks">Weeks</option>
                            </select>
                          </label>
                          <label className="field">
                            <span>Total submissions</span>
                            <input
                              type="number"
                              min="2"
                              max="52"
                              step="1"
                              value={challengeDraft.repeat_count}
                              onChange={(e) =>
                                setChallengeDraft((c) => ({
                                  ...c,
                                  repeat_count: e.target.value,
                                }))
                              }
                            />
                          </label>
                        </>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {draftIsScavengerHunt ? (
                  <div className="challenge-form-section">
                    <div className="challenge-form-section-header">
                      <div>
                        <div className="challenge-form-section-label">Stops</div>
                        <p className="muted-text">
                          Students must visit each stop's location within its check-in radius.
                        </p>
                      </div>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => openStopModal()}
                      >
                        + Add stop
                      </button>
                    </div>
                    <div className="challenge-game-guide">
                      <div className="challenge-game-step">
                        <span>1</span>
                        <strong>Add stops</strong>
                        <p>Use temporary game-only locations with a title and clue.</p>
                      </div>
                      <div className="challenge-game-step">
                        <span>2</span>
                        <strong>Set the radius</strong>
                        <p>Choose how close the student must be for a valid check-in.</p>
                      </div>
                      <div className="challenge-game-step">
                        <span>3</span>
                        <strong>Pick rewards</strong>
                        <p>Set per-stop point prizes, including zero-point clue stops.</p>
                      </div>
                    </div>
                    {challengeDraft.checkpoints.length === 0 ? (
                      <div className="challenge-stop-empty">
                        <span>📍</span>
                        <p>No stops yet. Add at least one stop to create a scavenger hunt.</p>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => openStopModal()}
                        >
                          + Add first stop
                        </button>
                      </div>
                    ) : null}
                    <div className="challenge-stop-compact-list">
                      {challengeDraft.checkpoints.map((checkpoint, index) => {
                        const stopLat = parseFloat(checkpoint.latitude);
                        const stopLng = parseFloat(checkpoint.longitude);
                        const hasPin =
                          Number.isFinite(stopLat) &&
                          Number.isFinite(stopLng) &&
                          stopLat !== 0;
                        const radiusM = parseFloat(checkpoint.radius_meters);
                        const radiusMeters =
                          Number.isFinite(radiusM) && radiusM > 0 ? radiusM : 50;
                        return (
                          <div
                            className={[
                              "challenge-stop-compact-card",
                              !checkpoint.active ? "challenge-stop-compact-card-inactive" : "",
                              dragIndex === index ? "challenge-stop-compact-card-dragging" : "",
                              dragOverIndex === index && dragIndex !== index ? "challenge-stop-compact-card-drag-over" : "",
                            ].filter(Boolean).join(" ")}
                            key={`${checkpoint.checkpoint_uuid || "new"}-${index}`}
                            draggable
                            onDragStart={() => handleCheckpointDragStart(index)}
                            onDragOver={(e) => handleCheckpointDragOver(e, index)}
                            onDrop={() => handleCheckpointDrop(index)}
                            onDragEnd={handleCheckpointDragEnd}
                          >
                            <div className="challenge-stop-drag-handle" title="Drag to reorder">⠿</div>
                            <div className="challenge-stop-thumb-wrap">
                              {checkpoint.image_url ? (
                                <img
                                  src={checkpoint.image_url}
                                  className="challenge-stop-thumb-img"
                                  alt={checkpoint.title || "Stop image"}
                                />
                              ) : hasPin ? (
                                <StopMiniMap
                                  key={`mini-${index}-${stopLat}-${stopLng}`}
                                  lat={stopLat}
                                  lng={stopLng}
                                  radiusMeters={radiusMeters}
                                />
                              ) : (
                                <div className="challenge-stop-mini-map-placeholder">📍</div>
                              )}
                              <span className="challenge-stop-thumb-num">{index + 1}</span>
                            </div>
                            <div className="challenge-stop-compact-info">
                              <div className="challenge-stop-compact-num">Stop {index + 1}</div>
                              <div className="challenge-stop-compact-name">
                                {checkpoint.title || "Untitled stop"}
                              </div>
                              <div className="challenge-stop-compact-meta">
                                <span className="challenge-stop-compact-points">
                                  ⭐ {checkpoint.prize_points || 0} pts
                                </span>
                                <span>·</span>
                                <span>{radiusMeters}m radius</span>
                                {!checkpoint.active && (
                                  <span className="challenge-stop-inactive-tag">inactive</span>
                                )}
                              </div>
                            </div>
                            <div className="challenge-stop-compact-actions">
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => openStopModal(index)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => removeCheckpointDraft(index)}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Section: Cover image */}
                <div className="challenge-form-section">
                  <div className="challenge-form-section-label">Cover image</div>
                  <div className="challenge-image-field">
                    <EntityImagePreview
                      imageUrl={challengeDraft.image_url}
                      label={challengeDraft.title || itemLabelTitle}
                      altSuffix={itemLabel}
                      fallbackLabel="Cover image preview"
                    />
                    <div className="challenge-image-field-controls">
                      <label className="field">
                        <span>Image URL</span>
                        <input
                          value={challengeDraft.image_url}
                          onChange={(e) =>
                            setChallengeDraft((c) => ({ ...c, image_url: e.target.value }))
                          }
                          placeholder="https://example.com/cover.jpg"
                        />
                      </label>
                      <div className="challenge-image-upload-row">
                        <label className="secondary-button challenge-upload-button">
                          <input
                            className="challenge-upload-input"
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                            onChange={handleChallengeImageFileChange}
                            disabled={challengeImageUploadBusy || !activeSchoolId}
                          />
                          {challengeImageUploadBusy ? "Uploading…" : "Upload Image"}
                        </label>
                        {challengeDraft.image_url.trim() ? (
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() =>
                              setChallengeDraft((c) => ({ ...c, image_url: "" }))
                            }
                            disabled={challengeImageUploadBusy}
                          >
                            Clear Image
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Form actions */}
                <div className="form-actions">
                  {challengeDraft.challenge_uuid ? (
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() => void handleDeleteSelectedChallenge()}
                      disabled={challengeBusy}
                    >
                      Delete
                    </button>
                  ) : null}
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={challengeBusy}
                  >
                    {challengeBusy
                      ? "Saving…"
                      : challengeDraft.challenge_uuid
                        ? "Save Changes"
                        : `Create ${itemLabelTitle}`}
                  </button>
                  {isCreating ? (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setSelectedChallengeId("")}
                    >
                      Cancel
                    </button>
                  ) : isEditing ? (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setChallengeDraft(createEmptyChallengeDraft())}
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </form>
            ) : null}

                {/* Participant stats */}
                {screenTab === "participants" && selectedChallenge && !isCreating && !isEditing ? (
                <div className="challenge-participants-section">
                  <div className="challenge-participants-header">
                    <h4>
                      {isGamesMode
                        ? "Player progress"
                        : selectedChallengeIsCampaign
                        ? "Campaign progress"
                        : "Student progress"}
                    </h4>
                    <div className="challenge-participants-header-actions">
                      <div className="challenge-participant-stats">
                        <span>
                          <strong>{challengeParticipantSummary.joined}</strong> joined
                        </span>
                        <span>
                          <strong>{challengeParticipantSummary.completed}</strong> completed
                        </span>
                        {challengeParticipantSummary.joined > 0 ? (
                          <span>
                            <strong>
                              {Math.round(
                                (challengeParticipantSummary.completed /
                                  challengeParticipantSummary.joined) *
                                  100,
                              )}%
                            </strong>{" "}
                            completion rate
                          </span>
                        ) : null}
                      </div>
                      <button
                        className="student-export-btn"
                        type="button"
                        onClick={() =>
                          downloadChallengeCSV({
                            challenge: selectedChallenge,
                            participants: challengeParticipants,
                            participantSummary: challengeParticipantSummary,
                            resolveChallengeStatus,
                            formatChallengeMetricValue,
                            formatDateTimeForDisplay,
                            formatNebulaUserName,
                          })
                        }
                        disabled={challengeParticipantsBusy}
                        title={`Download ${selectedChallenge.title} progress as CSV`}
                      >
                        Download CSV
                      </button>
                    </div>
                  </div>

                  {challengeParticipantsBusy ? (
                    <p className="muted-text">
                      Loading{" "}
                      {isGamesMode
                        ? "player"
                        : selectedChallengeIsCampaign
                          ? "campaign"
                          : "student"}{" "}
                      progress…
                    </p>
                  ) : !challengeParticipantsBusy && challengeParticipants.length === 0 ? (
                    <p className="empty-state">
                      {selectedChallengeIsCampaign
                        ? "No campaign groups have joined this challenge yet."
                        : isGamesMode
                          ? "No players have joined this game yet."
                          : "No students have joined this challenge yet."}
                    </p>
                  ) : null}

                  <div className="participant-progress-list">
                    {challengeParticipants.map((participant) => {
                      const isCampaignParticipant =
                        participant.participant_type === "campaign_group";
                      const participantName = isCampaignParticipant
                        ? participant.campaign_group_name?.trim() || "Campaign group"
                        : formatNebulaUserName({
                            first_name: participant.first_name,
                            last_name: participant.last_name,
                            email: participant.email,
                            username: participant.username,
                          });
                      const participantSubcopy = isCampaignParticipant
                        ? `${participant.member_count ?? 0} rider${
                            participant.member_count === 1 ? "" : "s"
                          }`
                        : participant.student_id || participant.username || participant.email;
                      const avatarSeed = isCampaignParticipant
                        ? participant.campaign_group_name?.[0]
                        : participant.first_name?.[0] || participant.username?.[0];
                      const isScavengerHuntSelected = selectedChallenge
                        ? isScavengerHuntChallenge(selectedChallenge)
                        : false;
                      const visitedStops =
                        participant.visited_checkpoint_count ?? participant.progress_value;
                      const totalStops =
                        participant.checkpoint_count ?? participant.target_value;

                      return (
                        <article
                          className="participant-progress-card"
                          key={participant.participation_uuid}
                        >
                          <div className="participant-card-header">
                            <div className="participant-avatar">
                              {(avatarSeed || "?").toUpperCase()}
                            </div>
                            <div className="participant-card-info">
                              <strong>{participantName}</strong>
                              <span className="muted-text">{participantSubcopy}</span>
                            </div>
                            <span
                              className={`challenge-status-badge ${
                                participant.completed
                                  ? "challenge-status-live"
                                  : participant.active
                                    ? "challenge-status-upcoming"
                                    : "challenge-status-ended"
                              }`}
                            >
                              {participant.completed
                                ? "Completed"
                                : participant.active
                                  ? "In Progress"
                                  : "Left"}
                            </span>
                          </div>

                          <div className="challenge-progress-meta">
                            <div className="challenge-progress-copy">
                              {isScavengerHuntSelected ? (
                                <>
                                  <strong>
                                    {visitedStops} / {totalStops} stops
                                  </strong>
                                  <span>
                                    {participant.game_points_awarded ?? 0} point
                                    {(participant.game_points_awarded ?? 0) === 1 ? "" : "s"} awarded
                                  </span>
                                </>
                              ) : (
                                <>
                                  <strong>
                                    {formatChallengeMetricValue(
                                      participant.metric_type,
                                      participant.progress_value,
                                    )}
                                  </strong>
                                  <span>
                                    of{" "}
                                    {formatChallengeMetricValue(
                                      participant.metric_type,
                                      participant.target_value,
                                    )}
                                  </span>
                                </>
                              )}
                            </div>
                            <span className="challenge-progress-percent">
                              {Math.round(participant.completion_percent)}%
                            </span>
                          </div>
                          <div className="challenge-progress-bar">
                            <span
                              className="challenge-progress-bar-fill"
                              style={{
                                width: `${Math.min(100, Math.max(0, participant.completion_percent))}%`,
                              }}
                            />
                          </div>

                          <div className="participant-card-meta">
                            {isCampaignParticipant ? (
                              <span>
                                {participant.member_count ?? 0} rider
                                {(participant.member_count ?? 0) === 1 ? "" : "s"}
                              </span>
                            ) : null}
                            {isScavengerHuntSelected ? (
                              <span>
                                {participant.game_points_awarded ?? 0} hunt point
                                {(participant.game_points_awarded ?? 0) === 1 ? "" : "s"}
                              </span>
                            ) : (
                              <span>
                                {participant.total_sessions} session
                                {participant.total_sessions !== 1 ? "s" : ""}
                              </span>
                            )}
                            <span>
                              Joined {formatDateTimeForDisplay(participant.joined_at)}
                            </span>
                            {participant.last_activity_at ? (
                              <span>
                                Last active{" "}
                                {formatDateTimeForDisplay(
                                  participant.last_activity_at ?? undefined,
                                )}
                              </span>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
                ) : null}

                {/* Live Progress — scavenger hunts, shown inside Participants tab */}
                {screenTab === "participants" && !isCreating && !isEditing && selectedChallenge && isScavengerHuntChallenge(selectedChallenge) ? (() => {
                  const checkpoints = (selectedChallenge.checkpoints ?? [])
                    .slice()
                    .sort((a, b) => a.sort_order - b.sort_order);
                  const totalCheckpoints = checkpoints.filter((cp) => cp.active).length || selectedChallenge.target_value;

                  const sorted = challengeParticipants.slice().sort((a, b) => {
                    const scoreA = a.completed ? -1 : a.active ? (a.visited_checkpoint_count ?? 0) : -2;
                    const scoreB = b.completed ? -1 : b.active ? (b.visited_checkpoint_count ?? 0) : -2;
                    if (a.completed && !b.completed) return 1;
                    if (!a.completed && b.completed) return -1;
                    if (!a.active && a.completed === false && b.active) return 1;
                    if (a.active && !b.active && b.completed === false) return -1;
                    return scoreB - scoreA;
                  });

                  const inProgress = sorted.filter((p) => p.active && !p.completed);
                  const completed = sorted.filter((p) => p.completed);
                  const left = sorted.filter((p) => !p.active && !p.completed);
                  const orderedParticipants = [
                    ...inProgress.sort((a, b) => (b.visited_checkpoint_count ?? 0) - (a.visited_checkpoint_count ?? 0)),
                    ...completed,
                    ...left,
                  ];

                  return (
                    <div className="challenge-participants-section">
                      <div className="challenge-participants-header">
                        <h4>Live Progress</h4>
                        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                          <div className="challenge-participant-stats">
                            <span><strong>{inProgress.length}</strong> in progress</span>
                            <span><strong>{completed.length}</strong> completed</span>
                            <span><strong>{left.length}</strong> left</span>
                          </div>
                          <button
                            type="button"
                            className="live-progress-map-toggle"
                            onClick={() => setShowLiveMap((v) => !v)}
                          >
                            {showLiveMap ? "Hide map" : "Show map"}
                          </button>
                        </div>
                      </div>

                      {showLiveMap && (
                        <div className="live-progress-map-section">
                          <div className="live-progress-map-legend">
                            <span className="live-progress-map-legend-item live-progress-map-legend-targeted">
                              <span className="live-progress-map-legend-dot" /> Current target
                            </span>
                            <span className="live-progress-map-legend-item">
                              <span className="live-progress-map-legend-dot live-progress-map-legend-dot-grey" /> Other stops
                            </span>
                          </div>
                          <div className="live-progress-map-container">
                            <LiveProgressMap
                              checkpoints={checkpoints}
                              inProgressParticipants={inProgress}
                              formatNebulaUserName={formatNebulaUserName}
                            />
                          </div>
                        </div>
                      )}

                      {challengeParticipantsBusy ? (
                        <p className="muted-text">Loading player progress…</p>
                      ) : orderedParticipants.length === 0 ? (
                        <p className="empty-state">No players have joined this game yet.</p>
                      ) : null}

                      <div className="live-progress-list">
                        {orderedParticipants.map((participant) => {
                          const name = formatNebulaUserName({
                            first_name: participant.first_name,
                            last_name: participant.last_name,
                            email: participant.email,
                            username: participant.username,
                          });
                          const avatarLetter = (participant.first_name?.[0] || participant.username?.[0] || "?").toUpperCase();
                          const visited = participant.visited_checkpoint_count ?? 0;
                          const currentCheckpoint = checkpoints[visited];
                          const stepLabel = participant.completed
                            ? `Finished all ${totalCheckpoints} stop${Number(totalCheckpoints) === 1 ? "" : "s"}`
                            : currentCheckpoint
                              ? `Step ${visited + 1} of ${totalCheckpoints} — ${currentCheckpoint.title || "Unnamed stop"}`
                              : `Step ${visited} of ${totalCheckpoints}`;

                          return (
                            <div className="live-progress-row" key={participant.participation_uuid}>
                              <div className="participant-avatar live-progress-avatar">
                                {avatarLetter}
                              </div>
                              <div className="live-progress-info">
                                <div className="live-progress-name">{name}</div>
                                <div className="live-progress-step muted-text">{stepLabel}</div>
                                <div className="live-progress-bar-wrap">
                                  <div className="live-progress-steps">
                                    {Array.from({ length: Number(totalCheckpoints) }).map((_, i) => (
                                      <div
                                        key={i}
                                        className={`live-progress-step-pip ${
                                          participant.completed || i < visited
                                            ? "live-progress-step-pip-done"
                                            : i === visited && !participant.completed
                                              ? "live-progress-step-pip-current"
                                              : "live-progress-step-pip-pending"
                                        }`}
                                      />
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <span
                                className={`challenge-status-badge ${
                                  participant.completed
                                    ? "challenge-status-live"
                                    : participant.active
                                      ? "challenge-status-upcoming"
                                      : "challenge-status-ended"
                                }`}
                              >
                                {participant.completed ? "Completed" : participant.active ? "In Progress" : "Left"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })() : null}
        </div>
      ) : null}
      {/* ── Stop editor modal ── */}
      {stopModal.open ? (() => {
        const d = stopModal.draft;
        const modalLat = parseFloat(d.latitude);
        const modalLng = parseFloat(d.longitude);
        const modalHasPin =
          Number.isFinite(modalLat) && Number.isFinite(modalLng) && modalLat !== 0;
        const modalPinValue: PackMapPoint | null = modalHasPin
          ? { lat: modalLat, lng: modalLng }
          : null;
        const modalRadiusM = parseFloat(d.radius_meters);
        const modalRadiusMeters =
          Number.isFinite(modalRadiusM) && modalRadiusM > 0 ? modalRadiusM : undefined;
        const stopLabel =
          stopModal.index !== null
            ? `Edit stop ${stopModal.index + 1}`
            : "New stop";
        const otherStopMarkers: PackMapMarker[] = challengeDraft.checkpoints.reduce<PackMapMarker[]>(
          (acc, cp, i) => {
            if (i === stopModal.index) return acc;
            const lat = parseFloat(cp.latitude);
            const lng = parseFloat(cp.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0) return acc;
            const r = parseFloat(cp.radius_meters);
            acc.push({
              id: cp.checkpoint_uuid || `other-${i}`,
              label: cp.title || `Stop ${i + 1}`,
              lat,
              lng,
              radiusMeters: Number.isFinite(r) && r > 0 ? r : undefined,
            });
            return acc;
          },
          [],
        );
        return (
          <div
            className="management-modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label={stopLabel}
            onClick={closeStopModal}
          >
            <div
              className="management-modal-sheet poi-editor-modal stop-modal-sheet"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="management-modal-header">
                <div>
                  <p className="eyebrow">Scavenger hunt</p>
                  <h3>{stopLabel}</h3>
                </div>
                <button
                  className="text-button management-modal-close"
                  type="button"
                  onClick={closeStopModal}
                >
                  Close
                </button>
              </div>

              {/* Body: map + fields */}
              <div className="management-modal-grid">
                {/* Map column */}
                <div className="management-modal-map">
                  <PackLocationPicker
                    value={modalPinValue}
                    radiusMeters={modalRadiusMeters}
                    otherMarkers={otherStopMarkers}
                    onChange={(point) =>
                      updateModalDraft({
                        latitude: String(point.lat),
                        longitude: String(point.lng),
                      })
                    }
                    onPlaceSelect={(point, label) =>
                      updateModalDraft({
                        latitude: String(point.lat),
                        longitude: String(point.lng),
                        title: d.title.trim() ? d.title : label,
                      })
                    }
                  />
                  {modalHasPin && (
                    <div className="challenge-stop-coords">
                      {modalLat.toFixed(5)}, {modalLng.toFixed(5)}
                      <button
                        type="button"
                        className="challenge-stop-clear-pin"
                        onClick={() =>
                          updateModalDraft({ latitude: "", longitude: "" })
                        }
                      >
                        ✕ Clear pin
                      </button>
                    </div>
                  )}
                </div>

                {/* Fields column */}
                <div className="data-section stop-modal-fields-col">
                  <div className="form-grid">
                    <label className="field field-span-2">
                      <span>Stop name</span>
                      <input
                        value={d.title}
                        onChange={(e) => updateModalDraft({ title: e.target.value })}
                        placeholder="Campus mural"
                        autoFocus
                      />
                    </label>

                    <label className="field field-span-2">
                      <span>Clue</span>
                      <input
                        value={d.clue}
                        onChange={(e) => updateModalDraft({ clue: e.target.value })}
                        placeholder="Find the wall with the bright blue lightning bolt."
                      />
                    </label>

                    <label className="field field-span-2">
                      <span>Description</span>
                      <textarea
                        value={d.description}
                        onChange={(e) =>
                          updateModalDraft({ description: e.target.value })
                        }
                        placeholder="Optional context shown after check-in."
                        rows={2}
                      />
                    </label>

                    <label className="field field-span-2">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <span>Check-in radius</span>
                        <span className="stop-radius-value">{d.radius_meters}m</span>
                      </div>
                      <div className="stop-radius-track">
                        <input
                          type="range"
                          className="stop-radius-slider"
                          min="10"
                          max="500"
                          step="5"
                          value={d.radius_meters}
                          onChange={(e) =>
                            updateModalDraft({ radius_meters: e.target.value })
                          }
                        />
                        <div className="stop-radius-range-labels">
                          <span>10m (tight)</span>
                          <span>500m (wide)</span>
                        </div>
                      </div>
                    </label>

                    <label className="field">
                      <span>Prize points</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={d.prize_points}
                        onChange={(e) =>
                          updateModalDraft({ prize_points: e.target.value })
                        }
                      />
                    </label>

                    <label className="field">
                      <span>Order</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={d.sort_order}
                        onChange={(e) =>
                          updateModalDraft({ sort_order: e.target.value })
                        }
                      />
                    </label>

                    <label className="field field-span-2" style={{ display: "block" }}>
                      <span>Stop image</span>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                          value={d.image_url}
                          onChange={(e) =>
                            updateModalDraft({ image_url: e.target.value })
                          }
                          placeholder="https://example.com/stop.jpg"
                          style={{ flex: 1, minWidth: 0 }}
                        />
                        {uploadStopImage && (
                          <label
                            className="secondary-button"
                            style={{ flexShrink: 0, cursor: stopImageBusy ? "default" : "pointer", opacity: stopImageBusy ? 0.6 : 1 }}
                          >
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              style={{ display: "none" }}
                              onChange={handleStopImageUpload}
                              disabled={stopImageBusy}
                            />
                            {stopImageBusy ? "Uploading…" : "Upload"}
                          </label>
                        )}
                      </div>
                      {d.image_url && (
                        <img
                          src={d.image_url}
                          alt="Stop preview"
                          style={{ width: "100%", maxHeight: "120px", objectFit: "cover", borderRadius: "8px", marginTop: "6px" }}
                        />
                      )}
                    </label>

                    <label className="pz-toggle field-span-2" style={{ justifySelf: "start" }}>
                      <input
                        type="checkbox"
                        checked={d.active}
                        onChange={(e) => updateModalDraft({ active: e.target.checked })}
                      />
                      <span className="pz-toggle-track" />
                      <span className="pz-toggle-label">Active</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Footer actions */}
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeStopModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={saveStopModal}
                >
                  {stopModal.index !== null ? "Save changes" : "Add stop"}
                </button>
              </div>
            </div>
          </div>
        );
      })() : null}
    </section>
  );
}
