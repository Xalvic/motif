# Credits

Motif is a personal, non-commercial project.

## Samples
- **Splendid Grand Piano** (Steinway), public domain, via [smplr](https://github.com/danigb/smplr)
- **Greg Sullivan E-Pianos**, CC BY 3.0, via smplr ElectricPiano
- **MusyngKite** soundfont, CC BY-SA 3.0, and **FluidR3_GM**, CC BY 3.0, pre-rendered by Benjamin Gleitzman (midi-js-soundfonts), via smplr Soundfont
- **Versilian Community Sample Library**, CC0, via smplr Mallet / Versilian
- Drum machines via smplr DrumMachine, hosted at [smpldsnds/drum-machines](https://github.com/smpldsnds/drum-machines). The repository calls itself "a collection of public domain samples" but has no LICENSE file and no per-machine credits (checked 2026-10-22).
  - **TR-808**: recorded by Michael Fischer (Technopolis) from a Roland TR-808, 1994. His original `TR808.TXT` calls the set "absolutely free"; it names no formal licence.
  - **LM-2**: source and author unknown; no licence text beyond the repository line above. Used as a placeholder kit only.

## Libraries
Tone.js (MIT), smplr (MIT), tonal (MIT), @tonejs/midi (MIT)

## Data
- Chordonomicon dataset, CC BY-NC 4.0: Kantarelis et al., "CHORDONOMICON: A Dataset of 666,000 Songs and their Chord Progressions", 2024. huggingface.co/datasets/ailsntua/Chordonomicon. The transition tables in `packages/core/src/theory/data/transitions/` (pop, metal, lo-fi) are derived from it by `packages/core/scripts/chordonomicon/build.ts`. Because of the NC licence, the app stays non-commercial.
