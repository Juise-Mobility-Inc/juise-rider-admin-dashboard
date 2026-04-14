import type { Dispatch, SetStateAction } from "react";

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
  termDrafts: TermDraft[];
  setTermDrafts: Dispatch<SetStateAction<TermDraft[]>>;
  createEmptyTermDraft: () => TermDraft;
  handleSaveTerms: () => Promise<void>;
};

export function TermsScreen(props: Props) {
  const {
    activeSchoolId,
    schoolBusy,
    termDrafts,
    setTermDrafts,
    createEmptyTermDraft,
    handleSaveTerms,
  } = props;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Academic Calendar</p>
          <h2>Reservable terms</h2>
        </div>
        <div className="form-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() =>
              setTermDrafts((current) => [...current, createEmptyTermDraft()])
            }
            disabled={!activeSchoolId}
          >
            Add Term
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => void handleSaveTerms()}
            disabled={schoolBusy || !activeSchoolId}
          >
            Save Terms
          </button>
        </div>
      </div>

      {!activeSchoolId ? (
        <p className="empty-state">
          This admin login is not scoped to a school.
        </p>
      ) : null}

      {activeSchoolId ? (
        <div className="term-list">
          {termDrafts.length === 0 ? (
            <p className="empty-state">
              No terms configured yet for this school.
            </p>
          ) : null}
          {termDrafts.map((term, index) => (
            <div className="term-row" key={term.id}>
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
              <button
                className="danger-button"
                type="button"
                onClick={() =>
                  setTermDrafts((current) =>
                    current.filter((item) => item.id !== term.id),
                  )
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
