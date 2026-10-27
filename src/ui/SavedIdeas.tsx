import { useEffect, useRef } from 'react';
import { savedSummary } from '../state/saved';
import { useSaved } from '../state/savedStore';
import { GENRES, useStore } from '../state/store';
import { downloadFile } from './download';

function exportAll(): void {
  const { exportText } = useSaved.getState();
  const date = new Date().toISOString().slice(0, 10);
  downloadFile(`chordspark_saved_${date}.json`, exportText(), 'application/json');
}

export function SavedIdeas() {
  const { ideas, loaded, load, open, remove, importText } = useSaved();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void load();
  }, [load]);

  async function importFile(file: File | undefined): Promise<void> {
    if (!file) return;
    useStore.getState().showToast(await importText(await file.text()));
  }

  return (
    <section className="saved" aria-label="Saved ideas">
      <div className="panel-head">
        <h2 style={{ fontSize: 20 }}>Saved ideas</h2>
        <div className="transport">
          <button className="btn" onClick={() => fileInput.current?.click()}>
            Import
          </button>
          <button className="btn" onClick={exportAll} disabled={ideas.length === 0}>
            Export all
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              void importFile(e.target.files?.[0]);
              // The same file can be picked again.
              e.target.value = '';
            }}
          />
        </div>
      </div>
      {loaded && ideas.length === 0 ? (
        <div className="empty">
          Nothing saved yet. When a progression makes you want to play, press <b>Save idea</b> and
          it will wait here in this browser.
        </div>
      ) : (
        <div className="saved-list">
          {ideas.map((saved) => {
            const { chords, key } = savedSummary(saved);
            const genre = GENRES.find((g) => g.id === saved.settings.genre)!.label;
            return (
              <div key={saved.id} className="srow">
                <div className="sp">
                  {chords}
                  <div className="sm">
                    {genre} · {key} · {saved.settings.bpm} BPM
                  </div>
                </div>
                <button
                  className="btn"
                  onClick={() => {
                    open(saved.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  Open
                </button>
                <button
                  className="btn"
                  aria-label={`Delete ${chords}`}
                  title="Delete"
                  onClick={() => void remove(saved.id)}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
