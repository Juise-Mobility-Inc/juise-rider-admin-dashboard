import type {
  ComponentType,
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
  size?: "header" | "field";
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

type Props = {
  activeSchoolId: string;
  schoolBusy: boolean;
  schoolDraft: SchoolDraft;
  setSchoolDraft: Dispatch<SetStateAction<SchoolDraft>>;
  schoolColorFields: SchoolColorField[];
  handleSaveSchool: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  refreshActiveSchool: () => Promise<void>;
  handleSchoolColorChange: (
    key: keyof SchoolColorScheme,
    value: string,
  ) => void;
  getColorPickerValue: (
    value: string | undefined,
    fallback: keyof Required<SchoolColorScheme>,
  ) => string;
  defaultSchoolColorScheme: Required<SchoolColorScheme>;
  resolvedSchoolColors: SchoolColorScheme;
  SchoolLogoPreview: ComponentType<SchoolLogoPreviewProps>;
};

export function SchoolProfileScreen(props: Props) {
  const {
    activeSchoolId,
    schoolBusy,
    schoolDraft,
    setSchoolDraft,
    schoolColorFields,
    handleSaveSchool,
    refreshActiveSchool,
    handleSchoolColorChange,
    getColorPickerValue,
    defaultSchoolColorScheme,
    resolvedSchoolColors,
    SchoolLogoPreview,
  } = props;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">School Identity</p>
          <h2>Edit school profile</h2>
        </div>
        {schoolBusy ? <span className="muted-text">Saving…</span> : null}
      </div>

      {!activeSchoolId ? (
        <p className="empty-state">
          This admin login is not scoped to a school.
        </p>
      ) : null}

      <form className="school-form" onSubmit={handleSaveSchool}>
        <div className="form-grid">
          <label className="field">
            <span>School ID</span>
            <input
              value={schoolDraft.school_id || activeSchoolId}
              onChange={(event) =>
                setSchoolDraft((current) => ({
                  ...current,
                  school_id: event.target.value,
                }))
              }
              disabled
              placeholder="ou"
            />
          </label>
          <label className="field">
            <span>Name</span>
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
            <span>Title</span>
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
            <span>Default Campus ID</span>
            <input
              value={schoolDraft.default_campus_id}
              onChange={(event) =>
                setSchoolDraft((current) => ({
                  ...current,
                  default_campus_id: event.target.value,
                }))
              }
              placeholder="main"
            />
          </label>
          <div className="logo-field-row field-span-2">
            <label className="field">
              <span>Logo URL</span>
              <input
                value={schoolDraft.logo_url}
                onChange={(event) =>
                  setSchoolDraft((current) => ({
                    ...current,
                    logo_url: event.target.value,
                  }))
                }
                placeholder="https://…"
              />
            </label>
            <div className="logo-field-preview">
              <span>Logo Preview</span>
              <SchoolLogoPreview
                key={`field-${schoolDraft.logo_url || "fallback"}`}
                logoUrl={schoolDraft.logo_url}
                label={
                  schoolDraft.title || schoolDraft.name || activeSchoolId || "Juise"
                }
                size="field"
              />
            </div>
          </div>
          <label className="field checkbox-field">
            <span>Active</span>
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
          </label>
          <div className="field field-span-2">
            <span>Color Scheme</span>
            <div className="color-scheme-grid">
              {schoolColorFields.map((field) => (
                <div className="color-input-row" key={field.key}>
                  <div className="color-input-copy">
                    <strong>{field.label}</strong>
                    <span>{field.key}</span>
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
                    className="color-picker-input"
                    value={getColorPickerValue(
                      schoolDraft.color_scheme[field.key],
                      field.key as keyof typeof defaultSchoolColorScheme,
                    )}
                    onChange={(event) =>
                      handleSchoolColorChange(field.key, event.target.value)
                    }
                    aria-label={`${field.label} color`}
                  />
                </div>
              ))}
            </div>
            <div
              className="color-preview-card"
              style={{
                background: resolvedSchoolColors.background,
                color: resolvedSchoolColors.text,
                borderColor: resolvedSchoolColors.secondary,
              }}
            >
              <div className="color-preview-swatches" aria-hidden="true">
                <span style={{ background: resolvedSchoolColors.primary }} />
                <span style={{ background: resolvedSchoolColors.secondary }} />
                <span style={{ background: resolvedSchoolColors.accent }} />
                <span style={{ background: resolvedSchoolColors.background }} />
                <span style={{ background: resolvedSchoolColors.text }} />
              </div>
              <strong>
                {schoolDraft.title.trim() ||
                  schoolDraft.name.trim() ||
                  "Brand preview"}
              </strong>
              <p>
                Preview the school palette before saving. The admin dashboard
                sends this as the structured <code>SchoolColorScheme</code>{" "}
                object.
              </p>
              <button
                className="color-preview-button"
                type="button"
                style={{
                  background: resolvedSchoolColors.primary,
                  color: resolvedSchoolColors.background,
                }}
              >
                Sample Primary Action
              </button>
            </div>
          </div>
          <label className="field field-span-2">
            <span>Metadata JSON</span>
            <textarea
              value={schoolDraft.metadata}
              onChange={(event) =>
                setSchoolDraft((current) => ({
                  ...current,
                  metadata: event.target.value,
                }))
              }
              rows={8}
            />
          </label>
        </div>

        <div className="form-actions">
          <button
            className="primary-button"
            type="submit"
            disabled={schoolBusy || !activeSchoolId}
          >
            Save School
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void refreshActiveSchool()}
            disabled={schoolBusy || !activeSchoolId}
          >
            Reload
          </button>
        </div>
      </form>
    </section>
  );
}
