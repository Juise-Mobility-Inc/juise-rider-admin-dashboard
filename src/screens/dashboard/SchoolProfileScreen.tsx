import type {
  ChangeEvent,
  ComponentType,
  CSSProperties,
  Dispatch,
  FormEvent,
  SetStateAction,
} from "react";

import type { SchoolColorScheme } from "../../lib/api";
import { resolveAppPreviewTheme } from "../../lib/appPreviewTheme";

type SchoolColorField = {
  key: keyof SchoolColorScheme;
  label: string;
  fallback: string;
};

const ICON = {
  menu: "M4 7h16M4 12h16M4 17h16",
  home: "M4 11 12 4l8 7M6 10v9h12v-9",
  flag: "M6 3v18M6 4h11l-2 4 2 4H6",
  people:
    "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c0-3 2.7-5 6-5s6 2 6 5M17 13a3 3 0 1 0 0-6M15.5 20c0-2.4 1.6-4.3 4-4.6",
  bell: "M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0",
  play: "M8 5v14l11-7z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4",
  arrow: "M5 12h13M13 6l6 6-6 6",
};

function GlyphIcon({ path, filled }: { path: string; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      aria-hidden="true"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={filled ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

type SchoolLogoPreviewProps = {
  logoUrl?: string;
  label: string;
  size?: "header" | "field" | "tiny";
};

type SchoolDraft = {
  school_id: string;
  name: string;
  title: string;
  logo_url: string;
  default_campus_id: string;
  color_scheme: SchoolColorScheme;
  metadata: string;
  active: boolean;
};

type SchoolPreviewStyle = CSSProperties & Record<string, string>;

type TermDraft = {
  id: string;
  term_uuid: string;
  name: string;
  start_date: string;
  end_date: string;
};

type Props = {
  activeSchoolId: string;
  schoolBusy: boolean;
  schoolLogoUploadBusy: boolean;
  schoolDraft: SchoolDraft;
  setSchoolDraft: Dispatch<SetStateAction<SchoolDraft>>;
  schoolColorFields: SchoolColorField[];
  handleSaveSchool: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  refreshActiveSchool: () => Promise<void>;
  handleSchoolColorChange: (
    key: keyof SchoolColorScheme,
    value: string,
  ) => void;
  handleSchoolLogoFileChange: (
    event: ChangeEvent<HTMLInputElement>,
  ) => void | Promise<void>;
  getColorPickerValue: (
    value: string | undefined,
    fallback: keyof Required<SchoolColorScheme>,
  ) => string;
  resolvedSchoolLogoUrl: string;
  termDrafts: TermDraft[];
  setTermDrafts: Dispatch<SetStateAction<TermDraft[]>>;
  createEmptyTermDraft: () => TermDraft;
  SchoolLogoPreview: ComponentType<SchoolLogoPreviewProps>;
};

export function SchoolProfileScreen(props: Props) {
  const {
    activeSchoolId,
    schoolBusy,
    schoolLogoUploadBusy,
    schoolDraft,
    setSchoolDraft,
    schoolColorFields,
    handleSaveSchool,
    refreshActiveSchool,
    handleSchoolColorChange,
    handleSchoolLogoFileChange,
    getColorPickerValue,
    resolvedSchoolLogoUrl,
    termDrafts,
    setTermDrafts,
    createEmptyTermDraft,
    SchoolLogoPreview,
  } = props;

  // `name` and `title` are kept identical from this screen (the backend has
  // no behavioural use for two), so name wins here.
  const schoolLabel =
    schoolDraft.name.trim() ||
    schoolDraft.title.trim() ||
    activeSchoolId ||
    "School profile";
  const busy = schoolBusy || schoolLogoUploadBusy;
  const busyLabel = schoolLogoUploadBusy
    ? "Uploading logo…"
    : schoolBusy
      ? "Saving changes…"
      : "";
  const previewLogoUrl = resolvedSchoolLogoUrl || schoolDraft.logo_url;
  // Derive the full app palette (surfaces, text, borders) from the five brand
  // colors exactly the way the customer app does, so the preview is honest.
  const appTheme = resolveAppPreviewTheme(schoolDraft.color_scheme);
  const swatchColors: Required<SchoolColorScheme> = {
    primary: appTheme.primary,
    secondary: appTheme.secondary,
    accent: appTheme.accent,
    background: appTheme.background,
    text: appTheme.text,
  };
  const previewStyle: SchoolPreviewStyle = {
    "--app-primary": appTheme.primary,
    "--app-primary-tint": appTheme.primaryTint,
    "--app-on-primary": appTheme.onPrimary,
    "--app-bg": appTheme.background,
    "--app-text": appTheme.text,
    "--app-faded": appTheme.fadedText,
    "--app-surface": appTheme.surface,
    "--app-surface-elevated": appTheme.surfaceElevated,
    "--app-border-muted": appTheme.borderMuted,
    "--app-border-accent": appTheme.borderAccent,
    "--app-accent": appTheme.accent,
  };

  function updateTerm(id: string, patch: Partial<TermDraft>) {
    setTermDrafts((current) =>
      current.map((term) => (term.id === id ? { ...term, ...patch } : term)),
    );
  }

  return (
    <section className="sp-screen">
      <header className="panel sp-header">
        <div className="sp-header-main">
          <p className="eyebrow">School profile</p>
          <h2>{schoolLabel}</h2>
          <p className="muted-text sp-header-copy">
            Configure your school details, including branding, academic term
            limits, and visibility in the app.
          </p>
        </div>
        <span
          className={`sp-status ${
            schoolDraft.active ? "is-active" : "is-inactive"
          }`}
        >
          {schoolDraft.active ? "Active" : "Inactive"}
        </span>
      </header>

      {!activeSchoolId ? (
        <section className="panel">
          <p className="empty-state">
            This admin login is not scoped to a school.
          </p>
        </section>
      ) : (
        <form className="sp-form" onSubmit={handleSaveSchool}>
          <div className="sp-layout">
            <div className="sp-main">
              <section className="panel sp-card">
                <div className="sp-card-head">
                  <p className="eyebrow">Identity</p>
                  <h3>Name &amp; logo</h3>
                </div>

                <div className="sp-logo-row">
                  <SchoolLogoPreview
                    key={`logo-${previewLogoUrl || "fallback"}`}
                    logoUrl={previewLogoUrl}
                    label={schoolLabel}
                    size="tiny"
                  />
                  <div className="sp-logo-actions">
                    <label
                      className={`secondary-button upload-button${
                        schoolLogoUploadBusy ? " upload-button-busy" : ""
                      }`}
                      aria-disabled={busy}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleSchoolLogoFileChange}
                        disabled={busy}
                      />
                      {schoolLogoUploadBusy
                        ? "Uploading…"
                        : previewLogoUrl
                          ? "Replace logo"
                          : "Upload logo"}
                    </label>
                    {schoolDraft.logo_url.trim() ? (
                      <button
                        type="button"
                        className="text-button sp-logo-remove"
                        onClick={() =>
                          setSchoolDraft((current) => ({
                            ...current,
                            logo_url: "",
                          }))
                        }
                        disabled={busy}
                      >
                        Remove logo
                      </button>
                    ) : null}
                  </div>
                </div>

                <label className="field">
                  <span>School name</span>
                  <input
                    value={schoolDraft.name}
                    onChange={(event) =>
                      setSchoolDraft((current) => ({
                        ...current,
                        // One name, stored to both columns.
                        name: event.target.value,
                        title: event.target.value,
                      }))
                    }
                    placeholder="University Name"
                  />
                  <small>Shown to students in the app and on their passes.</small>
                </label>

                <label className="field checkbox-field sp-active-field">
                  <div className="sp-checkbox-row">
                    <input
                      type="checkbox"
                      checked={schoolDraft.active}
                      onChange={(event) =>
                        setSchoolDraft((current) => ({
                          ...current,
                          active: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      <strong>Visible in the app</strong>
                      <small>
                        Students and school admins can see and join this school.
                      </small>
                    </span>
                  </div>
                </label>
              </section>

              <section className="panel sp-card">
                <div className="sp-card-head">
                  <p className="eyebrow">Brand colors</p>
                  <h3>App theme</h3>
                  <p className="muted-text">
                    Drives the buttons, headers, and accents students see.
                  </p>
                </div>

                <div className="sp-color-list">
                  {schoolColorFields.map((field) => (
                    <label className="field sp-color-field" key={field.key}>
                      <span>{field.label}</span>
                      <div className="sp-color-control">
                        <span
                          className="sp-color-dot"
                          style={{ background: swatchColors[field.key] }}
                          aria-hidden="true"
                        />
                        <input
                          type="text"
                          className="sp-color-hex"
                          value={schoolDraft.color_scheme[field.key] ?? ""}
                          onChange={(event) =>
                            handleSchoolColorChange(
                              field.key,
                              event.target.value,
                            )
                          }
                          placeholder={field.fallback}
                          spellCheck={false}
                          aria-label={`${field.label} colour hex`}
                        />
                        <input
                          type="color"
                          className="sp-color-picker"
                          value={getColorPickerValue(
                            schoolDraft.color_scheme[field.key],
                            field.key as keyof Required<SchoolColorScheme>,
                          )}
                          onChange={(event) =>
                            handleSchoolColorChange(
                              field.key,
                              event.target.value,
                            )
                          }
                          aria-label={`${field.label} colour`}
                        />
                      </div>
                    </label>
                  ))}
                </div>
              </section>

              <section className="panel sp-card">
                <div className="sp-card-head sp-card-head-row">
                  <div>
                    <p className="eyebrow">Academic calendar</p>
                    <h3>Terms</h3>
                  </div>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() =>
                      setTermDrafts((current) => [
                        ...current,
                        createEmptyTermDraft(),
                      ])
                    }
                    disabled={busy}
                  >
                    Add term
                  </button>
                </div>

                {termDrafts.length === 0 ? (
                  <p className="empty-state">No terms configured yet.</p>
                ) : (
                  <div className="sp-term-list">
                    {termDrafts.map((term, index) => (
                      <div className="sp-term" key={term.id}>
                        <div className="sp-term-head">
                          <strong>
                            {term.name.trim() || `Term ${index + 1}`}
                          </strong>
                          <div className="sp-term-head-meta">
                            <span className="sp-term-tag">
                              {term.term_uuid.trim() ? "Saved" : "New"}
                            </span>
                            <button
                              className="text-button sp-term-remove"
                              type="button"
                              onClick={() =>
                                setTermDrafts((current) =>
                                  current.filter((item) => item.id !== term.id),
                                )
                              }
                              disabled={busy}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        <div className="sp-term-fields">
                          <label className="field">
                            <span>Term name</span>
                            <input
                              value={term.name}
                              onChange={(event) =>
                                updateTerm(term.id, {
                                  name: event.target.value,
                                })
                              }
                              placeholder={`Term ${index + 1}`}
                            />
                          </label>
                          <label className="field">
                            <span>Start date</span>
                            <input
                              type="date"
                              value={term.start_date}
                              onChange={(event) =>
                                updateTerm(term.id, {
                                  start_date: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label className="field">
                            <span>End date</span>
                            <input
                              type="date"
                              value={term.end_date}
                              onChange={(event) =>
                                updateTerm(term.id, {
                                  end_date: event.target.value,
                                })
                              }
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <aside className="sp-side">
              <div className="sp-preview" style={previewStyle}>
                <span className="sp-preview-label">App preview</span>
                <div className="sp-phone">
                  <div className="sp-phone-header">
                    <GlyphIcon path={ICON.menu} />
                    <span className="sp-phone-title">{schoolLabel}</span>
                    <span className="sp-phone-badge" aria-hidden="true" />
                  </div>

                  <div className="sp-phone-body">
                    <div className="sp-phone-card">
                      <SchoolLogoPreview
                        key={`preview-${previewLogoUrl || "fallback"}`}
                        logoUrl={previewLogoUrl}
                        label={schoolLabel}
                        size="tiny"
                      />
                      <div className="sp-phone-card-text">
                        <span>Your school</span>
                        <strong>
                          {schoolDraft.name.trim() || "School name"}
                        </strong>
                      </div>
                    </div>

                    <div className="sp-today">
                      <span className="sp-today-bar" aria-hidden="true" />
                      <div className="sp-today-head">
                        <div className="sp-today-copy">
                          <span className="sp-today-eyebrow">
                            <GlyphIcon path={ICON.sun} />
                            Today&apos;s points
                          </span>
                          <span className="sp-today-desc">
                            Rides at {schoolDraft.name.trim() || schoolLabel}
                          </span>
                        </div>
                        <div className="sp-today-value">
                          <strong>+50</strong>
                          <span>points today</span>
                        </div>
                      </div>
                      <div className="sp-today-action">
                        <span>Start a ride to earn more points</span>
                        <span
                          className="sp-today-action-btn"
                          aria-hidden="true"
                        >
                          <GlyphIcon path={ICON.arrow} />
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="sp-phone-tabs">
                    <span className="sp-phone-tab is-active">
                      <GlyphIcon path={ICON.home} />
                      <em>Home</em>
                    </span>
                    <span className="sp-phone-tab">
                      <GlyphIcon path={ICON.flag} />
                      <em>Challenges</em>
                    </span>
                    <span className="sp-phone-tab sp-phone-tab-center">
                      <span className="sp-phone-play">
                        <GlyphIcon path={ICON.play} filled />
                      </span>
                    </span>
                    <span className="sp-phone-tab">
                      <GlyphIcon path={ICON.people} />
                      <em>Social</em>
                    </span>
                    <span className="sp-phone-tab">
                      <GlyphIcon path={ICON.bell} />
                      <em>Alerts</em>
                    </span>
                  </div>
                </div>
                <p className="sp-preview-note">
                  This is how {schoolLabel} looks in the Juise Rider App.
                </p>
              </div>
            </aside>
          </div>

          <div className="sp-save-bar">
            <span className="muted-text">
              {busyLabel || "Save your changes to update the school profile."}
            </span>
            <div className="form-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => void refreshActiveSchool()}
                disabled={busy}
              >
                Reload
              </button>
              <button className="primary-button" type="submit" disabled={busy}>
                {schoolBusy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
