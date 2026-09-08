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

  const schoolLabel =
    schoolDraft.title.trim() ||
    schoolDraft.name.trim() ||
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
        <div>
          <p className="eyebrow">School profile</p>
          <h2>{schoolLabel}</h2>
          <p className="muted-text sp-header-copy">
            How your school looks to students in the Juise app — branding,
            colors, and terms.
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
                    <p className="helper-text">
                      PNG or JPG. You&apos;ll crop it to a square.
                    </p>
                  </div>
                </div>

                <div className="form-grid">
                  <label className="field">
                    <span>School name</span>
                    <input
                      value={schoolDraft.name}
                      onChange={(event) =>
                        setSchoolDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Oakland University"
                    />
                  </label>
                  <label className="field">
                    <span>Display title</span>
                    <input
                      value={schoolDraft.title}
                      onChange={(event) =>
                        setSchoolDraft((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      placeholder="Oakland University"
                    />
                  </label>
                  <label className="field">
                    <span>Default campus ID</span>
                    <input
                      value={schoolDraft.default_campus_id}
                      onChange={(event) =>
                        setSchoolDraft((current) => ({
                          ...current,
                          default_campus_id: event.target.value,
                        }))
                      }
                      placeholder="Optional"
                    />
                  </label>
                </div>

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
                    <div className="sp-color-row" key={field.key}>
                      <span
                        className="sp-color-swatch"
                        style={{ background: swatchColors[field.key] }}
                        aria-hidden="true"
                      />
                      <div className="sp-color-meta">
                        <strong>{field.label}</strong>
                        <code>{field.key}</code>
                      </div>
                      <input
                        type="text"
                        value={schoolDraft.color_scheme[field.key] ?? ""}
                        onChange={(event) =>
                          handleSchoolColorChange(field.key, event.target.value)
                        }
                        placeholder={field.fallback}
                      />
                      <input
                        type="color"
                        className="sp-color-picker"
                        value={getColorPickerValue(
                          schoolDraft.color_scheme[field.key],
                          field.key as keyof Required<SchoolColorScheme>,
                        )}
                        onChange={(event) =>
                          handleSchoolColorChange(field.key, event.target.value)
                        }
                        aria-label={`${field.label} color`}
                      />
                    </div>
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
                                updateTerm(term.id, { name: event.target.value })
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
                    <span className="sp-phone-title">
                      {schoolDraft.title.trim() || schoolLabel}
                    </span>
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
                    <span className="sp-phone-cta">
                      <GlyphIcon path={ICON.play} filled />
                      Start a ride
                    </span>
                    <div className="sp-phone-strip" aria-hidden="true">
                      <span />
                      <span />
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
                  Themed the way {schoolLabel} looks in the Juise app.
                </p>
              </div>
            </aside>
          </div>

          <div className="sp-save-bar">
            <span className="muted-text">
              {busyLabel || "Saves branding, colors, and terms together."}
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
