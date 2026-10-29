# Motif: Music Theory Engine

How the generators think. Everything here lives in `src/theory/` and is pure, seeded TypeScript.

Sections: §1 approach · §2 representation · §3 progression engine · §4 voicing · §5 melody · §6 genre profiles · §7 data pipeline · §8 test invariants.

---

## 1. Approach

The prototype picked a template and mutated it. v1 combines three layers, each simple on its own:

1. **Idioms**: named progressions that define a style (Andalusian cadence, royal road, epic Aeolian). They give instant genre identity and let the UI teach ("This is the Axis progression").
2. **Weighted transitions (Markov)**: per genre, P(next chord | previous one or two). Hand-authored at first, later blended with statistics from the Chordonomicon dataset (§7).
3. **Rules as a scorer**: harmonic function, cadences, repetition, borrowing budget and voice leading. The generator makes ~24 candidates and samples one in proportion to its score, so output is varied but never nonsense.

This hybrid follows what the research shows: rule systems keep music theory correct, statistical models capture idiom and phrasing, and each alone has gaps (Markov output wanders away from the tonic; pure rules sound generic). Melody uses the same pattern (§5).

---

## 2. Representation

### 2.1 Roman numeral tokens (our own grammar)

```
token     := accidental? numeral mark? ext? ('/' bassFigure)?
accidental:= 'b' | '#'                 display as ♭ ♯
numeral   := I II III IV V VI VII      uppercase = major third
           | i ii iii iv v vi vii      lowercase = minor third
mark      := '°' dim | '+' aug | 'ø' half-dim (implies 7)
ext       := '5' | '6' | '7' | 'maj7' | '9' | 'maj9' | 'add9' | 'sus2' | 'sus4'
bassFigure:= '3' | '5' | '7' | 'b7'     chord tone in the bass (inversion)
```

- Accidentals are relative to the **major** scale degree, in every mode. Natural minor is therefore `i ii° bIII iv v bVI bVII`. This matches the prototype and common pop/film analysis, and keeps borrowed chords obvious.
- Examples: `bVImaj7`, `ii7`, `V7/3` (V7 with the 3rd in the bass, i.e. first inversion), `iiø7`, `bII5`.
- Why not tonal's parser: `Progression.fromRomanNumerals("C", ["ii7","vi"])` returns `["D7","A"]`, because it ignores case for quality. Verified with tonal 6.5.1. Use tonal only for spelling notes and intervals.

### 2.2 Harmonic function

Function drives the grammar, the scorer and the UI badge.

| Function | Major key | Minor key |
|---|---|---|
| **T** tonic | I, vi, iii, i* | i, bIII, I (Picardy), bVI (as deceptive target) |
| **PD** pre-dominant | ii, IV, ii7, iv*, ii°*, bVI*, bII* (Neapolitan) | ii°, iv, bVI, bII, IV and ii (Dorian) |
| **D** dominant | V, V7, vii°, v*, bVII* (backdoor) | V (harmonic minor), v, vii°, bVII |

`*` = borrowed (modal mixture). Chromatic mediants (III, VI, bIII in major; ♯iii etc.) and anything else not in the table are tagged `other` and allowed only where a profile permits.

`functions.ts` reads the table by root and triad quality; extensions and inversions do not change the function (V7/3 is D). Sus and power chords use their numeral case. bVI directly after a D chord is T (deceptive target) in both families; elsewhere it is PD.

**Borrowed** = the triad has a note outside the key's own scale (major: Ionian; minor: Aeolian, plus V and vii° from harmonic minor). Extensions do not count (bVIImaj7 in minor is not borrowed). Chromatic mediants are borrowed too, so they count against the colour budget.

Grammar: phrases cycle **T → (PD) → D → T**. Retrogression D → PD (e.g. V → IV) is penalised only where a profile says so (classical yes; rock, pop and metal no).

### 2.3 Scales and ragas

`keys.ts` holds every scale as semitone sets. Ragas add ascending (arohana) and descending (avarohana) sets. The 72 melakarta ragas each map to a seven-note Western scale; the ones we use:

| Raga (melakarta no.) | Semitones | Western equivalent |
|---|---|---|
| Dheerashankarabharanam (29) | 0 2 4 5 7 9 11 | major / Ionian |
| Mechakalyani (65), "Kalyani" | 0 2 4 6 7 9 11 | Lydian |
| Harikambhoji (28) | 0 2 4 5 7 9 10 | Mixolydian |
| Kharaharapriya (22) | 0 2 3 5 7 9 10 | Dorian |
| Natabhairavi (20) | 0 2 3 5 7 8 10 | natural minor / Aeolian |
| Keeravani (21) | 0 2 3 5 7 8 11 | harmonic minor |
| Gourimanohari (23) | 0 2 3 5 7 9 11 | melodic minor (ascending) |
| Hanumatodi (8) | 0 1 3 5 7 8 10 | Phrygian |
| Vakulabharanam (14) | 0 1 4 5 7 8 10 | Phrygian dominant |
| Mayamalavagowla (15) | 0 1 4 5 7 8 11 | double harmonic |

Janya (derived) ragas common in film songs, with different ascent/descent:

