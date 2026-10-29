# P1 plan: core additions

Status: approved by the owner with D1–D4 = A. Built; waiting for the owner's review before the commits.

Spec: `.plans/ai-producer-spec.md`, section "Tools" and the P1 row of "Build order".

## Goal

Add four pure parts to `@motif/core`. The P4 tools will wrap them. P1 adds no server, no model and no UI.

1. Idea facts: a plain-data description of an idea.
2. Constraint search: generate with `endsOn` and `endsOnTonic`.
3. Set a chord by roman numeral.
4. Explicit tempo.

Done when: unit and property tests pass, typecheck and lint pass, and the golden file does not change.

## What exists now

- `generateIdea(settings, seed, previous?, recent?)` returns `{ idea, bpm }`. It always samples the bpm from the genre range with the rng.
- `rerollChord`, `newMelody` and `transpose` exist. `transpose` is `set_key`. `newMelody` is `new_melody`. P1 does not change them.
- `Idea` has no cadence field. `generateProgression` knows the cadence, but `generateIdea` drops it.
- No code gives a mode "brightness" value.
- The golden file covers `generateProgression` only. P1 does not change that function, so the golden file stays the same.

## New files

All in `packages/core/src/`. Tests in `packages/core/tests/`.

| File | Contents |
|---|---|
| `describe.ts` | `describeIdea`, `chordQuality`, `detectCadence`, `modeBrightness` |
| `search.ts` | `searchIdea`, `MAX_TRIES = 12` |
| `idea.ts` (change) | `setChord`, `checkTempo` |
| `warnings.ts` | the `Warning` type |

Web imports stay subpaths, for example `@motif/core/describe`. The `./*` export map already allows this.

## 1. Idea facts (`describeIdea`)

`describeIdea(idea, genre, bpm): IdeaFacts`. The result is plain JSON: no functions, no class instances. A test checks `JSON.parse(JSON.stringify(facts))` equals `facts`.

Fields, from the spec:

- `key`: name ("A minor"), tonic name, mode id, `brightness` (see decision D1).
- `bars`: 4 or 8.
- `chords[]`: `bar` (1-based), `symbol`, `roman` (display form), `function` (T, PD, D, other), `quality`, `borrowed`, `notes` (names without octave, root first).
- `ending`: `roman`, `quality`, `onTonic`.
- `cadence`: the cadence at the last bar, or `null` (see decision D2).
- `borrowedCount`, `dominantCount`.
- `idiom`, `raga` (or `null`).
- `bpm`.
- `melody`: note names with octave, one array per bar (an empty array = rest).

Rules:

- `quality` comes from the token: `major`, `minor`, `diminished`, `augmented`, `halfDiminished`, `sus`, `power`. Sus and power chords have no third, so they are neither major nor minor.
- `onTonic` is true when the last chord is on degree I with no accidental (I, i, Imaj7, i7, I5, and so on).
- `chords[].symbol` and `notes` come from `chordView`, so the facts match the cards in the app.
- `melody` uses `melodyNoteName`, so it matches the piano roll names.

## 2. Constraint search (`searchIdea`)

```ts
searchIdea(request: {
  settings: IdeaSettings;
  seed: number;
  constraints?: { endsOn?: 'major' | 'minor'; endsOnTonic?: boolean };
  bpm?: number;
  previous?: Idea;
  recent?: readonly (readonly string[])[];
}): { idea: Idea; bpm: number; tries: number; constraintsMet: boolean; warnings: Warning[] }
```

- Try 1 uses `seed` itself. So a search with no constraints gives exactly `generateIdea(settings, seed, ...)`, with `tries: 1`.
- Tries 2 to 12 take their seeds from `createRng(seed)`. One logged seed replays the full search.
- The search stops at the first idea that meets every constraint.
- When no try meets them all, it returns the try that meets the most constraints. A tie goes to the earliest try. It adds a `constraints-not-met` warning.
- When the last bar is locked, the ending cannot change. The search runs one try only and warns `ending-locked` if the constraints fail.
- When locks force the previous key or mode, and the settings ask for a different one, it warns `locks-kept-key`. Locks always stay (spec: never unlock unless the user asks).
- When the bar count changes, `generateIdea` drops the locks. The search warns `locks-dropped`.
- `keepLocks: false` is a P4 tool concern: the tool passes `previous` with all locks off. Core needs no flag.

## 3. Set a chord by roman numeral (`setChord`)

`setChord(idea, settings, bar, roman, seed): { idea, warnings }`. `bar` is 0-based, like `rerollChord`.

