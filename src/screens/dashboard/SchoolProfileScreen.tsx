import type {
	ChangeEvent,
	ComponentType,
	Dispatch,
	FormEvent,
	SetStateAction,
} from "react";

import type { SchoolColorScheme } from "../../lib/api";
import {
	getReadableTextColor,
	juiseColors,
	mixHexColors,
} from "../../lib/colors";

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
	handleSaveTerms: () => Promise<void>;
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
		handleSaveTerms,
		SchoolLogoPreview,
	} = props;

	const schoolLabel =
		schoolDraft.title.trim() ||
		schoolDraft.name.trim() ||
		activeSchoolId ||
		"School profile";
	const busyLabel = schoolLogoUploadBusy
		? "Uploading logo…"
		: schoolBusy
			? "Saving changes…"
			: "";
	const previewLogoUrl = resolvedSchoolLogoUrl || schoolDraft.logo_url;
	const profileStats = [
		{
			label: "School ID",
			value: activeSchoolId || schoolDraft.school_id.trim() || "Unscoped",
		},
		{
			label: "Default Campus",
			value: schoolDraft.default_campus_id.trim() || "Not set",
		},
		{
			label: "Terms",
			value: `${termDrafts.length}`,
		},
		{
			label: "Status",
			value: schoolDraft.active ? "Active" : "Inactive",
		},
	];

	return (
		<section className="school-profile-screen">
			<section className="panel school-profile-hero">
				<div className="school-profile-hero-main">
					<div>
						<p className="eyebrow">School Profile</p>
						<h2>{schoolLabel}</h2>
						<p className="school-profile-copy">
							Branding, campus defaults, school terms, and metadata now live in
							one setup surface.
						</p>
					</div>
					<div className="school-profile-hero-actions">
						{busyLabel ? <span className="muted-text">{busyLabel}</span> : null}
						<button
							className="secondary-button"
							type="button"
							onClick={() => void refreshActiveSchool()}
							disabled={schoolBusy || schoolLogoUploadBusy || !activeSchoolId}>
							Reload
						</button>
					</div>
				</div>
				<div className="school-profile-chip-row">
					{profileStats.map((item) => (
						<div className="school-profile-chip" key={item.label}>
							<span>{item.label}</span>
							<strong>{item.value}</strong>
						</div>
					))}
				</div>
			</section>

			{!activeSchoolId ? (
				<section className="panel">
					<p className="empty-state">
						This admin login is not scoped to a school.
					</p>
				</section>
			) : null}

			{activeSchoolId ? (
				<>
					<form className="school-profile-stack" onSubmit={handleSaveSchool}>
						<section className="panel school-profile-card school-profile-card-featured">
							<div className="school-profile-card-header">
								<div>
									<p className="eyebrow">Identity</p>
									<h3>Brand and school settings</h3>
									<p className="school-profile-section-copy">
										Keep the school name, public title, logo, and campus
										defaults aligned in one place.
									</p>
								</div>
							</div>

							<div className="school-profile-brand-layout">
								<div
									className="school-profile-brand-preview"
									style={{
										background: `radial-gradient(circle at top right, ${resolvedSchoolColors.primary} 0%, transparent 34%), linear-gradient(155deg, ${resolvedSchoolColors.secondary}, ${resolvedSchoolColors.background})`,
										color: resolvedSchoolColors.text,
										borderColor: resolvedSchoolColors.secondary,
									}}>
									<SchoolLogoPreview
										key={`field-${previewLogoUrl || "fallback"}`}
										logoUrl={previewLogoUrl}
										label={schoolLabel}
										size="header"
									/>
									<div className="school-profile-brand-copy">
										<strong>{schoolLabel}</strong>
										<p>
											{schoolDraft.name.trim()
												? "This preview reflects the profile card and workspace branding."
												: "Add the school name, title, and logo to finish the identity setup."}
										</p>
									</div>
									<div className="school-profile-badge-row">
										<span className="school-profile-badge school-profile-badge-contrast">
											{schoolDraft.active ? "Active" : "Inactive"}
										</span>
									</div>
								</div>

								<div className="school-profile-brand-fields">
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
										<label className="field checkbox-field school-profile-active-field">
											<span>School Active</span>
											<div className="school-profile-checkbox-row">
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
												<strong>Visible to students and school admins</strong>
											</div>
										</label>
									</div>

									<div className="school-profile-logo-row">
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
										<div className="school-profile-logo-sidecar">
											<div className="school-profile-logo-inline-preview">
												<span className="school-profile-logo-inline-label">
													Preview
												</span>
												<SchoolLogoPreview
													key={`inline-${previewLogoUrl || "fallback"}`}
													logoUrl={previewLogoUrl}
													label={schoolLabel}
													size="tiny"
												/>
											</div>
											<div className="school-profile-logo-actions">
												<label
													className={`secondary-button upload-button${schoolLogoUploadBusy ? " upload-button-busy" : ""}`}
													aria-disabled={
														schoolBusy ||
														schoolLogoUploadBusy ||
														!activeSchoolId
													}>
													<input
														type="file"
														accept="image/*"
														onChange={handleSchoolLogoFileChange}
														disabled={
															schoolBusy ||
															schoolLogoUploadBusy ||
															!activeSchoolId
														}
													/>
													{schoolLogoUploadBusy ? "Uploading…" : "Upload image"}
												</label>
												<p className="helper-text">
													Paste a hosted URL or upload an image here to fill the
													logo field automatically.
												</p>
											</div>
										</div>
									</div>
								</div>
							</div>

							<div className="form-actions school-profile-form-actions">
								<button
									className="primary-button"
									type="submit"
									disabled={
										schoolBusy || schoolLogoUploadBusy || !activeSchoolId
									}>
									{schoolBusy ? "Saving…" : "Save Profile"}
								</button>
								<button
									className="secondary-button"
									type="button"
									onClick={() => void refreshActiveSchool()}
									disabled={
										schoolBusy || schoolLogoUploadBusy || !activeSchoolId
									}>
									Reload School
								</button>
							</div>
						</section>

						<section className="panel school-profile-card">
							<div className="school-profile-card-header">
								<div>
									<p className="eyebrow">Color Scheme</p>
									<h3>Brand palette</h3>
									<p className="school-profile-section-copy">
										These colors now flow through the dashboard shell, cards,
										and primary actions.
									</p>
								</div>
							</div>

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
								}}>
								<div className="color-preview-swatches" aria-hidden="true">
									<span style={{ background: resolvedSchoolColors.primary }} />
									<span
										style={{ background: resolvedSchoolColors.secondary }}
									/>
									<span style={{ background: resolvedSchoolColors.accent }} />
									<span
										style={{ background: resolvedSchoolColors.background }}
									/>
									<span style={{ background: resolvedSchoolColors.text }} />
								</div>
								<strong>Live dashboard preview</strong>
								<p>
									Preview the configured school palette before saving the
									profile.
								</p>
								<button
									className="color-preview-button"
									type="button"
									style={{
										background: resolvedSchoolColors.primary,
										color: resolvedSchoolColors.text,
									}}>
									Primary action
								</button>
							</div>
						</section>
					</form>

					<section className="panel school-profile-card school-profile-terms-panel">
						<div className="panel-header">
							<div>
								<p className="eyebrow">Academic Calendar</p>
								<h3>School terms</h3>
								<p className="school-profile-section-copy">
									Manage reservable terms directly from the profile screen.
								</p>
							</div>
							<div className="form-actions">
								<button
									className="secondary-button"
									type="button"
									onClick={() =>
										setTermDrafts((current) => [
											...current,
											createEmptyTermDraft(),
										])
									}
									disabled={!activeSchoolId || schoolBusy}>
									Add Term
								</button>
								<button
									className="primary-button"
									type="button"
									onClick={() => void handleSaveTerms()}
									disabled={schoolBusy || !activeSchoolId}>
									Save Terms
								</button>
							</div>
						</div>

						{termDrafts.length === 0 ? (
							<p className="empty-state">
								No terms configured yet for this school.
							</p>
						) : (
							<div className="school-profile-term-list">
								{termDrafts.map((term, index) => (
									<div className="school-profile-term-card" key={term.id}>
										<div className="school-profile-term-heading">
											<div>
												<span className="school-profile-term-index">
													Term {index + 1}
												</span>
												<strong>
													{term.name.trim() || `Untitled term ${index + 1}`}
												</strong>
											</div>
											<div className="school-profile-term-heading-meta">
												<span className="school-profile-term-status">
													{term.term_uuid.trim() ? "Saved" : "New"}
												</span>
												<button
													className="danger-button"
													type="button"
													onClick={() =>
														setTermDrafts((current) =>
															current.filter((item) => item.id !== term.id),
														)
													}>
													Remove
												</button>
											</div>
										</div>
										<div className="school-profile-term-fields">
											<label className="field">
												<span>Term Name</span>
												<input
													value={term.name}
													onChange={(event) =>
														setTermDrafts((current) =>
															current.map((item) =>
																item.id === term.id
																	? { ...item, name: event.target.value }
																	: item,
															),
														)
													}
													placeholder={`Term ${index + 1}`}
												/>
											</label>
											<label className="field">
												<span>Start Date</span>
												<input
													type="date"
													value={term.start_date}
													onChange={(event) =>
														setTermDrafts((current) =>
															current.map((item) =>
																item.id === term.id
																	? { ...item, start_date: event.target.value }
																	: item,
															),
														)
													}
												/>
											</label>
											<label className="field">
												<span>End Date</span>
												<input
													type="date"
													value={term.end_date}
													onChange={(event) =>
														setTermDrafts((current) =>
															current.map((item) =>
																item.id === term.id
																	? { ...item, end_date: event.target.value }
																	: item,
															),
														)
													}
												/>
											</label>
										</div>
									</div>
								))}
							</div>
						)}
					</section>
				</>
			) : null}
		</section>
	);
}
