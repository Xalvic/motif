# Decisions

One line per decision, newest first. Format: `YYYY-MM-DD · decision · why · status`.
Status is `accepted`, `pending spike`, or `replaced by <date>`. Check here before reopening a choice.

- 2026-10-21 · Pin TypeScript ~6.0, not 7 · typescript-eslint 8.72 supports only < 6.1 · accepted, revisit when typescript-eslint supports 7
- 2026-10-21 · Shared AudioContext between Tone.js and smplr · avoids two clocks · **pending spike (M1)**, see AUDIO.md §4
- 2026-10-21 · Tone.js for clock/effects, smplr for samples · best-maintained options; Howler has no musical clock · accepted
- 2026-10-21 · Own roman-numeral parser; tonal for spelling only · tonal's `fromRomanNumerals` ignores lowercase = minor · accepted
- 2026-10-21 · Own voicer; tonal `VoicingDictionary` only for rootless 7th-family chords · tonal dictionaries lack sus/add9/power/9 · accepted
- 2026-10-21 · Generators = idioms + weighted transitions + rule scorer; melody = motif rules + scorer · controllable, testable, no ML runtime · accepted
- 2026-10-21 · No Magenta.js in v1 · unmaintained since 2022, heavy · accepted
- 2026-10-21 · No Hooktheory API data in the app · unclear redistribution terms, login required · accepted
- 2026-10-21 · Chordonomicon-derived tables allowed (M6) · CC BY-NC 4.0 → app stays non-commercial, credit in CREDITS.md · accepted
- 2026-10-21 · Vite + React + TS + Zustand · UI will be redesigned later; theory stays framework-free · accepted
