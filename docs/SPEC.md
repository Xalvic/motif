# Chord Spark: Product and Engineering Spec

Version 1.0 · October 2026

Companion docs: `THEORY.md` (generator rules), `AUDIO.md` (sound engine). Read the milestone you are working on; you do not need the whole file.

---

## 1. Why this exists

The owner plays keyboard by ear, loves many genres (piano, orchestral, epic, hip hop, classical, Malayalam film songs, Irish folk, metal) and has dabbled in FL Studio, but has never finished or released a piece. The blank page is the problem, not skill.

Chord Spark removes the blank page: one click produces a musically sensible progression in a chosen style, plays it with realistic instruments, shows exactly which keys to press, and hands over a melody idea to react to. The output goes into FL Studio as MIDI.

### Design principles

1. **Ears and hands first.** Show keys and note names everywhere. Notation is optional and later.
2. **Theory-aware, not random.** Progressions follow harmonic function and genre idioms. Melodies follow chord-tone and phrase rules. The app should explain itself in small doses ("This is the Andalusian cadence"), so using it teaches theory.
3. **Fast to sound.** Under 1 second from click to sound once samples are cached. Something must play even while samples load.
4. **Real instruments.** Sampled piano, strings, electric piano, guitars and drums. Synthesis only as a fallback or a deliberate texture.
5. **Everything leaves as MIDI.** If an idea is good, it must reach FL Studio in two clicks.
6. **Reproducible.** Every idea has a seed; the same seed and settings regenerate the same idea.

### Non-goals for v1

- UI redesign (later; keep the prototype layout and make components easy to restyle).
- Accounts, cloud sync, sharing between users.
- A full DAW: no multi-section arrangement editing, no mixing desk.
- AI/ML models in the browser (see AUDIO.md §2 on Magenta).

---

## 2. Feature scope for v1

v1 = everything the prototype does, rebuilt on a real audio stack and a real theory engine, plus MIDI export and seeds.

| # | Feature | Prototype today | v1 target |
|---|---|---|---|
| F1 | Genre picker | 8 genres, hard-coded templates | 8 genres as JSON profiles (THEORY §6) |
| F2 | Key picker | Random or fixed tonic | Same, plus mode override (major / minor / modal) |
| F3 | Length | 4 or 8 bars | 4 or 8 bars; 8 bars uses phrase structure (antecedent/consequent) |
| F4 | Colour | Plain / Some / Spicy | Same labels; drives extensions and borrowed-chord rate |
| F5 | Tempo | Slider, genre default | Same; genre range; tap tempo |
| F6 | Generate | Template + random mutation | Idiom or Markov, scored by rules (THEORY §3) |
| F7 | Lock / swap chord | Locks kept; swap picks from pool | Constrained regeneration that respects neighbours (THEORY §3.6) |
| F8 | Chord cards | Name, roman, notes | Plus function badge (T / PD / D), borrowed marker, idiom name on the row |
| F9 | Keyboard view | C2–B5, LH blue / RH gold, scale dots | Same, driven by the voicing engine; click a key to hear it |
| F10 | Playback | Web Audio synths, loop, drums, melody toggle | Tone.js transport + smplr instruments, per-genre comping and drums, swing |
| F11 | Melody starter | Random walk over chord tones | Motif-based generator with phrase form (THEORY §5), piano-roll view |
| F12 | Scale panel | Best-fit scale + raga cousin | Same, plus raga mode for melody (arohana/avarohana) |
| F13 | Challenge prompt | Random list | Same, genre-aware |
| F14 | Song map | Static per genre | Same |
| F15 | Copy for FL Studio | Text with notes | Same |
| F16 | Saved ideas | localStorage | IndexedDB (idb-keyval) with seed + full idea; export/import JSON |
| F17 | **MIDI export (new)** | none | Multi-track .mid: chords, bass, melody, drums |
| F18 | **Seed (new)** | none | Seed shown and editable; idea reproducible from seed + settings |
| F19 | **WAV export (new, stretch)** | none | Offline render of the loop |

