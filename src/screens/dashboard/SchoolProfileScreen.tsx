import type {
  ChangeEvent,
  ComponentType,
  CSSProperties,
  Dispatch,
  FormEvent,
  SetStateAction,
} from "react";

import type { SchoolColorScheme } from "../../lib/api";

type SchoolColorField = {
  key: keyof SchoolColorScheme;
  label: string;
  fallback: string;
};

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
  defaultSchoolColorScheme: Required<SchoolColorScheme>;
  resolvedSchoolColors: SchoolColorScheme;
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
    defaultSchoolColorScheme,
    resolvedSchoolColors,
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
  const previewColors: Required<SchoolColorScheme> = {
    primary: resolvedSchoolColors.primary || defaultSchoolColorScheme.primary,
    secondary:
      resolvedSchoolColors.secondary || defaultSchoolColorScheme.secondary,
    accent: resolvedSchoolColors.accent || defaultSchoolColorScheme.accent,
    background:
      resolvedSchoolColors.background || defaultSchoolColorScheme.background,
    text: resolvedSchoolColors.text || defaultSchoolColorScheme.text,
  };
  const previewStyle: SchoolPreviewStyle = {
    "--school-preview-primary": previewColors.primary,
    "--school-preview-secondary": previewColors.secondary,
    "--school-preview-accent": previewColors.accent,
    "--school-preview-background": previewColors.background,
    "--school-preview-text": previewColors.text,
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
                        style={{ background: previewColors[field.key] }}
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
                <div className="sp-preview-card">
                  <SchoolLogoPreview
                    key={`preview-${previewLogoUrl || "fallback"}`}
                    logoUrl={previewLogoUrl}
                    label={schoolLabel}
                    size="tiny"
                  />
                  <div className="sp-preview-text">
                    <span className="sp-preview-title">
                      {schoolDraft.title.trim() || schoolLabel}
                    </span>
                    <strong className="sp-preview-name">
                      {schoolDraft.name.trim() || "School name"}
                    </strong>
                  </div>
                </div>
                <span className="sp-preview-cta">Get started</span>
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