| Raga | Arohana | Avarohana | Note |
|---|---|---|---|
| Mohanam | 0 2 4 7 9 | 9 7 4 2 0 | major pentatonic |
| Hamsadhwani | 0 2 4 7 11 | 11 7 4 2 0 | |
| Madhyamavati | 0 2 5 7 10 | 10 7 5 2 0 | |
| Sivaranjani | 0 2 3 7 9 | 9 7 3 2 0 | |
| Hindolam | 0 3 5 8 10 | 10 8 5 3 0 | |
| Suddha Dhanyasi | 0 3 5 7 10 | 10 7 5 3 0 | minor pentatonic |
| Abheri | 0 3 5 7 10 | 10 9 7 5 3 2 0 | asymmetric |

Before shipping, verify each row against a second reference and keep the table under test (`ragas.test.ts`). Easy mistake to avoid: Chakravakam (16) looks like Mixolydian but has a flat 2nd (0 1 4 5 7 9 10). Harikambhoji (28) is the Mixolydian match.

**Best-fit scale** (`analysis.ts`): count every chord tone of the progression by pitch class; score each candidate scale of the idea's mode family as `inside − 2 × outside`; ties prefer the profile's default scale. Show the raga cousin for every result.

---

## 3. Progression engine

### 3.1 Inputs

`generateProgression({ profile, key?, mode?, bars, colour, locks, prev, rng })`

- `key`/`mode`: user-fixed or sampled from `profile.modes` weights. A fixed mode must be one of `profile.modes`; another mode is an error that names the allowed modes.
- `colour`: 0 Plain, 1 Some, 2 Spicy.
- `locks`: indices whose chords must not change.
- `prev`: the last 5 generated ideas, to avoid repeats.

### 3.2 Pipeline

1. **Resolve mode and key.**
2. **Make 24 candidates.** For each:
   - With probability `profile.idiomRate` (0.3–0.6), take a weighted idiom and fit it to the length (4 bars as written; 2-chord vamps repeat; for 8 bars use idiom + variation, or idiom + a second compatible idiom).
     - Eligible: listed in the profile, written for the mode, `minColour` ≤ colour, and not longer than the idea (8-chord idioms only in 8-bar ideas). No eligible idiom → walk.
     - One pass in bars: 2 chords → A B A B, 3 → A B C C, 4 and 8 as written. A vamp repeats to 8 bars.
     - 8 bars from a 4-bar pass: 50% a second compatible idiom (another eligible 4-bar idiom that does not start on the chord the first ends on), else a variation: bars 5–6 repeat bars 1–2, bars 7–8 are walked on from there (up to 4 tries for a second half that differs).
   - Otherwise walk the transition table: start from `profile.start` (mostly tonic; a mode with no row starts on its tonic triad); use second-order transitions where the table has them, else first-order. Lookups use the plain triad (`V7/3` reads as `V`). Temperature by colour: Plain 0.7 (safer), Some 1.0, Spicy 1.3, applied as weight^(1/T).
   - Fill cadence slots from `profile.cadences`: last bar always; bar 4 of an 8-bar idea gets a half cadence or a weak ending.
3. **Colour** (§3.5): borrowing, then extensions by function.
4. **Score** each candidate (§3.4).
   Before scoring, each candidate gets its final form: power chords (`i5`) where the voicing style is `power`, then inversions (`chooseInversions`, `profile.voicing.inversionRate`). The first and last bars stay in root position; locked bars stay as they are.
