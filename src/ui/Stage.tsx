import { useEffect } from 'react';
import { auditionChord } from '../audio/audition';
import { exportMidi, midiFileName } from '../audio/export-midi';
import { startPlayback, stopPlayback } from '../audio/pump';
import { chordView, ideaText, keyName } from '../state/idea';
import { GENRES, useStore } from '../state/store';
import type { HarmonicFunction } from '../theory/functions';
import { pitchClass } from '../theory/pitch';
import { Keyboard } from './Keyboard';

function togglePlay(): void {
  if (useStore.getState().playing) stopPlayback();
  else void startPlayback();
}

const svg = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 };
const LockIcon = ({ locked }: { locked: boolean }) => (
  <svg {...svg}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d={locked ? 'M8 11V7a4 4 0 0 1 8 0v4' : 'M8 11V7a4 4 0 0 1 7.5-2'} />
  </svg>
);
const SwapIcon = () => (
  <svg {...svg}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7" />
    <path d="M20 4v7h-7" />
  </svg>
);
const DownloadIcon = () => (
  <svg {...svg}>
    <path d="M12 4v11" />
    <path d="M7 10l5 5 5-5" />
    <path d="M5 20h14" />
  </svg>
);
const CopyIcon = () => (
  <svg {...svg}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);

/** Card badge text and tooltip per harmonic function (THEORY §2.2). */
const FUNCTION_LABEL: Record<HarmonicFunction, [string, string]> = {
  T: ['T', 'Tonic: home'],
  PD: ['PD', 'Pre-dominant: moves away'],
  D: ['D', 'Dominant: pulls home'],
  other: ['·', 'Outside the function table'],
};

async function copySeed(): Promise<void> {
  const { idea, showToast } = useStore.getState();
  try {
    await navigator.clipboard.writeText(String(idea.seed));
    showToast(`Copied seed ${idea.seed}`);
  } catch {
    showToast('Copy is blocked in this browser.');
  }
}

/** Downloads the idea as a .mid file (AUDIO.md §7.1). */
function downloadMidi(): void {
  const { idea, genre, bpm, colour, block, showToast } = useStore.getState();
  const name = midiFileName(idea, genre, bpm);
  const bytes = exportMidi(idea, { genre, bpm, colour, block });
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/midi' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // The click starts the download; the URL can go once it has.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  showToast(`Downloaded ${name}`);
}

async function copyIdea(): Promise<void> {
  const { idea, genre, bpm, showToast } = useStore.getState();
  try {
    await navigator.clipboard.writeText(ideaText(idea, genre, bpm));
    showToast('Copied: chords, notes and melody');
  } catch {
    showToast('Copy is blocked in this browser.');
  }
}

interface StageProps {
  /** Listening pass: no analysis labels, no edits, no new chords. */
  blind?: boolean;
}

