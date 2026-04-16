import type { ChangeEvent, ComponentType, Dispatch, FormEvent, SetStateAction } from "react";

import type {
  SchoolChallenge,
  SchoolChallengeParticipantProgress,
} from "../../lib/api";

type ChallengeDraft = {
  challenge_uuid: string;
  audience_type: "user" | "campaign_group";
  title: string;
  description: string;
  image_url: string;
  metric_type: "distance_miles" | "points";
  target_value: string;
  start_time: string;
  end_time: string;
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

type Props = {
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

export function ChallengesScreen(props: Props) {
  const {
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
    handleChallengeImageFileChange,
    selectedChallenge,
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
  } = props;

  const isCreating =
    selectedChallengeId === newChallengeSelectionId && !challengeDraft.challenge_uuid;
  const isEditing = Boolean(challengeDraft.challenge_uuid);
  const nothingSelected = !selectedChallengeId || (selectedChallengeId !== newChallengeSelectionId && !selectedChallenge);
  const selectedChallengeIsCampaign =
    selectedChallenge?.audience_type === "campaign_group";

  function handleSelectNew() {
    setSelectedChallengeId(newChallengeSelectionId);
    setChallengeDraft(createEmptyChallengeDraft());
  }

  return (
    <section className="panel challenge-master-panel">
      {/* ── Page header ── */}
      <div className="panel-header">
        <div>
          <p className="eyebrow">Campaigns</p>
          <h2>School challenges</h2>
        </div>
        <div className="form-actions">
          <button
            className="primary-button"
            type="button"
            onClick={handleSelectNew}
            disabled={!activeSchoolId}
          >
            + New Challenge
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

      {activeSchoolId ? (
        <div className="challenge-layout">
          {/* ══ LEFT: challenge list ══ */}
          <div className="challenge-sidebar-list">
            {/* Active & Upcoming */}
            <div className="challenge-list-section">
              <div className="challenge-list-section-header">
                <span>Active &amp; Upcoming</span>
                <span className="challenge-list-count">
                  {currentAndUpcomingChallenges.length}
                </span>
              </div>

              {challengeListBusy ? (
                <p className="muted-text" style={{ padding: "8px 0" }}>Loading…</p>
              ) : currentAndUpcomingChallenges.length === 0 ? (
                <p className="challenge-list-empty">
                  No live or upcoming challenges yet.
                </p>
              ) : null}

              <div className="challenge-roster">
                {currentAndUpcomingChallenges.map((ch) => {
                  const status = resolveChallengeStatus(ch);
                  const isSelected = ch.challenge_uuid === selectedChallengeId;
                  return (
                    <button
                      key={ch.challenge_uuid}
                      className={`challenge-roster-item ${isSelected ? "challenge-roster-item-active" : ""}`}
                      type="button"
                      onClick={() => setSelectedChallengeId(ch.challenge_uuid)}
                    >
                      <div className="challenge-roster-thumb">
                        {ch.image_url.trim() ? (
                          <img
                            src={ch.image_url}
                            alt={ch.title}
                            className="challenge-roster-img"
                          />
                        ) : (
                          <span className="challenge-roster-img-fallback">🏆</span>
                        )}
                      </div>
                      <div className="challenge-roster-info">
                        <strong className="challenge-roster-title">{ch.title}</strong>
                        <span className="challenge-roster-meta">
                          {formatChallengeAudienceLabel(ch.audience_type)} challenge ·{" "}
                          {formatChallengeMetricValue(ch.metric_type, ch.target_value)}
                        </span>
                      </div>
                      <span className={`challenge-status-badge ${statusClass(status)}`}>
                        {status}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Past challenges */}
            <div className="challenge-list-section">
              <div className="challenge-list-section-header">
                <span>Past</span>
                <span className="challenge-list-count">{pastChallenges.length}</span>
              </div>

              {!challengeListBusy && pastChallenges.length === 0 ? (
                <p className="challenge-list-empty">
                  Ended challenges will appear here.
                </p>
              ) : null}

              <div className="challenge-roster">
                {pastChallenges.map((ch) => {
                  const status = resolveChallengeStatus(ch);
                  const isSelected = ch.challenge_uuid === selectedChallengeId;
                  return (
                    <button
                      key={ch.challenge_uuid}
                      className={`challenge-roster-item ${isSelected ? "challenge-roster-item-active" : ""}`}
                      type="button"
                      onClick={() => setSelectedChallengeId(ch.challenge_uuid)}
                    >
                      <div className="challenge-roster-thumb">
                        {ch.image_url.trim() ? (
                          <img
                            src={ch.image_url}
                            alt={ch.title}
                            className="challenge-roster-img"
                          />
                        ) : (
                          <span className="challenge-roster-img-fallback">🏆</span>
                        )}
                      </div>
                      <div className="challenge-roster-info">
                        <strong className="challenge-roster-title">{ch.title}</strong>
                        <span className="challenge-roster-meta">
                          {formatChallengeAudienceLabel(ch.audience_type)} challenge ·{" "}
                          {formatChallengeMetricValue(ch.metric_type, ch.target_value)}
                        </span>
                      </div>
                      <span className={`challenge-status-badge ${statusClass(status)}`}>
                        {status}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ══ RIGHT: detail / create panel ══ */}
          <div className="challenge-detail-panel">
            {/* Empty state */}
            {nothingSelected ? (
              <div className="challenge-empty-detail">
                <span className="challenge-empty-icon">🏆</span>
                <h3>Select a challenge</h3>
                <p>
                  Choose a challenge from the list to view its details, student
                  progress, and edit it — or create a new one.
                </p>
                <button
                  className="primary-button"
                  type="button"
                  onClick={handleSelectNew}
                >
                  + New Challenge
                </button>
              </div>
            ) : null}

            {/* Create / Edit form */}
            {(isCreating || isEditing) ? (
              <form className="challenge-editor-form" onSubmit={handleSaveChallenge}>
                {/* Form header */}
                <div className="challenge-form-header">
                  <div>
                    <p className="eyebrow">
                      {isEditing ? "Editing challenge" : "New challenge"}
                    </p>
                    <h3>
                      {challengeDraft.title.trim() || (isEditing ? "Untitled" : "Create a challenge")}
                    </h3>
                  </div>
                  {challengeBusy ? <span className="muted-text">Saving…</span> : null}
                </div>

                {/* Live preview chip row */}
                <div className="challenge-form-preview-row">
                  {challengeDraft.image_url.trim() ? (
                    <img
                      src={challengeDraft.image_url}
                      alt="Challenge cover"
                      className="challenge-form-preview-img"
                      onClick={() =>
                        handleImagePreview(
                          challengeDraft.image_url,
                          challengeDraft.title || "Challenge",
                        )
                      }
                    />
                  ) : null}
                  <div className="challenge-form-preview-chips">
                    <span className="challenge-form-chip">
                      {formatChallengeAudienceLabel(challengeDraft.audience_type)} challenge
                    </span>
                    {challengeDraft.metric_type && challengeDraft.target_value ? (
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
                  <div className="form-grid">
                    <label className="field">
                      <span>Audience</span>
                      <select
                        value={challengeDraft.audience_type}
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
                    <label className="field field-span-2">
                      <span>Title</span>
                      <input
                        value={challengeDraft.title}
                        onChange={(e) =>
                          setChallengeDraft((c) => ({ ...c, title: e.target.value }))
                        }
                        placeholder="Ride 25 miles in 7 days"
                      />
                    </label>
                    <label className="field field-span-2">
                      <span>Description</span>
                      <textarea
                        value={challengeDraft.description}
                        onChange={(e) =>
                          setChallengeDraft((c) => ({ ...c, description: e.target.value }))
                        }
                        placeholder="Invite students to participate and explain how they win."
                        rows={3}
                      />
                    </label>
                  </div>
                </div>

                {/* Section: Goal */}
                <div className="challenge-form-section">
                  <div className="challenge-form-section-label">Goal</div>
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

                {/* Section: Cover image */}
                <div className="challenge-form-section">
                  <div className="challenge-form-section-label">Cover image</div>
                  <div className="challenge-image-field">
                    <EntityImagePreview
                      imageUrl={challengeDraft.image_url}
                      label={challengeDraft.title || "Challenge"}
                      altSuffix="challenge"
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
                        : "Create Challenge"}
                  </button>
                  {isCreating ? (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setSelectedChallengeId("")}
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </form>
            ) : null}

            {/* Selected existing challenge detail */}
            {selectedChallenge && !isCreating ? (
              <div className="challenge-detail-view">
                {/* Cover + title hero */}
                <div className="challenge-detail-hero">
                  {selectedChallenge.image_url.trim() ? (
                    <img
                      className="challenge-detail-cover"
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
                  ) : null}
                  <div className="challenge-detail-hero-info">
                    <div className="challenge-detail-hero-badges">
                      <span
                        className={`challenge-status-badge ${statusClass(resolveChallengeStatus(selectedChallenge))}`}
                      >
                        {resolveChallengeStatus(selectedChallenge)}
                      </span>
                      {selectedChallenge.active ? null : (
                        <span className="challenge-status-badge challenge-status-ended">
                          Inactive
                        </span>
                      )}
                    </div>
                    <h3 className="challenge-detail-title">{selectedChallenge.title}</h3>
                    {selectedChallenge.description ? (
                      <p className="challenge-detail-desc">
                        {selectedChallenge.description}
                      </p>
                    ) : null}
                    <div className="challenge-detail-chips">
                      <span className="challenge-form-chip">
                        {formatChallengeAudienceLabel(selectedChallenge.audience_type)} challenge
                      </span>
                      <span className="challenge-form-chip">
                        🎯{" "}
                        {formatChallengeMetricValue(
                          selectedChallenge.metric_type,
                          selectedChallenge.target_value,
                        )}
                      </span>
                      <span className="challenge-form-chip">
                        📅 {formatDateTimeForDisplay(selectedChallenge.start_time)} →{" "}
                        {formatDateTimeForDisplay(selectedChallenge.end_time)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Edit button */}
                <div className="form-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() =>
                      setChallengeDraft({
                        challenge_uuid: selectedChallenge.challenge_uuid,
                        audience_type: selectedChallenge.audience_type,
                        title: selectedChallenge.title,
                        description: selectedChallenge.description,
                        image_url: selectedChallenge.image_url,
                        metric_type: selectedChallenge.metric_type,
                        target_value: String(selectedChallenge.target_value),
                        start_time: selectedChallenge.start_time
                          ? new Date(selectedChallenge.start_time)
                              .toISOString()
                              .slice(0, 16)
                          : "",
                        end_time: selectedChallenge.end_time
                          ? new Date(selectedChallenge.end_time)
                              .toISOString()
                              .slice(0, 16)
                          : "",
                        active: selectedChallenge.active,
                      })
                    }
                  >
                    Edit Challenge
                  </button>
                </div>

                {/* Participant stats */}
                <div className="challenge-participants-section">
                  <div className="challenge-participants-header">
                    <h4>
                      {selectedChallengeIsCampaign
                        ? "Campaign progress"
                        : "Student progress"}
                    </h4>
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
                  </div>

                  {challengeParticipantsBusy ? (
                    <p className="muted-text">
                      Loading {selectedChallengeIsCampaign ? "campaign" : "student"} progress…
                    </p>
                  ) : !challengeParticipantsBusy && challengeParticipants.length === 0 ? (
                    <p className="empty-state">
                      {selectedChallengeIsCampaign
                        ? "No campaign groups have joined this challenge yet."
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
                            <span>
                              {participant.total_sessions} session
                              {participant.total_sessions !== 1 ? "s" : ""}
                            </span>
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
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
