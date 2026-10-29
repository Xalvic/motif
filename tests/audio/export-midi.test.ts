import { Midi } from '@tonejs/midi';
import { describe, expect, it } from 'vitest';
import {
  exportMidi,
  gmProgram,
  keySignature,
  midiFileName,
  TRACKS,
  type ExportSettings,
} from '../../src/audio/export-midi';
import { genreAudio } from '../../src/audio/genres';
import { generateIdea, type Idea } from '../../src/state/idea';
import { GENRE_IDS, type GenreId } from '../../src/theory/genres';

const PPQ = 480;

function make(genre: GenreId, seed = 7, block = false) {
  const { idea, bpm } = generateIdea({ genre, key: 'random', bars: 4, colour: 1 }, seed);
  const settings: ExportSettings = { genre, bpm, colour: 1, block };
  return { idea, settings, midi: new Midi(exportMidi(idea, settings)) };
}

/** Pitches of a track that start in a bar. */
const inBar = (midi: Midi, track: number, bar: number) =>
  midi.tracks[track]!.notes.filter((n) => Math.floor(n.ticks / (4 * PPQ)) === bar).map(
    (n) => n.midi,
  );

describe('MIDI export', () => {
  it('has four named tracks, the tempo and 4/4 in every genre', () => {
    for (const genre of GENRE_IDS) {
      const { settings, midi } = make(genre);
      expect(midi.tracks.map((t) => t.name)).toEqual([...TRACKS]);
      expect(midi.header.tempos[0]!.bpm).toBeCloseTo(settings.bpm, 3);
      expect(midi.header.timeSignatures[0]!.timeSignature).toEqual([4, 4]);
      expect(midi.header.ppq).toBe(PPQ);
    }
  });

  it('puts drums on channel 10 with GM notes, and only for genres with drums', () => {
    for (const genre of GENRE_IDS) {
      const { midi } = make(genre);
      const drums = midi.tracks[3]!;
      // An empty track (classical) has no event to read a channel from.
      if (genreAudio(genre).drums) {
        expect(drums.notes.length).toBeGreaterThan(0);
        expect(drums.channel).toBe(9);
        expect(drums.instrument.percussion).toBe(true);
      } else {
        expect(drums.notes).toHaveLength(0);
      }
      for (const n of drums.notes) expect([36, 38, 42, 47, 49]).toContain(n.midi);
    }
  });

  it('gives each track the genre instrument (GM program)', () => {
    const { midi } = make('lofi');
    expect(midi.tracks.slice(0, 3).map((t) => t.instrument.number)).toEqual([4, 33, 11]);
    expect(make('irish').midi.tracks[2]!.instrument.number).toBe(110);
    expect(gmProgram({ kind: 'piano' })).toBe(0);
  });

  it('plays the keyboard view: block chords give the voicing per bar', () => {
    for (const genre of GENRE_IDS) {
      const { idea, midi } = make(genre, 11, true);
      idea.voicings.forEach((v, bar) => {
        expect(inBar(midi, 0, bar).sort(), `${genre} bar ${bar + 1}`).toEqual([...v.upper].sort());
        expect(inBar(midi, 1, bar), `${genre} bar ${bar + 1}`).toEqual([v.bass]);
      });
    }
  });

  it('keeps comped notes inside the voicing (an octave up for arpeggios)', () => {
    for (const genre of GENRE_IDS) {
      const { idea, midi } = make(genre, 3);
      idea.voicings.forEach((v, bar) => {
        const pcs = new Set([v.bass, ...v.upper].map((m) => m % 12));
        // Strum and chug add the 5th above the bass.
        pcs.add((v.bass + 7) % 12);
        for (const m of [...inBar(midi, 0, bar), ...inBar(midi, 1, bar)]) {
          expect(pcs.has(m % 12), `${genre} bar ${bar + 1}: ${m}`).toBe(true);
        }
      });
    }
  });

  it('writes the melody exactly: pitch, start, length', () => {
    const { idea, midi } = make('pop', 5);
    const notes = midi.tracks[2]!.notes;
    expect(notes.map((n) => n.midi)).toEqual(idea.melody.map((n) => n.midi));
    expect(notes.map((n) => n.ticks)).toEqual(idea.melody.map((n) => Math.round(n.start * PPQ)));
    expect(notes.map((n) => n.durationTicks)).toEqual(
      idea.melody.map((n) => Math.round(n.dur * PPQ)),
    );
  });

  it('ends inside the idea: nothing past the last bar', () => {
    for (const genre of GENRE_IDS) {
      const { idea, midi } = make(genre);
      const end = idea.tokens.length * 4 * PPQ;
      for (const t of midi.tracks)
        for (const n of t.notes) {
          expect(n.ticks + n.durationTicks).toBeLessThanOrEqual(end);
        }
    }
  });

  it('writes the key signature (FL Studio reads it back)', () => {
    const { idea, midi } = make('pop', 5);
    const sig = midi.header.keySignatures[0]!;
    const { sharps, minor } = keySignature(idea);
    expect(sig.scale).toBe(minor ? 'minor' : 'major');
    const KEYS = [
      'Cb',
      'Gb',
      'Db',
      'Ab',
      'Eb',
      'Bb',
      'F',
      'C',
      'G',
      'D',
      'A',
      'E',
      'B',
      'F#',
      'C#',
    ];
    expect(sig.key).toBe(KEYS[sharps + 7]);
  });

  it('counts sharps and flats from the tonic and family', () => {
    const key = (tonic: number, mode: Idea['mode'], flats = false) =>
      keySignature({ tonic, mode, flats });
    expect(key(0, 'major')).toEqual({ sharps: 0, minor: false });
    expect(key(10, 'minor', true)).toEqual({ sharps: -5, minor: true });
    expect(key(4, 'major')).toEqual({ sharps: 4, minor: false });
    expect(key(2, 'dorian')).toEqual({ sharps: -1, minor: true });
    expect(key(3, 'minor', false)).toEqual({ sharps: 6, minor: true });
  });

  it('names the file motif_<genre>_<key>_<bpm>bpm_<seed>.mid', () => {
    const { idea } = make('pop', 5);
    const name = midiFileName(
      { ...idea, tonic: 10, mode: 'minor', flats: true, seed: 42 },
      'pop',
      96,
    );
    expect(name).toBe('motif_pop_Bb-minor_96bpm_42.mid');
  });
});
