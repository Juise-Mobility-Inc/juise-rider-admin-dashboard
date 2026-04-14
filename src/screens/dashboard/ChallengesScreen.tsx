import type { ChangeEvent, ComponentType, Dispatch, FormEvent, SetStateAction } from "react";

import type {
  SchoolChallenge,
  SchoolChallengeParticipantProgress,
} from "../../lib/api";

type ChallengeDraft = {
  challenge_uuid: string;
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
    DetailRow,
    newChallengeSelectionId,
    handleImagePreview,
  } = props;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Campaigns</p>
          <h2>Manage school challenges</h2>
        </div>
        <div className="form-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setSelectedChallengeId(newChallengeSelectionId);
              setChallengeDraft(createEmptyChallengeDraft());
            }}
            disabled={!activeSchoolId}
          >
            New Challenge
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
        <p className="empty-state">
          This admin login is not scoped to a school.
        </p>
      ) : null}

      {activeSchoolId ? (
        <div className="challenge-layout">
          <div className="challenge-editor">
            <form className="school-form" onSubmit={handleSaveChallenge}>
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Challenge Editor</p>
                  <h3>
                    {challengeDraft.challenge_uuid
                      ? "Edit existing challenge"
                      : "Create a new challenge"}
                  </h3>
                </div>
                {challengeBusy ? <span className="muted-text">Saving…</span> : null}
              </div>

              <div className="form-grid">
                <label className="field">
                  <span>Title</span>
                  <input
                    value={challengeDraft.title}
                    onChange={(event) =>
                      setChallengeDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Ride 25 miles in 7 days"
                  />
                </label>
                <label className="field">
                  <span>Metric</span>
                  <select
                    value={challengeDraft.metric_type}
                    onChange={(event) =>
                      setChallengeDraft((current) => ({
                        ...current,
                        metric_type: event.target.value as ChallengeDraft["metric_type"],
                        target_value:
                          event.target.value === "points"
                            ? current.metric_type === "points"
                              ? current.target_value
                              : "100"
                            : current.metric_type === "distance_miles"
                              ? current.target_value
                              : "10",
                      }))
                    }
                  >
                    <option value="distance_miles">Distance in miles</option>
                    <option value="points">Points</option>
                  </select>
                </label>
                <label className="field">
                  <span>
                    Target{" "}
                    {challengeDraft.metric_type === "points"
                      ? "(points)"
                      : "(miles)"}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step={challengeDraft.metric_type === "points" ? "1" : "0.1"}
                    value={challengeDraft.target_value}
                    onChange={(event) =>
                      setChallengeDraft((current) => ({
                        ...current,
                        target_value: event.target.value,
                      }))
                    }
                    placeholder={challengeDraft.metric_type === "points" ? "100" : "10"}
                  />
                </label>
                <label className="field checkbox-field">
                  <span>Active</span>
                  <input
                    type="checkbox"
                    checked={challengeDraft.active}
                    onChange={(event) =>
                      setChallengeDraft((current) => ({
                        ...current,
                        active: event.target.checked,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Start</span>
                  <input
                    type="datetime-local"
                    value={challengeDraft.start_time}
                    onChange={(event) =>
                      setChallengeDraft((current) => ({
                        ...current,
                        start_time: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>End</span>
                  <input
                    type="datetime-local"
                    value={challengeDraft.end_time}
                    onChange={(event) =>
                      setChallengeDraft((current) => ({
                        ...current,
                        end_time: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field field-span-2">
                  <span>Description</span>
                  <textarea
                    value={challengeDraft.description}
                    onChange={(event) =>
                      setChallengeDraft((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Invite students to participate and explain how they win."
                    rows={5}
                  />
                </label>
                <div className="field field-span-2">
                  <span>Challenge Image</span>
                  <div className="challenge-image-field">
                    <EntityImagePreview
                      imageUrl={challengeDraft.image_url}
                      label={challengeDraft.title || "School"}
                      altSuffix="challenge"
                      fallbackLabel="Challenge image preview"
                    />
                    <div className="challenge-image-field-controls">
                      <label className="field">
                        <span>Image URL</span>
                        <input
                          value={challengeDraft.image_url}
                          onChange={(event) =>
                            setChallengeDraft((current) => ({
                              ...current,
                              image_url: event.target.value,
                            }))
                          }
                          placeholder="https://example.com/challenge-cover.jpg"
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
                          {challengeImageUploadBusy ? "Uploading..." : "Upload Image"}
                        </label>
                        {challengeDraft.image_url.trim() ? (
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() =>
                              setChallengeDraft((current) => ({
                                ...current,
                                image_url: "",
                              }))
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
              </div>

              <div className="detail-grid">
                <DetailRow
                  label="Goal"
                  value={formatChallengeMetricValue(
                    challengeDraft.metric_type,
                    Number(challengeDraft.target_value),
                  )}
                />
                <DetailRow
                  label="Window"
                  value={
                    challengeDraft.start_time && challengeDraft.end_time
                      ? `${challengeDraft.start_time.replace("T", " ")} to ${challengeDraft.end_time.replace("T", " ")}`
                      : "Set a start and end time"
                  }
                />
              </div>

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
                <button className="primary-button" type="submit" disabled={challengeBusy}>
                  {challengeDraft.challenge_uuid ? "Save Challenge" : "Create Challenge"}
                </button>
              </div>
            </form>
          </div>

          <div className="challenge-sidebar">
            <div className="data-section">
              <div className="data-section-header">
                <h4>Challenge library</h4>
                <span>{currentAndUpcomingChallenges.length}</span>
              </div>
              {challengeListBusy ? (
                <p className="muted-text">Loading challenges…</p>
              ) : null}
              {!challengeListBusy && currentAndUpcomingChallenges.length === 0 ? (
                <p className="empty-state">
                  No live or upcoming challenges are in the library right now.
                </p>
              ) : null}
              <div className="challenge-list">
                {currentAndUpcomingChallenges.map((challenge) => {
                  const status = resolveChallengeStatus(challenge);
                  return (
                    <button
                      key={challenge.challenge_uuid}
                      className={`challenge-card ${
                        challenge.challenge_uuid === selectedChallengeId
                          ? "challenge-card-active"
                          : ""
                      }`}
                      type="button"
                      onClick={() => setSelectedChallengeId(challenge.challenge_uuid)}
                    >
                      {challenge.image_url.trim() ? (
                        <img
                          className="challenge-card-image"
                          src={challenge.image_url}
                          alt={`${challenge.title} challenge`}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleImagePreview(
                              challenge.image_url,
                              `${challenge.title} challenge`,
                              challenge.title,
                            );
                          }}
                        />
                      ) : null}
                      <div className="challenge-card-header">
                        <strong>{challenge.title}</strong>
                        <span className="student-badge">{status}</span>
                      </div>
                      <span>
                        {formatChallengeMetricValue(
                          challenge.metric_type,
                          challenge.target_value,
                        )}
                      </span>
                      <span>
                        {formatDateTimeForDisplay(challenge.start_time)} -{" "}
                        {formatDateTimeForDisplay(challenge.end_time)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="data-section">
              <div className="data-section-header">
                <h4>Past challenges</h4>
                <span>{pastChallenges.length}</span>
              </div>
              {!challengeListBusy && pastChallenges.length === 0 ? (
                <p className="empty-state">
                  Ended challenges will move here once their campaign window
                  closes.
                </p>
              ) : null}
              <div className="challenge-list">
                {pastChallenges.map((challenge) => {
                  const status = resolveChallengeStatus(challenge);
                  return (
                    <button
                      key={challenge.challenge_uuid}
                      className={`challenge-card ${
                        challenge.challenge_uuid === selectedChallengeId
                          ? "challenge-card-active"
                          : ""
                      }`}
                      type="button"
                      onClick={() => setSelectedChallengeId(challenge.challenge_uuid)}
                    >
                      {challenge.image_url.trim() ? (
                        <img
                          className="challenge-card-image"
                          src={challenge.image_url}
                          alt={`${challenge.title} challenge`}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleImagePreview(
                              challenge.image_url,
                              `${challenge.title} challenge`,
                              challenge.title,
                            );
                          }}
                        />
                      ) : null}
                      <div className="challenge-card-header">
                        <strong>{challenge.title}</strong>
                        <span className="student-badge">{status}</span>
                      </div>
                      <span>
                        {formatChallengeMetricValue(
                          challenge.metric_type,
                          challenge.target_value,
                        )}
                      </span>
                      <span>
                        {formatDateTimeForDisplay(challenge.start_time)} -{" "}
                        {formatDateTimeForDisplay(challenge.end_time)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="data-section">
              <div className="data-section-header">
                <h4>Student progress</h4>
                <span>{challengeParticipantSummary.joined}</span>
              </div>

              {!selectedChallenge ? (
                <p className="empty-state">
                  Select a saved challenge to review student enrollment and
                  progress.
                </p>
              ) : (
                <>
                  <div className="detail-grid">
                    <DetailRow
                      label="Status"
                      value={resolveChallengeStatus(selectedChallenge)}
                    />
                    <DetailRow
                      label="Goal"
                      value={formatChallengeMetricValue(
                        selectedChallenge.metric_type,
                        selectedChallenge.target_value,
                      )}
                    />
                    <DetailRow
                      label="Joined"
                      value={String(challengeParticipantSummary.joined)}
                    />
                    <DetailRow
                      label="Completed"
                      value={String(challengeParticipantSummary.completed)}
                    />
                  </div>

                  {challengeParticipantsBusy ? (
                    <p className="muted-text">Loading student challenge progress…</p>
                  ) : null}
                  {!challengeParticipantsBusy && challengeParticipants.length === 0 ? (
                    <p className="empty-state">
                      No students have joined this challenge yet.
                    </p>
                  ) : null}

                  <div className="participant-progress-list">
                    {challengeParticipants.map((participant) => (
                      <article
                        className="participant-progress-card"
                        key={participant.participation_uuid}
                      >
                        <div className="student-roster-header">
                          <div>
                            <p className="eyebrow">Student</p>
                            <h3>
                              {formatNebulaUserName({
                                first_name: participant.first_name,
                                last_name: participant.last_name,
                                email: participant.email,
                                username: participant.username,
                              })}
                            </h3>
                          </div>
                          <div className="student-roster-badges">
                            <span className="student-badge">
                              {participant.completed
                                ? "Completed"
                                : participant.active
                                  ? "In Progress"
                                  : "Left"}
                            </span>
                            <span className="student-badge student-badge-muted">
                              {participant.student_id || "No student ID"}
                            </span>
                          </div>
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
                              Goal{" "}
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
                              width: `${Math.min(
                                100,
                                Math.max(0, participant.completion_percent),
                              )}%`,
                            }}
                          />
                        </div>

                        <div className="detail-grid">
                          <DetailRow
                            label="Username"
                            value={
                              participant.username ||
                              participant.email ||
                              participant.user_uuid
                            }
                          />
                          <DetailRow
                            label="Sessions"
                            value={String(participant.total_sessions)}
                          />
                          <DetailRow
                            label="Joined"
                            value={formatDateTimeForDisplay(participant.joined_at)}
                          />
                          <DetailRow
                            label="Last Activity"
                            value={formatDateTimeForDisplay(
                              participant.last_activity_at ?? undefined,
                            )}
                          />
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
