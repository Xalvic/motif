import { useEffect, useRef, useState } from 'react';
import { startPlayback, stopPlayback } from '../audio/pump';
import { chordView, keyName, melodyText } from '@motif/core/idea';
import {
  settingsOf,
  summarise,
  summaryText,
  type PassItem,
  type Verdict,
} from '../state/listening';
import {
  CONFIG,
  FILE_PATH,
  PLAN,
  QUESTION,
  useListening,
  type SaveStatus,
} from '../state/listeningStore';
import { GENRES, useStore } from '../state/store';
import { MelodyNotes } from './MelodyNotes';

const STATUS: Record<SaveStatus, string> = {
  loading: 'Loading ratings…',
  idle: `Ratings save to ${FILE_PATH}`,
  saving: 'Saving…',
  file: `Saved to ${FILE_PATH}`,
  browser: 'Saved in this browser only: run npm run dev to save the file',
};

/** Seconds between the old idea's stop and the new idea's bar 1 (piano release ≈ 0.5 s). */
const RESTART_GAP = 0.6;

const labelOf = (item: PassItem) => GENRES.find((g) => g.id === item.genre)!.label;

async function copySummary(): Promise<void> {
  const { showToast } = useStore.getState();
  try {
    await navigator.clipboard.writeText(summaryText(CONFIG, PLAN, useListening.getState().ratings));
    showToast('Copied the summary');
  } catch {
    showToast('Copy is blocked in this browser.');
  }
}

/** Rating controls for one idea. Keyed by the item, so the note draft resets per idea. */
function Rater({ item, index }: { item: PassItem; index: number }) {
  const { ratings, status, go, rate, setNote } = useListening();
  const current = ratings[item.id];
  const [note, setDraft] = useState(current?.note ?? '');
  const ready = status !== 'loading';

  function rateShown(verdict: Verdict): void {
    const { idea } = useStore.getState();
    const chords = idea.tokens.map((_, i) => chordView(idea, i).symbol).join(' – ');
    const rating = { verdict, note: note.trim(), key: keyName(idea), chords };
    rate(item.id, CONFIG.kind === 'melody' ? { ...rating, melody: melodyText(idea) } : rating);
    go(index + 1);
  }

  function onKey(e: KeyboardEvent): void {
    if ((e.target as HTMLElement).closest('input, select, textarea')) return;
    if (e.metaKey || e.ctrlKey || e.altKey || !ready) return;
    if (e.key === '1') rateShown(QUESTION.yes);
    else if (e.key === '2') rateShown('not');
    else if (e.key === 'ArrowLeft') go(index - 1);
    else if (e.key === 'ArrowRight') go(index + 1);
    else return;
    e.preventDefault();
  }

  // The window listener always calls the newest handler (it reads the note draft).
  const keyHandler = useRef(onKey);
  useEffect(() => {
    keyHandler.current = onKey;
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  return (
    <div className="lp-rate">
      <div className="lp-pos">
        <button className="btn" onClick={() => go(index - 1)} disabled={index === 0}>
          ← Back
        </button>
        <span>
          <b>{labelOf(item)}</b> · idea {item.n} of {CONFIG.perGenre}
        </span>
        <button className="btn" onClick={() => go(index + 1)} disabled={index === PLAN.length - 1}>
          Next →
        </button>
      </div>
      <div className="lp-verdict" role="group" aria-label={QUESTION.ask}>
        <button
          className="btn toggle"
          aria-pressed={current?.verdict === QUESTION.yes}
          disabled={!ready}
          onClick={() => rateShown(QUESTION.yes)}
        >
          {QUESTION.yesLabel} <kbd>1</kbd>
        </button>
        <button
          className="btn toggle lp-not"
          aria-pressed={current?.verdict === 'not'}
          disabled={!ready}
          onClick={() => rateShown('not')}
        >
          {QUESTION.noLabel} <kbd>2</kbd>
        </button>
      </div>
      <input
        className="lp-note"
        aria-label="Note"
        placeholder="Note (optional): what works, what does not"
        value={note}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => setNote(item.id, note.trim())}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </div>
  );
}

export function ListeningPass() {
  const { index, ratings, status, load, go } = useListening();
  const item = PLAN[index]!;
  const loaded = status !== 'loading';
  const summary = summarise(CONFIG, PLAN, ratings);
  const rated = summary.reduce((sum, s) => sum + s.rated, 0);

  useEffect(() => {
    void load();
    // A melody pass is heard with the melody on (the Melody toggle can still turn it off).
    if (CONFIG.kind === 'melody') useStore.getState().setSettings({ melody: true });
  }, [load]);

  // Each idea starts from bar 1: a playing loop restarts on the new idea, after the old
  // notes have faded (RESTART_GAP), so the first chord is heard alone.
  useEffect(() => {
    if (!loaded) return;
    const wasPlaying = useStore.getState().playing;
    if (wasPlaying) stopPlayback();
    useStore.getState().showIdea(settingsOf(item), item.seed);
    if (wasPlaying) void startPlayback(RESTART_GAP);
  }, [item, loaded]);

  function openGenre(genre: PassItem['genre']): void {
    const items = PLAN.map((p, i) => [p, i] as const).filter(([p]) => p.genre === genre);
    const next = items.find(([p]) => !ratings[p.id]) ?? items[0]!;
    go(next[1]);
  }

  return (
    <section className="controls listening" aria-label={`Listening pass ${CONFIG.label}`}>
      <div className="lp-head">
        <div>
          <span className="label">Listening pass · {CONFIG.label}</span>
          <p className="lp-sub">{QUESTION.ask} Labels are hidden.</p>
        </div>
        <div className="lp-status">
          {rated} of {PLAN.length} rated · {STATUS[status]}
        </div>
      </div>

      <div className="genres" role="group" aria-label="Genre">
        {summary.map((s) => {
          const label = GENRES.find((g) => g.id === s.genre)!.label;
          return (
            <button
              key={s.genre}
              className={s.done ? 'chip done' : 'chip'}
              aria-pressed={s.genre === item.genre}
              onClick={() => openGenre(s.genre)}
            >
              {label} · {s.done ? `${s.yes} ${QUESTION.yesText}` : `${s.rated}/${CONFIG.perGenre}`}
            </button>
          );
        })}
      </div>

      <Rater key={item.id} item={item} index={index} />

      <div className="transport">
        <button className="btn" onClick={() => void copySummary()}>
          Copy summary
        </button>
      </div>
    </section>
  );
}

/** Melody pass: the melody as keys and note names, without the raga or a New melody button. */
export function ListeningMelody() {
  const { idea, playhead } = useStore();
  return (
    <section className="lower lp-melody">
      <div className="panel">
        <span className="label">Melody</span>
        <MelodyNotes idea={idea} playhead={playhead} />
      </div>
    </section>
  );
}