export function Stage({ blind = false }: StageProps) {
  const {
    idea,
    selected,
    genre,
    bpm,
    playing,
    playhead,
    loading,
    loop,
    drums,
    melody,
    block,
    setSettings,
    generate,
    reroll,
    toggleLock,
    select,
  } = useStore();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.closest('input, select, textarea, button, [role=button]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (!blind && (e.key === 'g' || e.key === 'G')) {
        useStore.getState().generate();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [blind]);

  const views = idea.tokens.map((_, i) => chordView(idea, i));
  // While playing the keyboard follows the sounding bar; stopped, it shows the selected card.
  // A playhead from before a length change can point past the new idea for one bar.
  const last = idea.tokens.length - 1;
  const shown = playhead !== null && playhead <= last ? playhead : Math.min(selected, last);
  const view = views[shown]!;
  const voicing = idea.voicings[shown]!;
  const scale = idea.scale.steps.map((step) => pitchClass(idea.tonic + step));
  const label = GENRES.find((g) => g.id === genre)!.label;

  function chooseCard(i: number) {
    select(i);
    void auditionChord(idea.voicings[i]!);
  }

  return (
    <section className="stage" aria-label="Progression">
      <div className="stage-head">
        <div>
          <div className="keyname">{keyName(idea)}</div>
          <div className="meta">
            {loading
              ? `Loading sounds ${loading.loaded}/${loading.total}…`
              : `${bpm} BPM · ${idea.tokens.length} bars · ${label}`}
            {!blind && idea.idiom && <span className="idiom"> · {idea.idiom}</span>}
          </div>
        </div>
        <div className="transport">
          {!blind && (
            <button className="btn primary" onClick={generate}>
              New chords
            </button>
          )}
          <button className="btn play" onClick={togglePlay}>
            {playing ? 'Stop' : 'Play'}
          </button>
          <button
            className="btn toggle"
            aria-pressed={loop}
            onClick={() => setSettings({ loop: !loop })}
          >
            Loop
          </button>
          <button
            className="btn toggle"
            aria-pressed={drums}
            onClick={() => setSettings({ drums: !drums })}
          >
            Drums
          </button>
          <button
            className="btn toggle"
            aria-pressed={melody}
            onClick={() => setSettings({ melody: !melody })}
          >
            Melody
          </button>
          <button
            className="btn toggle"
            aria-pressed={block}
            title="Held chords instead of the genre's pattern"
            onClick={() => setSettings({ block: !block })}
          >
            Block chords
          </button>
        </div>
      </div>

      <div className="cards">
        {views.map((v, i) => {
          const locked = idea.locks[i]!;
          const classes = [
            'card',
            i === selected && 'sel',
            i === playhead && 'now',
            locked && 'locked',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div
              key={i}
              className={classes}
              tabIndex={0}
              role="button"
              aria-label={`Bar ${i + 1}: ${v.symbol}`}
              onClick={() => chooseCard(i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.target === e.currentTarget) chooseCard(i);
              }}
            >
              <div className="card-top">
                <span className="bar">BAR {i + 1}</span>
                {!blind && (
                  <span className="ic">
                    <button
                      aria-pressed={locked}
                      aria-label="Lock chord"
                      title={locked ? 'Unlock' : 'Keep this chord'}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLock(i);
                      }}
                    >
                      <LockIcon locked={locked} />
                    </button>
                    <button
                      aria-label="Swap chord"
                      title="Swap this chord"
                      onClick={(e) => {
                        e.stopPropagation();
                        reroll(i);
                        const next = useStore.getState().idea.voicings[i]!;
                        void auditionChord(next);
                      }}
                    >
                      <SwapIcon />
                    </button>
                  </span>
                )}
              </div>
              <div className="cname">{v.symbol}</div>
              {!blind && <div className="roman">{v.roman}</div>}
              {!blind && (
                <div className="tags">
                  <span
                    className={`fn fn-${idea.functions[i]}`}
                    title={FUNCTION_LABEL[idea.functions[i]!][1]}
                  >
                    {FUNCTION_LABEL[idea.functions[i]!][0]}
                  </span>
                  {idea.borrowed[i] && (
                    <span className="borrowed" title="Borrowed: has a note outside the key">
                      borrowed
                    </span>
                  )}
                </div>
              )}
              <div className="notes">{v.notes.join(' ')}</div>
            </div>
          );
        })}
      </div>

      <div className="kbd-block">
        <Keyboard voicing={voicing} name={view.name} scale={scale} />
        <div className="kbd-cap">
          <div>
            <b>{view.symbol}</b> · left hand <b>{view.name(voicing.bass)}</b> · right hand{' '}
            <b>{voicing.upper.map(view.name).join(' ')}</b>
          </div>
          <div className="legend">
            <span>
              <i className="sw" style={{ background: 'var(--bass)' }} />
              Left hand
            </span>
            <span>
              <i className="sw" style={{ background: 'var(--accent)' }} />
              Right hand
            </span>
            <span>
              <i
                className="sw"
                style={{
                  background: 'var(--accent)',
                  opacity: 0.55,
                  borderRadius: '50%',
                  width: 8,
                  height: 8,
                }}
              />
              Melody-safe notes
            </span>
          </div>
        </div>
      </div>

      {!blind && (
        <div className="transport">
          <button
            className="btn"
            onClick={downloadMidi}
            title={block ? 'Block chords, as you hear them' : "The genre's pattern, as you hear it"}
          >
            <DownloadIcon />
            Export MIDI
          </button>
          <button className="btn" onClick={() => void copyIdea()}>
            <CopyIcon />
            Copy for FL Studio
          </button>
          <button className="btn" disabled title="Saved ideas arrive with M5">
            Save idea
          </button>
          <button
            className="btn seed"
            onClick={() => void copySeed()}
            title="Copy this idea's seed"
          >
            <CopyIcon />
            Seed {idea.seed}
          </button>
        </div>
      )}
    </section>
  );
}