Acceptance criteria for each feature are in the milestone that delivers it (§6).

---

## 3. Architecture

```
            ┌──────────────── UI (React) ────────────────┐
            │ GenrePicker  Controls  ChordCards  Keyboard │
            │ PianoRoll  ScalePanel  Prompt  Saved        │
            └──────────────┬──────────────────────────────┘
                           │ actions / selectors
                    ┌──────▼──────┐
                    │ state (Zustand) │  settings, idea, locks, playback flags
                    └──┬────────┬─┘
        generate()     │        │  play/stop, schedule(idea)
             ┌─────────▼─┐    ┌─▼──────────────┐
             │  theory/  │    │    audio/       │
             │ pure TS   │    │ Tone transport  │
             │ progression│   │ smplr samplers  │
             │ voicing    │   │ comping, drums  │
             │ melody     │   │ fx, export      │
             └─────┬─────┘    └───────┬────────┘
                   │ Idea (plain data) │
                   └────────►──────────┘
```

- **theory** produces an `Idea` (plain serialisable data). It knows nothing about audio.
- **audio** turns an `Idea` + genre profile into scheduled events. It never decides harmony.
- **state** owns the current `Idea`, settings, locks and playback state. Changing the idea while playing takes effect on the next bar.

### Folder layout

```
src/
  theory/
    random.ts            seeded RNG (mulberry32 or similar) + helpers: pick, weighted, shuffle
    pitch.ts             midi <-> name, spelling via tonal (sharps/flats by key)
    roman.ts             parse/format roman tokens (own grammar, THEORY §2.1)
    keys.ts              Key {tonic, mode}; scales + ragas table
    chords.ts            Chord -> intervals, pitch classes, symbol (Am7, F/A)
    functions.ts         harmonic function lookup (T/PD/D) per mode
    progression/
      profiles.ts        load + validate genre JSON
      idioms.ts          named progressions
      markov.ts          weighted transitions, 1st and 2nd order
      score.ts           rule-based scoring (THEORY §3.4)
      generate.ts        generateProgression(settings, locks, rng)
      colour.ts          extensions and borrowing by Colour level
    voicing.ts           voice-leading voicer (THEORY §4)
    melody/
      rhythm.ts          rhythm vocabularies per genre
      motif.ts           motif creation + development operators
      generate.ts        generateMelody(idea, profile, rng)
      raga.ts            arohana/avarohana-aware pitch choice
    analysis.ts          best-fit scale, raga cousin, idiom detection
    data/
      genres/*.json      one profile per genre
      idioms.json
      ragas.json
      prompts.json
  audio/
    engine.ts            init context, master bus, Tone.start, transport control
    instruments.ts       registry, lazy load per genre, load progress
    comping.ts           comping patterns -> note events
    drums.ts             16-step patterns -> drum events
    fx.ts                per-genre effect chains
    schedule.ts          Idea -> Tone.Part(s), next-bar swap
    export-midi.ts       @tonejs/midi writer
    export-wav.ts        offline render (stretch)
  state/store.ts
  ui/...
tests/
  theory/*.test.ts       unit + property tests (THEORY §8)
scripts/
  chordonomicon/         offline data pipeline (THEORY §7), not shipped
```

### Core types (target, adjust as needed)

```ts
type Mode = 'major' | 'minor' | 'dorian' | 'mixolydian' | 'phrygian' | 'lydian' | 'harmonicMinor';
interface Key { tonic: number /*0-11*/; mode: Mode }

interface ChordToken {        // key-relative, the source of truth
  degree: 0|1|2|3|4|5|6;      // I..VII
  accidental: -1|0|1;         // ♭ / natural / ♯ relative to the MAJOR scale degree
  quality: 'maj'|'min'|'dim'|'aug'|'sus2'|'sus4'|'power';
  ext: '' | '6' | '7' | 'maj7' | '9' | 'maj9' | 'add9' | 'm7b5' | 'dim7';
  bassDegreeOffset?: number;  // slash chords / inversions (semitones above root)
}
interface ChordInfo extends ChordToken {
  roman: string; symbol: string; pcs: number[];
  fn: 'T'|'PD'|'D'|'other'; borrowed: boolean; locked: boolean;
}
interface Voicing { bass: number; upper: number[] }          // MIDI numbers
interface NoteEvent { midi: number; start: number; dur: number; vel: number } // beats
interface Idea {
  seed: string; genre: GenreId; key: Key; bpm: number; meter: '4/4'|'6/8'|'3/4';
  bars: 4|8; colour: 0|1|2;
  chords: ChordInfo[]; voicings: Voicing[];
  melody: NoteEvent[]; scale: { id: string; raga?: string };
  idiom?: string;              // e.g. "Andalusian cadence"
  prompt: string;
}
```

