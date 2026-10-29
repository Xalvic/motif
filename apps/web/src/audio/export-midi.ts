/**
 * MIDI export (AUDIO.md §7.1). Pure: no Tone, no audio context. The notes come from the same
 * comping, drum and melody code the bar pump plays, one pass of the idea, on the grid (no swing,
 * no humanize), so they match the keyboard view and FL Studio can quantise or swing them itself.
 */
import { Midi } from '@tonejs/midi';
import { parseMidi, writeMidi } from 'midi-file';
import { Key } from 'tonal';
import { keyName, melodyInBar, type Idea } from '@motif/core/idea';
import type { GenreId } from '../state/store';
import { familyOf } from '@motif/core/theory/keys';
import { pitchClassName } from '@motif/core/theory/pitch';
import { blockBar, compBar, type BarNote } from './comping';
import { drumBar, type DrumHit } from './drums';
import { genreAudio } from './genres';
import type { InstrumentSpec } from './instruments';

export interface ExportSettings {
  genre: GenreId;
  bpm: number;
  colour: 0 | 1 | 2;
  /** Held block chords instead of the genre's comping pattern (the Block chords toggle). */
  block: boolean;
}

/** Track order and names, as FL Studio shows them. */
export const TRACKS = ['Chords (RH)', 'Bass (LH)', 'Melody', 'Drums'] as const;

const PPQ = 480;
const DRUM_CHANNEL = 9;

/** General MIDI program numbers, 0-based (AUDIO.md §7.1). */
const GM_SOUNDFONT: Record<string, number> = {
  acoustic_guitar_steel: 25,
  overdriven_guitar: 29,
  distortion_guitar: 30,
  acoustic_bass: 32,
  electric_bass_finger: 33,
  electric_bass_pick: 34,
  synth_bass_1: 38,
  violin: 40,
  contrabass: 43,
  string_ensemble_1: 48,
  choir_aahs: 52,
  french_horn: 60,
  flute: 73,
  pad_2_warm: 89,
  bagpipe: 109,
  fiddle: 110,
};

export function gmProgram(spec: InstrumentSpec | undefined): number {
  switch (spec?.kind) {
    case 'epiano':
      return 4;
    case 'mallet':
      return 11;
    case 'soundfont':
      return GM_SOUNDFONT[spec.name] ?? 0;
    default:
      return 0;
  }
}

/** GM drum notes on channel 10. */
const GM_DRUMS: Record<DrumHit, number> = {
  kick: 36,
  snare: 38,
  hihat: 42,
  tom: 47,
  crash: 49,
};

/** Every note of one pass, beats from the idea start, per track. */
export function exportNotes(idea: Idea, settings: ExportSettings): BarNote[][] {
  const profile = genreAudio(settings.genre);
  const bars = idea.tokens.length;
  const tracks: BarNote[][] = TRACKS.map(() => []);
  const at = (bar: number) => (n: BarNote) => ({ ...n, beat: n.beat + bar * 4 });

  for (let bar = 0; bar < bars; bar++) {
    const voicing = idea.voicings[bar]!;
    const comp = settings.block ? blockBar(voicing) : compBar(profile.comp, voicing);
    for (const n of comp.map(at(bar))) tracks[n.layer === 'bass' ? 1 : 0]!.push(n);
    for (const n of melodyInBar(idea, bar)) {
      tracks[2]!.push({
        layer: 'melody',
        note: n.midi,
        beat: n.start,
        beats: n.dur,
        velocity: n.vel,
      });
    }
    if (profile.drums) {
      tracks[3]!.push(
        ...drumBar(profile.drums, { bar, bars, colour: settings.colour }).map(at(bar)),
      );
    }
  }
  return tracks;
}

/** Sharps (+) or flats (−) in the key signature: the tonic's major or minor key. */
export function keySignature(idea: Pick<Idea, 'tonic' | 'mode' | 'flats'>): {
  sharps: number;
  minor: boolean;
} {
  const tonic = pitchClassName(idea.tonic, idea.flats).replace('♭', 'b').replace('♯', '#');
  const minor = familyOf(idea.mode) === 'minor';
  return { sharps: minor ? Key.minorKey(tonic).alteration : Key.majorKey(tonic).alteration, minor };
}

/** The .mid file: four named tracks, tempo, 4/4, key signature. */
export function exportMidi(idea: Idea, settings: ExportSettings): Uint8Array<ArrayBuffer> {
  const profile = genreAudio(settings.genre);
  const midi = new Midi();
  midi.header.setTempo(settings.bpm);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
  // @tonejs/midi 2.0.28 writes the key wrong; the value is set below with midi-file.
  midi.header.keySignatures.push({ ticks: 0, key: 'C', scale: 'major' });
  midi.header.name = `Motif ${keyName(idea)}`;

  const programs = [
    gmProgram(profile.layers.chords?.spec),
    gmProgram(profile.layers.bass?.spec),
    gmProgram(profile.layers.melody?.spec),
    0,
  ];
  exportNotes(idea, settings).forEach((notes, i) => {
    const track = midi.addTrack();
    track.name = TRACKS[i]!;
    track.channel = i === 3 ? DRUM_CHANNEL : i;
    track.instrument.number = programs[i]!;
    for (const n of notes) {
      const midiNote = typeof n.note === 'number' ? n.note : GM_DRUMS[n.note as DrumHit];
      track.addNote({
        midi: midiNote,
        ticks: Math.round(n.beat * PPQ),
        durationTicks: Math.max(1, Math.round(n.beats * PPQ)),
        velocity: n.velocity / 127,
      });
    }
  });

  const file = parseMidi(midi.toArray());
  const { sharps, minor } = keySignature(idea);
  for (const event of file.tracks.flat()) {
    if (event.type === 'keySignature') {
      event.key = sharps;
      event.scale = minor ? 1 : 0;
    }
  }
  return new Uint8Array(writeMidi(file));
}

/** `motif_<genre>_<key>_<bpm>bpm_<seed>.mid`, for example motif_pop_Bb-minor_96bpm_123.mid. */
export function midiFileName(idea: Idea, genre: GenreId, bpm: number): string {
  const key = keyName(idea).replace(/♭/g, 'b').replace(/♯/g, '#').replace(/ /g, '-');
  return `motif_${genre}_${key}_${bpm}bpm_${idea.seed}.mid`;
}