5. **Pick** by softmax over scores (temperature 0.5). Not argmax: variety matters. Candidates with three identical chords in a row are dropped first (unless `allowVamp`), when any other is left.
6. **Annotate**: function, borrowed flag, detected idiom name, roman, symbol, pitch classes. Idiom detection: the longest idiom of 3+ chords found as consecutive plain triads (any genre's, for the mode), or a 2-chord vamp that fills the whole idea; ties go to the idioms the candidate was built from.

### 3.3 Cadences

| Cadence | Shape | Used by |
|---|---|---|
| Authentic | V(7) → I / V → i | classical, pop, lofi, Malayalam film |
| Plagal | IV → I, iv → I (minor plagal) | pop, cinematic, gospel feel |
| Half | ends on V | bar 4 of 8 in classical, Malayalam |
| Deceptive | V → vi / V → bVI | Spicy only |
| Aeolian | bVI → bVII → i | epic, metal, cinematic |
| Mixolydian | bVII → I | Irish, rock |
| Subtonic | bVII → i | metal |
| Phrygian | bII → i | metal |
| Backdoor | iv7 → bVII7 → I | lofi Spicy |

Filling a slot (`progression/cadence.ts`):
- Shapes use the key family's tonic (I or i). Plagal uses the mode's own chord on degree IV (Dorian `IV → i`, Aeolian `iv → i`). Mixolydian and backdoor are major-family only; subtonic is minor-family only. Aeolian and backdoor write all three chords. Deceptive and backdoor need Spicy.
- An ending that already closes on an allowed cadence (compared as plain triads) is kept.
- Otherwise each usable cadence is weighted `1 / (1 + chords changed)`, × 0.2 when its first chord repeats the chord before it. A cadence never writes over bar 1.
- Cadences that would take the borrowed count past the allowance (§3.5) are skipped. If all would: bar 4 of 8 stays as it is (no mid cadence); the last bar takes the one adding the fewest borrowed chords. If no listed cadence fits the mode, authentic is used.
- `weak` keeps a bar that is already a weak stop, else samples an in-key, non-tonic, non-V chord from the transition row (or the mode's triads) that differs from the bar before.
- Order: bar 4 of 8 first, then the last bar. Cadence bars are protected from borrowing.

### 3.4 Scorer

Start at 0, add or subtract. Weights live in the profile so genres can tune them.

| Rule | Default weight |
|---|---|
| First chord has T function (or the idiom allows otherwise) | +2 |
| Last chord forms one of the profile's cadences | +3 |
| Same chord twice in a row (unless `allowVamp`) | −3 |
| Three identical chords in a row | −6 |
| D → PD retrogression | −2 × `profile.functionStrictness` |
| Each borrowed chord over the colour budget | −2 |
| Strong root motion (4th/5th) | +0.5 each × `profile.fifthMotion` |
| Stepwise bass motion | +0.5 each × `profile.stepBass` |
| Tritone root motion (unless profile allows) | −2 |
| At least 3 distinct chords in 4 bars | +1 |
| Identical to one of the last 5 ideas | −5 |
| Voice-leading cost of the voiced result (§4) above threshold | −1 per 6 semitones |
| Tonic straight to a chord on degree 4 (`I → IV`, `i → iv`, any extension) | −1 each |

Details (`progression/score.ts`):
- Chords compare as plain triads: `I → Iadd9` is a repeat.
- First chord: the +2 also goes to an idiom candidate that starts on the idiom's own first chord.
- Cadence: the last bar closes on any of the profile's end cadences.
- Root motion is measured between roots (5 or 7 semitones = 4th/5th, 6 = tritone); bass motion between bass notes (1–2 semitones either way), so inversions count.
- Budget = §3.5 budget for the colour and length (not the allowance).
- Variety: +1 for each 4-bar half with 3+ distinct triads.
- Voice-leading: voice the candidate with the genre's style; sum the upper-voice movement (§4 `movement`) over all changes; −1 per full 6 semitones above 8 per change.
- Tonic → 4: the owner rated it "not usable" in 15 of 17 ideas (M3 listening pass, 2026-10-27). `I7`/`I9` (V/IV) → IV is a resolution and does not count. −1 makes it rarer, not banned: second-bar rate lo-fi 47 → 25 %, classical 51 → 15 %, Malayalam 58 → 22 %, Irish 40 → 15 %.

### 3.5 Colour: extensions and borrowing

Order: borrowing (and secondary dominants) first, then extensions, then the `sevenths` floor, so borrowed chords can take colour too (`progression/colour.ts`).

- **Borrowing**: replace a non-locked, non-first, non-cadence chord with one from `profile.borrowPool` with probability `profile.borrowRate × [0.3, 1, 1.8][colour]`. The new chord has the same function as the old one in context and differs from its neighbours. Budget per 4 bars: Plain 0, Some 1, Spicy 2.
- **Allowance**: idioms and tables may bring their own borrowed chords (hero-rise `I bVI bVII I`, Mixolydian turn). Cadences and colour never take the borrowed count past `max(budget, borrowed chords in the raw candidate)`. An idiom author who wants an idiom kept out of Plain sets `minColour`.
- **Secondary dominants** (V/V, V/vi, V/ii) only at Some/Spicy and only where `profile.secondaryDominants` is true. They must resolve to their target. Written as 7th chords on the slot before the target: major `II7 → V`, `III7 → vi`, `VI7 → ii`; minor `II7 → V`, `I7 → iv`. They are one more option in the borrowing roll, count as borrowed, and protect their target.
- **Extensions by function** from `profile.colours[fn]`, applied with probability `profile.colourBias + [0, 0.3, 0.6][colour]` to chords that have none yet. Example cinematic: T `add9`/`maj7`, PD `add9`/`sus2`, D `sus4`. Fitted to the chord: on a minor chord `maj7`/`maj9` → `7`/`9`; on a major non-dominant chord `7`/`9` → `maj7`/`maj9`, and the reverse on a dominant; a diminished chord takes only a 7th (`°7` on minor-key vii°, else `ø7`). An extension that is not a valid token, or a sus that adds a note outside the scale (`iiisus2` in major), is skipped.
- **`sevenths`** (lo-fi): after extensions, every chord without a 7th gets one (`add9` → `9`, anything else → `7`, fitted as above).

### 3.6 Lock-aware regeneration

- Locked chords stay fixed in every candidate, byte for byte: cadences, borrowing, colour, power chords and inversions skip them. With any lock, the key (tonic and mode) stays.
- An unlocked slot between fixed neighbours is sampled with weight `P(x | left) × P(right | x)` so the swap fits on both sides.
  - Free bars before the first lock keep the raw chords; a free bar just before a lock uses the bridge weight; free bars after a lock are walked on from it.
  - When the product leaves nothing, `P(x | left)` alone is used.
- "Swap this chord" (single reroll) uses the same weight and excludes the current chord and identical neighbours. The borrowed count stays within max(budget, the other bars' count). On the last bar it keeps an end cadence when one can be made. The new chord takes colour like any other.
- Cadence rules still apply when the last bar is unlocked. A cadence may cover a locked bar only when that bar already has the cadence's chord; when locks block every cadence, the idea has none.

---

## 4. Voicing engine (`voicing.ts`)

Goal: chords that sound good on a piano and are easy to read on the keyboard.

- **Ranges** (MIDI): LH bass 36–52 (C2–E3), RH upper 55–79 (G3–G5). Profiles can shift them (metal bass lower, lofi upper slightly lower).
- **Candidate generation**: every inversion of the chord's upper pitch classes, stacked from three lower bounds (52, 55, 58), plus profile-style variants.
- **Cost** (minimise):
  - total voice movement from the previous voicing (sort both, pair by index; pad the smaller set with its top note);
  - top-voice leap above 5 semitones: +2 per semitone (the top note reads as an implied melody);
  - span wider than 14 semitones in close styles: +4;
  - low-interval limit: a 3rd whose lower note is below C3 (48), or a 2nd below G3 (55): a hard filter (bass included), not a cost; only if no candidate passes are they all scored;
  - doubled 3rd in a 4-note triad voicing: +2;
  - distance of the voicing's centre (mean of upper notes) from the profile's centre: +0.3 per semitone (stops drift). Defaults per style are `STYLE_DEFAULTS` in `voicing.ts` (close: 64 = E4, the prototype's).
- **Power-chord tokens** (`i5`) are voiced root–5th–octave or 5th–octave in every style.
- **Styles** (`profile.voicing`):
  - `close`: 3–4 notes within an octave and a bit (pop, classical).
  - `spread`: LH root + 5th or octave; RH colour tones on top (cinematic).
  - `rootless`: 3–7–9 / 7–9–3–5 shapes (lofi). Use tonal's `VoicingDictionary.lefthand` where the chord type exists (it covers 7, m7, maj7, m7b5, 69, m6, 7b9 etc.); fall back to our own for add9, sus and 9 types, which tonal's dictionaries do not cover (verified: search returns no result for Csus2, Cadd9, C5, Cm9, C6, Cmaj9).
  - `power`: root, 5th, octave (metal).
  - `drone`: tonic + 5th pedal in LH for the whole phrase; RH sus/fifth shapes (Malayalam raga mode, Irish).
- **Inversions for the bass** (`profile.inversionRate`): allow 1st/2nd inversion when it makes the bass move by step (C – G/B – Am). Classical and pop use it; metal never.
- Pitch classes in a voicing are always a subset of the chord. Rootless voicings may drop root and 5th, never the 3rd (unless the chord is sus or power).

---

## 5. Melody engine (`melody/`)

Built from the rules that recur across songwriting guides and rule-based melody research: chord tones on strong beats, passing and neighbour tones on weak beats, mostly stepwise motion, leap recovery, one climax per phrase, motif repetition and development, and cadential endings.

### 5.1 Pipeline

1. **Form** from length: 4 bars = motif `a` (bars 1–2) + answer `a'` (bars 3–4). 8 bars = antecedent `a a'` ending unstable (2nd, 5th or 7th degree over V or a non-tonic chord) + consequent `a a''` ending on 1 or 3 over the tonic.
2. **Motif rhythm** from the profile's rhythm vocabulary (§5.3). Constraints: at least 3 notes per bar (except the last), no more than 2 beats of rest per bar, no single rest longer than 2 beats.
3. **Motif pitches**: strong beats (1 and 3 in 4/4; 1 and 4 in 6/8) take chord tones, preferring the 3rd or 5th on beat 1 except at cadences. Weak beats take scale tones as passing tones (step, step in the same direction) or neighbour tones (step away and back). At Spicy, allow one appoggiatura per phrase on a strong beat, resolving down by step.
4. **Develop** the motif into the remaining bars with operators chosen by the form: exact repeat; tonal sequence (shift by scale steps, then re-fit strong beats to the new chord's tones); rhythm-only repeat with new pitches; fragmentation (repeat the first half); extension; inversion (Spicy only); augmentation at the cadence.
5. **Shape**: one climax per phrase, placed in the second half; keep the range within 12–14 semitones per phrase.
6. **Cadence**: final note lengthened (≥ 1.5 beats), approached by step, landing on 1 or 3 (5 at a half cadence).
7. **Score 16 candidates and sample**: strong-beat chord-tone ratio, step ratio (target ≥ 60%), leap recovery, range, climax position, motif similarity between bar 1 and bar 3 (target 0.5–0.9), rhythmic variety.

Details (`melody/generate.ts`, `rhythm.ts`, `score.ts`, `check.ts`):
- Form: 4 bars = a1 a2 a′ cadence. 8 bars = a1 a2 a′ half-cadence · a1 a2 (repeat 0.6, new pitches on its rhythm 0.4) a″ cadence. a′ and a″ develop bar 1 with a different operator each: repeat .2, sequence ±1–2 steps .3, rhythm-only .2, fragmentation .1 (only when no note crosses beat 3), extension (first half kept, rest new) .1, inversion .1 (Spicy only).
- A developed note aims at its source pitch (moved by the operator) and takes the nearest pitch the rules allow, so strong beats re-fit to the new chord.
- Cadence bar: a vocabulary cell cut so the final note starts between beat 2 and beat 3-and and lasts to the bar end (≥ 1.5 beats), with a weak-beat note just before it (split off when needed); fallback rhythm `1 1 2`. 30 %: augmentation instead, the first half of bar 1 at double length, when it has that shape.
- Pitches note by note. Hard rules (no pitch left = candidate dropped): interval ≤ 12, one interval > 7 per phrase, at most 4 notes alternating between two pitches, a weak-beat non-chord tone only when the next note can be a step away, and then it is. Soft rules (kept when something passes): phrase span ≤ 14, first half of a phrase ≤ its first note + 9, raga direction, the cadence note approached by step. Free notes are weighted by step size (the prototype's weights), × 4 / × 0.3 for leap recovery after 5+ semitones, × 2 for the 3rd or 5th on beat 1, × 1.5 for a new high in a phrase's second half.
- Weak-beat notes come from the scale, where a borrowed chord's note replaces the scale note a semitone away (♭VI in major: A♭, not A).
- Final note: degree 1 or 3 on the final chord, else 5, else any chord tone. Antecedent end (bar 4 of 8): degree 2, 5 or 7 on that chord, else a chord tone.
- Spicy appoggiatura: 25 % per strong beat (not the first note, not a cadence note) while the phrase has none; a non-chord tone whose next note in the bar is a chord tone 1–2 semitones below.
- Every candidate is checked against §8 (`melodyFaults`); up to 64 tries for 16 valid ones, softmax temperature 0.5. If none is valid: quarter-note chord tones, each nearest the last.
- Scorer: strong-beat chord tones 2 × (ratio − 0.7); steps −4 × shortfall below 0.6, + up to 0.2 above; −0.5 per unrecovered leap of 5+; −0.5 per three equal notes in a row; per phrase: −1 per semitone of span above 14, −0.5 below 7, climax +0.5 (single, second half) / −0.5 (first half) / −0.25 (shared); motif +1 in 0.5–0.9, else −2 × distance; −1 when every bar has the same rhythm, +0.3 for 3+ note lengths. Similarity = mean of shared onsets (Jaccard) and matching interval directions.

### 5.2 Interval rules

- Steps (1–2 semitones) are the default; leaps up to 7 semitones; one leap up to an octave per phrase, as the climax.
- After a leap of 5+ semitones, the next move is a step in the opposite direction.
- Non-chord tones never sit on a strong beat except the Spicy appoggiatura, and always resolve by step.
- At most 4 notes in a row alternate between two pitches (D E D E is fine, D E D E D is a trill). Grace notes do not count.

### 5.3 Rhythm vocabularies (`rhythm.ts`)

Each vocabulary is a list of one-bar cells in beats, weighted (all weight 1 for now). A cell with fewer than 3 notes (`3 1`, `2 2`, raga cells) gets its longest note split on the half-beat grid in every bar but the last: `2 2` → `1 1 2`. The app plays 4/4 only, so the jig plays two 6/8 cells per bar as 12/8 (an eighth = 1/3 beat). Melody notes stay inside their bar: no ties over the bar line, so `pop` has no anticipations yet.

| Vocabulary | Character | Cells (4/4, beats) |
|---|---|---|
| `lyrical` | long notes, dotted | [2,1,1] [1.5,0.5,2] [3,1] [1,1,2] |
| `pop` | syncopated eighths, anticipations of beat 1 | [0.5,1,0.5,1,1] [1,0.5,0.5,1.5,0.5] [0.5,0.5,0.5,0.5,2] |
| `lofi` | sparse, laid back, rests | [r1,1,0.5,1.5] [1.5,r1,1.5] [r0.5,0.5,1,2] |
| `classical` | balanced, scalar runs | [1,1,1,1] [0.5,0.5,0.5,0.5,1,1] [1,0.5,0.5,2] |
| `heroic` | rising leaps of 4th/5th, held tops | [1,1,2] [0.5,0.5,3] [2,2] |
| `jig` (6/8, in eighths) | groups of three | [1,1,1,1,1,1] [2,1,2,1] [3,1,1,1] |
| `riff` | eighth/sixteenth drive, half-steps | [0.5×8] [0.25,0.25,0.5,0.5,0.5,1,1] |
| `raga` | long notes with grace notes | [2,2] [3,1] [1,3] + gamaka hints |

### 5.4 Raga mode

- Pitches come only from the raga. Ascending moves use the arohana set; descending moves use the avarohana set.
- **Gamaka hint**: before a note of 1.5 beats or more, optionally insert a 1/16-beat grace note from the raga neighbour above or below. In MIDI export it is a separate short note so it can be edited in FL Studio.
- Raga choice: among the profile's ragas whose melakarta scale is the idea's mode, weighted by profile weight × fit (share of chords with 2+ raga notes). A raga with no note in some chord is out (Hindolam has no note of V in minor). None left: the mode's own melakarta raga.
- Gamaka details: 50 % per long note; the neighbour is 1–2 semitones away and not the pitch of the note before; it takes its 1/16 beat from the end of the note before (or from a rest). A gamaka that would break a §8 rule is dropped. Grace notes do not count as strong-beat notes or toward a bar's 3 notes.
- Harmony switches to the `drone` voicing with sparse chords built only from raga tones, weighted towards sus, fifth and add9 shapes. Plain triads that clash with a raga's characteristic phrases are a known problem when harmonising ragas, so default to drone + colour shapes and let Colour add fuller chords.

---

## 6. Genre profiles (`data/genres/*.json`)

### 6.1 Schema

One file per genre, checked at load by `profile.ts` (`validateProfile`). A bad file stops the app with every problem listed, each with its field path. Sound choices (comping pattern, drum kit and pattern, swing, instruments, FX) stay in `src/audio/genres.ts` (AUDIO.md §5, §6), not here.

```jsonc
{
  "id": "cinematic",                        // = file name
  "label": "Cinematic piano",
  "modes": { "minor": 0.55, "major": 0.35, "lydian": 0.10 },   // or "ragas", not both
  "tempo": [60, 80], "meters": ["4/4"],     // meters: 4/4, 3/4, 6/8
  "idiomRate": 0.45,
  "idioms": [ { "id": "epic-aeolian", "weight": 3 } ],         // ids from data/idioms.json
  "start": { "minor": { "i": 0.85, "bVI": 0.15 }, "major": { "I": 0.8, "vi": 0.2 } },
  "transitions": { "minor": { "i": { "bVI": 0.3, "iv": 0.2, "bVII": 0.2, "bIII": 0.15, "v": 0.15 } } },
  "dataWeight": 0.6,                        // optional: α for a Chordonomicon table (§7)
  "cadences": { "end": ["aeolian", "plagal-minor", "authentic"], "mid": ["half", "weak"] },
  "colours": { "T": ["add9", "maj7"], "PD": ["add9", "sus2"], "D": ["sus4"] },
  "colourBias": 0.15,
  "borrowPool": { "major": ["iv", "bVI", "bVII", "III"], "minor": ["IV", "bII"] },
  "borrowRate": 0.25,
  "secondaryDominants": false,
  "scorer": { "functionStrictness": 0.3, "fifthMotion": 0.5, "stepBass": 1, "allowVamp": false, "allowTritone": false },
  "voicing": { "style": "spread", "inversionRate": 0.2 },     // optional "centre" (MIDI 48–79)
  "drums": false,                           // Drums toggle default
  "melody": { "vocab": "lyrical", "range": [67, 86] },        // vocab from §5.3; range ≥ 12 semitones
  "structure": ["Intro 4", "Theme 8", "Theme + octaves 8", "Bridge 8", "Theme, softer 8", "Outro 4"],
  "prompts": ["Play only the top note of each chord, then grow those notes into a melody."]
}
```

Rules the validator checks:
- **Modes**: from `keys.ts` `MODES` (major, minor, dorian, mixolydian, phrygian, lydian, harmonicMinor, phrygianDominant, doubleHarmonic). A profile gives `modes` or `ragas` (raga name → weight). With `ragas`, each raga adds its weight to the mode of its melakarta scale (a janya raga uses its parent's): Malayalam.
- **Mode-keyed tables** (`start`, `transitions`, `borrowPool`) use only the profile's own modes. Weights are above 0 and need not sum to 1.
- **Transitions**: a key is one token (first order) or two tokens, `"previous current"` (second order). Write states as plain triads; colour (§3.5) and `sevenths` add the extensions.
- **borrowPool**: every chord must be borrowed in its mode (§2.2), so the colour budget counts it.
- **Idioms**: each id exists in `data/idioms.json` and fits at least one of the profile's modes.
- **Cadences** from §3.3, plus `plagal-minor` (iv → I) and `weak` (a mid-phrase stop on a non-tonic chord that is not V).
- `sevenths: true` (lo-fi): every chord carries a 7th at every colour level.
- Unknown fields are errors.

**Idioms** (`data/idioms.json`): `{ "id", "name", "chords", "modes", "minColour"? }`. `chords` has 2 tokens (a vamp that repeats), 3 (the last chord is held two bars), 4 or 8. `modes` lists the modes it is written for. `minColour` 2 = Spicy only. Ids are unique; idioms are shared between genres.

Transition tables can start sparse: any missing state falls back to the function grammar (`T → PD|D`, `PD → D|T`, `D → T`, `other → T`) restricted to the mode's diatonic chords plus `borrowPool`. Diatonic triads weigh 1, `borrowPool` chords `borrowRate × [0.3, 1, 1.8][colour]`; the current chord and chords tagged `other` are left out. Diatonic triads are built on each scale degree; shapes that are not major, minor, diminished or augmented (double harmonic's V and vii) are left out.

### 6.2 Seed content per genre

Idioms are written in our roman grammar. Names appear in the UI.

**Cinematic piano** · minor .55 / major .35 / lydian .10 · 60–80 BPM · spread voicing · arpeggios with sustain pedal
- Epic Aeolian `i bVI bIII bVII` · Andalusian `i bVII bVI V` · Axis (minor start) `vi IV I V` · Minor plagal lift `I IV iv I` · Chromatic mediant `I bVI I` and `I III IV I` (Spicy) · Lydian float `I II I II` (lydian mode)
- Chromatic mediants (roots a 3rd apart, one common tone) are the film-score signature; allow them at Spicy via `borrowPool`.

**Epic orchestral** · minor .8 / major .2 · 84–120 BPM · open fifths, octave doublings · sustained strings + 8th-note ostinato + low brass · big drum hits
- `i bVI bVII i` · `i bVI bIII bVII` · `i bVII bVI bVII` · `i iv bVI V` · Hero rise `I bVI bVII I` · Picardy finish (minor progression ending on `I`)
- Melody `heroic`: rising 4th/5th motifs, lead French horn.

**Lo-fi / hip hop** · major .45 / minor .4 / Dorian .15 (for the Dorian vamp) · 70–90 BPM · swing 0.25–0.35 on 16ths · rootless voicings · lazy comping with anticipations · boom-bap drums
- ii–V–I `ii7 V7 Imaj7 vi7` · Turnaround `Imaj7 vi7 ii7 V7` · Royal road `IVmaj7 V7 iii7 vi7` and resolved `IVmaj7 V7 Imaj7` · Minor `i7 iv7 bVImaj7 V7` · Dorian vamp `i7 IV7` · Descending sevenths `IVmaj7 iii7 ii7 Imaj7`
- Colour floor is 7ths even at Plain. Spicy adds 9/11/13, tritone substitute `bII7` before I, backdoor `iv7 bVII7 I`.

**Classical** · major .6 / minor .4 · 72–110 BPM · 4/4 and 3/4 · close four-part voicing with inversions · Alberti or broken chords
- `I IV V I` · `I vi ii V` · `I ii6 V7 I` · Pachelbel `I V vi iii IV I IV V` · Circle of fifths `vi ii V I`, minor `i iv bVII bIII bVI ii° V i`
- Strict function (`functionStrictness: 1`), authentic cadence at the end, half cadence at bar 4 of 8. Secondary dominants at Some/Spicy. Cadential 6/4 (`I/5 V`) at Spicy.

**Malayalam melody** · ragas weighted: Shankarabharanam .2, Natabhairavi .15, Keeravani .15, Kharaharapriya .15, Mohanam .1, Kalyani .1, Mayamalavagowla .05, Hindolam .05, Sivaranjani .05 · 70–100 BPM · 4/4 and 6/8
- Two harmony modes. **Film** (default at Some/Spicy): Western chords diatonic to the raga, e.g. `i bVII bVI V`, `I IV I V`, `i iv i V` (harmonic minor V), relative-major lift `bIII` for a charanam feel. **Raga** (default at Plain): drone + sparse shapes (§5.4).
- Lead: flute, then violin. Melody raga mode on by default with gamaka hints.
- Percussion: tabla/mridangam samples are not in smplr; ship a soft placeholder and track sample sourcing in the backlog.

**Irish folk** · Ionian .35 / Dorian .3 / Mixolydian .25 / Aeolian .1 · reels 100–130 BPM in 4/4, jigs in 6/8 · open voicings (root–5th–octave + sus), drone-friendly · strummed bounce
- Dorian tunes alternate `i` and `bVII`; Mixolydian tunes move between `I`, `IV` and `ii` (per irishtune.info's mode guide). Plus `I bVII I V`, `I IV I V`, Aeolian `i bVII bVI bVII`.
- Chords change once per bar or half bar; `allowVamp: true`.
- Melody `jig` or stepwise eighths; ornament hints (cuts/rolls) as grace notes. Lead fiddle or tin whistle.

**Metal** · Aeolian .5 / Phrygian .3 / Phrygian dominant .2 · 110–180 BPM · ends on Phrygian, Aeolian, subtonic or plagal · power chords, low register · 8th/16th palm-muted chug with accents · double-kick drums
- `i bVI bVII i` · Phrygian `i bII i bVII` · `i bVI bIII bVII` · `i iv bVI V` (harmonic minor) · Tritone `i bV` (allowTritone)
- `allowVamp: true`, no inversions, no extensions. Melody `riff`: half-steps, the ♭2 is a feature.

**Pop** · major .7 / minor .3 · 90–125 BPM · close voicings near middle C with inversions · 8th pulse · pop drums
- Axis `I V vi IV` and `vi IV I V` · 50s `I vi IV V` · `IV I V vi` · `I IV vi V` · Royal road (shared) · Mixolydian rock `I bVII IV I`
- Colour: add9/sus. Borrowed iv and bVII. Melody `pop`: hook-like, high motif repetition, singable range C4–E5.

---

## 7. Data pipeline: Chordonomicon (milestone M6)

Chordonomicon is a dataset of about 680k songs' chord progressions with Spotify-derived genre labels and section tags (intro, verse, chorus, …). Licence: **CC BY-NC 4.0**. Shipping tables derived from it means the app stays non-commercial and credits the dataset. If that ever changes, regenerate tables from another source.

Main genres in the data include pop, rock, pop rock, metal, punk, alternative, electronic, soul, jazz, country and rap. Cinematic, epic, classical, Malayalam and Irish are not covered, so they stay hand-authored.

Built by `npm run tables` (`scripts/chordonomicon/build.ts`, Node 24 runs the TypeScript directly). The CSV (`chordonomicon_v2.csv`, 264 MB, from huggingface.co/datasets/ailsntua/Chordonomicon) goes in `scripts/chordonomicon/data/`, which is gitignored. The script takes about 10 s.

Genre map: pop ← `pop`; metal ← `metal`, minor only; lo-fi ← `jazz` + `soul`. The other genres have no data and stay hand-authored.

Steps:
1. Read `chords` and `main_genre` from each row. `chords` is section tags and symbols: `<verse_1> F C E7 Amin`. Sharps are written `s` (`Fs`, but `Csus4` is C), minor `min`, power chords `no3d`.
2. Parse each symbol to root pitch class + triad quality (maj, min, dim, aug, sus, power). Drop extensions and slash basses: tables hold plain triads (§6.1).
3. Split the song into sections. A section with the same chords as an earlier one in the song counts once.
4. Estimate the key per section: correlate a pitch-class histogram (each chord adds 1 per triad note and 1 more on its root) with the Krumhansl–Kessler profiles in all 24 keys. Add the whole song's histogram at half weight, so short sections lean on the song. Add +0.06 when the last chord is the key's tonic triad and +0.03 for the first chord.
5. Convert to roman tokens (§2.1). Accidentals are against the major scale; semitone 6 is `bV`, or `#iv°` when diminished. Power and sus chords take the key's own triad on that degree (major off the scale). Merge repeated neighbours.
6. Count start chords, 1st- and 2nd-order transitions and 4-chord n-grams per genre × family. No verse/chorus split: the generator has no section input yet. Sections in a family the genre does not use are skipped.
7. Prune rows: drop successors with p < 0.01, keep the top 12, renormalise, round to 3 decimals. Keep a state only with ≥ 100 transitions and ≥ 0.4 % of the family's transitions; at most 24 first-order and 40 second-order states per family.
8. Write `src/theory/data/transitions/<genre>.json` with `{ source, licence, genres, songs, generatedAt, start, transitions }`. Each file must stay under 30 KB.
9. Print a sanity report: top 20 four-chord n-grams per genre. Pop major must show `I V vi IV` near the top; if not, key estimation is broken.

Blend at load (`blend.ts`, called from `genres.ts`): `p = α · data + (1 − α) · handAuthored`, each row normalised first, with α = the profile's `dataWeight` (default 0.6; 0 turns the data off). A state only one side has uses that side's row alone. A second-order state that one side lacks uses that side's first-order row for the current chord, the row the walk would read. Modes the data does not cover keep the hand-authored table. `validateTransitionData` checks each file at load.

The Hooktheory Trends API is a good manual reference for "what usually follows this chord", but its terms don't clearly allow caching or redistribution and it needs a login, so do not build on it.

---

## 8. Test invariants

Run as property tests over 1,000 seeds × 8 genres × lengths {4, 8} × colours {0, 1, 2} on the candidates (`walk.test.ts`, `cadence.test.ts`); the full engine (24 candidates, scoring, voicing) runs 50 seeds per genre/length/colour (`generate.test.ts`) to keep `npm test` fast. Melody: 1,000 seeds per genre on walk chords, length and colour cycling with the seed (`melody-invariants.test.ts`), and 50 seeds per genre/length/colour on the full engine (`melody.test.ts`). Golden seeds: `tests/theory/golden/progression.txt`.

**Roman / chords**
- `parse(format(t)) == t` for every token in every profile and idiom.
- Lowercase numerals always produce a minor third; `°` a diminished fifth.
- Spelling uses flats in flat keys and sharps in sharp keys. A key uses the signature with fewer accidentals. The two ties, G♭/F♯ major and E♭/D♯ minor (six each), are decided per idea by `chooseKeySpelling`: spell the chords both ways, count awkward names (C♭ F♭ E♯ B♯, double accidentals; an awkward root counts twice), keep the lower count; equal counts keep flats. Pop I–V–vi–IV becomes F♯ C♯ D♯m B, not G♭ D♭ E♭m C♭.

**Progression**
- Length equals `bars`. Locked chords are byte-identical before and after.
- First chord has T function, or comes from the genre's `start` row or an idiom's first chord (pop may start on IV). Later steps never change bar 1.
- The last two chords form one of the profile's cadences.
- No three identical consecutive chords unless `allowVamp`.
- Borrowed chords within the colour budget.
- Same seed + settings → identical output.

**Voicing**
- All notes within the style's ranges; 3–5 upper notes (2–3 for power).
- No low-interval-limit violations.
- Voicing pitch classes ⊆ chord pitch classes; the 3rd is present unless sus/power.
- Average summed movement between consecutive close/rootless voicings ≤ 8 semitones.

**Melody**
- All notes in range and, in raga mode, in the raga.
- ≥ 70% of strong-beat notes are chord tones (≥ 60% in raga mode).
- Every weak-beat non-chord tone resolves by step.
- No interval > 12; intervals > 7 at most once per phrase.
- No more than 4 main notes in a row alternate between two pitches.
- Final note is a chord tone of the final chord and lasts ≥ 1 beat.
- No overlapping notes; each bar except the last has ≥ 3 notes; rest per bar ≤ 2 beats.