---

## 4. Behaviour details that carry over from the prototype

- Keyboard shortcuts: `G` generates, `Space` plays/stops (ignored while focus is on inputs or buttons).
- Clicking a chord card selects it, shows its voicing on the keyboard, and auditions it (only when not playing).
- During playback the current bar's card is highlighted and the keyboard follows the playing chord; the piano roll shows a playhead.
- Changing key with a fixed key selected transposes the idea in place; it does not regenerate.
- Locks survive Generate when length is unchanged; changing genre or length clears locks.
- Tempo touched by the user is kept across Generate until the genre changes.
- "Copy for FL Studio" copies: genre, key, BPM, chord symbols, roman numerals, LH/RH notes per bar, melody notes with durations, scale and raga cousin.
- Clipboard: call `navigator.clipboard.writeText` inside the click handler; fall back to a selected textarea.

---

## 5. Non-functional requirements

| Area | Budget / rule |
|---|---|
| Time to first sound | ≤ 1 s on a warm cache; first ever load may show progress, but a placeholder synth plays until samples arrive |
| Sample download | Load only the current genre's instruments. Piano first. Show `loaded/total`. Cache with smplr `CacheStorage` (HTTPS) |
| Timing | All audio scheduled on the AudioContext clock via Tone transport. UI highlight via `Tone.getDraw()` |
| Generation | `generate()` ≤ 20 ms for 8 bars on a mid laptop (it is pure TS; keep candidate counts modest) |
| Determinism | Same seed + same settings + same app version = identical Idea |
| Bundle | Theory + UI JS < 300 KB gzipped excluding Tone.js; samples are never bundled |
| Accessibility | Every control reachable by keyboard; chord cards announce "Bar 2: F major 7"; visible focus |
| Browsers | Latest Chrome, Edge, Firefox, Safari (desktop + iOS). iOS: unlock audio on first tap |
| Persistence | Saved ideas in IndexedDB; schema versioned (`v: 1`) |

---

## 6. Milestones

Each milestone ends with: tests green, typecheck clean, a LOG entry via `/wrap-up`, and a demoable build.

### M0 · Setup (half a day)
- Vite + React + TS (strict) + Vitest + ESLint/Prettier. Zustand.
- `prototype/chord-spark.html` stays as reference.
- Create `src/theory/random.ts` (seeded RNG) and `pitch.ts` with tests.
- `CREDITS.md` started.
- **Done when**: `npm run dev` shows an empty shell with the prototype layout skeleton; `npm test` runs.

### M1 · Audio engine spike and instruments (1–2 days)
Goal: prove the Tone.js + smplr combination, then replace every prototype synth.
1. Spike (AUDIO.md §4): one AudioContext shared by Tone and smplr; schedule a smplr `SplendidGrandPiano` note from a Tone transport callback; route smplr output through a Tone effect. Record the outcome in `docs/decisions.md`. If the bridge fails, use the documented fallback.
2. `audio/engine.ts`, `instruments.ts` with lazy per-genre loading and progress.
3. Instrument map per genre (AUDIO.md §5). Drums from smplr `DrumMachine`.
4. Master bus: per-genre FX → compressor → limiter.
- **Done when**: every genre plays its prototype pattern with sampled instruments; loop is sample-accurate for 10 minutes; first-sound budget met on warm cache; switching genre mid-play swaps instruments at the next bar without clicks.

