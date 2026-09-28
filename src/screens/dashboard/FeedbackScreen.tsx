import { type ChangeEvent, type FormEvent, useRef, useState } from "react";

import {
  submitFeedback,
  uploadUserEntityMedia,
  type FeedbackCategory,
} from "../../lib/api";

type Props = {
  authAppId: string;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function generateFeedbackUUID(): string {
  return `fb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function FeedbackScreen({ authAppId }: Props) {
  const [category, setCategory] = useState<FeedbackCategory>("feedback");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setError("Add a short description before submitting.");
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      let attachmentObjectKey: string | undefined;
      let attachmentContentType: string | undefined;

      if (file) {
        const uploaded = await uploadUserEntityMedia(
          authAppId,
          {
            entityType: "feedback",
            entityUUID: generateFeedbackUUID(),
            slot: file.type.startsWith("video/") ? "recording" : "screenshot",
            file,
          },
          authAppId,
        );
        attachmentObjectKey = uploaded.media.object_key;
        attachmentContentType = uploaded.media.content_type;
      }

      await submitFeedback({
        category,
        message: trimmedMessage,
        attachment_object_key: attachmentObjectKey,
        attachment_content_type: attachmentContentType,
      });

      setMessage("");
      setFile(null);
      // Clearing React state alone leaves the uncontrolled <input> holding
      // its previous value, so re-picking the exact same file for a second
      // report wouldn't fire onChange at all (the value wouldn't change).
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setCategory("feedback");
      setSuccess("Thanks! Your feedback was submitted.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="management-page">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Feedback</p>
            <h2>Send Feedback</h2>
          </div>
        </div>
      </section>

      <form className="management-map-card" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label className="field">
            <span>Category</span>
            <select
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as FeedbackCategory)
              }
            >
              <option value="feedback">Feedback</option>
              <option value="suggestion">Suggestion</option>
              <option value="bug_report">Bug report</option>
            </select>
          </label>

          <label className="field field-span-2">
            <span>Details</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Tell us what's working, what's not, or what you'd like to see."
              required
            />
          </label>

          <label
            className={`secondary-button upload-button${busy ? " upload-button-busy" : ""}`}
            aria-disabled={busy}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleFileChange}
              disabled={busy}
            />
            {file ? file.name : "Attach a screenshot or recording (optional)"}
          </label>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
        {success ? <p className="success-text">{success}</p> : null}

        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Submitting..." : "Submit feedback"}
          </button>
        </div>
      </form>
    </section>
  );
}