- `parseRoman` reads the text. It accepts `bVI`, `♭VI`, `V7/3` and so on. Bad text throws `RomanError` with its current message.
- A bar out of range throws an error.
- A locked bar throws an error: "bar 3 is locked". The model must ask the user before it unlocks.
- The other bars and the locks do not change.
- Functions, borrowed flags, idiom, spelling, scale and voicings follow the new chord, through the same `derive` that `rerollChord` uses.
- The melody is new (from `seed`), as after `rerollChord`. Old melody notes may clash with the new chord.
- Warning `borrowed-chord` when the new chord has a note outside the key's scale.
- Warning `cadence-broken` when the last bar closed on one of the genre's end cadences before the change and does not after it.
- Warning `same-chord` when the text gives the chord that is already there. The idea does not change.

## 4. Explicit tempo

- `checkTempo(bpm, genre): Warning[]`. A bpm outside 40 to 240, or not an integer, throws an error. A bpm outside the genre's range gives a `tempo-outside-genre` warning, with the range in the message.
- `searchIdea` accepts `bpm`. When it is set, it replaces the sampled bpm.
- The rng still samples a bpm and throws it away. So the chords and the melody for a seed are the same with or without an explicit bpm.
- `set_tempo` in P4 is then only `checkTempo` plus a new bpm value. No idea change.

## Warnings

```ts
interface Warning { code: WarningCode; message: string }
```

Codes give the tests something exact to check. The message is for the model, in plain English, for example: "Bar 4 now ends on IV. The idea no longer ends on a pop cadence."

## THEORY.md changes (same commit as the code)

A new short section "§9 Idea facts": the quality rules, `onTonic`, the brightness value, and the cadence detection. The rule file says rules come from THEORY.md.

## Tests

`describe.test.ts`
- One fixed seed per genre: inline snapshot of the facts.
- Property, 200 seeds × all genres: `chords.length` equals bars; `borrowedCount` equals the borrowed flags; `onTonic` agrees with the last token; every chord has notes; the facts are plain JSON.
- `chordQuality` for each token shape (I, i, ii°, iiø7, III+, Isus4, i5).

`search.test.ts`
- No constraints: same idea as `generateIdea`, `tries: 1`.
- Same request twice: same result.
- Property, many seeds: `tries` is 1 to 12; when `constraintsMet` is true the ending meets each constraint.
- An impossible request (pop with `mode: 'major'`, `endsOn: 'minor'`, `endsOnTonic: true`): 12 tries, `constraintsMet: false`, warning.
- Locked last bar: 1 try. Locks with another mode: `locks-kept-key`. Bars 4 → 8 with locks: `locks-dropped`.
- An explicit bpm gives the same chords and melody as no bpm.

`idea.test.ts` (core; new file, the web one stays)
- `setChord`: bad text, bar out of range and a locked bar throw. Borrowed and cadence warnings. Other bars and locks stay. Derived fields equal a fresh `derive`.
- Property: every token from many generated ideas, set in every bar, voices without an error and keeps the melody in range.
- `checkTempo`: the limits and the genre warning.

## Out of P1

- Zod schemas and tool names: P4.
- The `change_chord` reroll path: it uses `rerollChord` as it is. P4 adds the lock check for it.
- Any UI change. The app does not use the new functions yet.

## Decisions for the owner

**D1. Mode brightness.** The spec asks for "the mode's brightness rank".
- A (recommended): a computed number, the sum of the scale steps minus the Aeolian sum. Lydian +4, major +3, Mixolydian +2, Dorian +1, harmonic minor +1, double harmonic +1, minor 0, Phrygian dominant 0, Phrygian −1. It is a fact that code can test. Ties are possible, and the model reads the mode name too.
- B: a hand-written order in THEORY.md, 1 = brightest. No ties, but it is a mood judgment in code, which the spec avoids.

**D2. Cadence fact.**
- A (recommended): detect it from the chords. Test the cadence shapes against the last bar, longest shape first, and use the first match; else `null`. It stays correct after `setChord` and `rerollChord`.
- B: store `cadence` on `Idea` at generation. Simpler, but it goes stale after a chord change, and saved ideas from before have none.

**D3. Where the explicit bpm goes.**
- A (recommended): a separate `bpm` field on the search request, not on `IdeaSettings`. Reason: the web store passes its whole state as `IdeaSettings`, and that state has a `bpm`. A `bpm` on `IdeaSettings` would make every new idea keep the store tempo. That is a behaviour change.
- B: `IdeaSettings.bpm`, and change the store to pass only the settings fields.

**D4. Setting a locked bar.**
- A (recommended): throw an error. The model reads it and asks the user.
- B: allow it with a warning.

## Commits

1. `core: idea facts (describeIdea)` with THEORY §9.
2. `core: constraint search and explicit tempo`.
3. `core: set a chord by roman numeral`.

Each commit runs `npm test` and `npm run typecheck` first.