### M2 · Theory core (1–2 days)
- `roman.ts` (THEORY §2.1), `chords.ts`, `keys.ts` with scales and ragas (THEORY §2.3), `functions.ts`, `voicing.ts` (THEORY §4), `analysis.ts` (best-fit scale + raga cousin).
- Port the prototype's generator as `progression/legacy.ts` so the app runs end-to-end on the new core.
- **Done when**: THEORY §8 invariants for roman parsing, spelling and voicing pass; app is at feature parity with the prototype (minus melody upgrade).

### M3 · Progression engine v2 (2–3 days)
- Genre profiles as JSON (THEORY §6), idioms, Markov transitions, function grammar, cadences, colour and borrowing, scorer, lock-aware regeneration (THEORY §3).
- UI: function badges, borrowed marker, idiom name, seed display + "copy seed".
- **Done when**: 1,000-seed property tests pass for every genre; a blind listening pass by the owner of 20 ideas per genre rates ≥ 15 as "usable as a starting point"; locks never change a locked chord.

### M4 · Melody engine v2 (2–3 days)
- Rhythm vocabularies, motif + development operators, phrase form, cadence endings, raga mode (THEORY §5).
- Melody plays on the genre's lead instrument.
- **Done when**: THEORY §8 melody invariants pass across 1,000 seeds; owner rates ≥ 12 of 20 melodies per genre as "worth reacting to".

### M5 · Export and persistence (1 day)
- MIDI export: separate tracks for Chords (RH), Bass (LH), Melody, Drums (channel 10), tempo + key signature meta, track names, GM program numbers (AUDIO.md §7). File name `chordspark_<genre>_<key>_<bpm>bpm_<seed>.mid`.
- Optional: per-track MIDI download; drag-out of the .mid file where the browser supports it.
- Saved ideas in IndexedDB with JSON export/import.
- **Done when**: exported file opens in FL Studio with correct tempo, four named tracks, notes matching the keyboard view.

### M6 · Data-driven transitions (stretch, 1–2 days)
- Offline pipeline over Chordonomicon (THEORY §7) to produce transition tables for pop, rock, metal, electronic, rap, jazz, soul.
- Blend: `p = α·data + (1−α)·handAuthored`, α per genre in the profile.
- **Done when**: tables committed as small JSON (< 30 KB each), attribution in CREDITS.md, tests still pass.

### M7 · WAV export (stretch)
- Offline render of N loops to WAV via smplr `renderOffline` / `audioBufferToWav` or `Tone.Offline`.

---

## 7. Testing strategy

- **Unit**: roman parsing round-trips, spelling per key, chord pitch classes, scale/raga tables.
- **Property-based** (fast-check): for 1,000 seeds × 8 genres × 2 lengths × 3 colours, assert THEORY §8 invariants.
- **Golden ideas**: 10 fixed seeds per genre snapshotted as JSON. A diff means generator behaviour changed; update deliberately.
- **Audio**: no automated sound tests. A manual checklist per milestone in the LOG entry (loop drift, genre switch, iOS unlock).
- **E2E smoke** (Playwright, optional): load, generate, play, export MIDI triggers a download.

---

## 8. Backlog (after v1)

Ordered by value to the owner.

1. **Play along with a USB keyboard** via Web MIDI (WEBMIDI.js): highlight the keys he presses, record a melody take over the loop, quantise, keep it in the idea, export.
2. Song sections: generate verse / chorus / bridge that relate (shared motif, contrasting register, chorus lifts).
3. UI redesign.
4. Lead sheet view with abcjs so notation can be learned gradually beside the keyboard view.
5. Hum-to-notes via microphone pitch detection.
6. Better sample sets: orchestral (VSCO 2 Community Edition, verify licence), tabla/mridangam and bodhrán packs with compatible licences, a modern drum kit for metal.
7. 6/8 and 3/4 meters across all genres (jig, waltz).
8. PWA offline mode with pre-cached samples.
