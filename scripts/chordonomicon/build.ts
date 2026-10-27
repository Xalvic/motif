/**
 * Builds src/theory/data/transitions/<genre>.json from the Chordonomicon CSV (THEORY §7).
 *
 *   node scripts/chordonomicon/build.ts [path/to/chordonomicon_v2.csv]
 *
 * Download chordonomicon_v2.csv from huggingface.co/datasets/ailsntua/Chordonomicon into
 * scripts/chordonomicon/data/ (gitignored). Prints a sanity report: pop major should show
 * I V vi IV near the top, or key estimation is broken.
 */
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Family } from './key.ts';
import { addSong, pruneFamily, topFourGrams, type Counts } from './tables.ts';

/** App genre → Chordonomicon `main_genre` values and the families it uses (decisions.md). */
const GENRES: Record<string, { sources: string[]; families: Family[] }> = {
  pop: { sources: ['pop'], families: ['major', 'minor'] },
  metal: { sources: ['metal'], families: ['minor'] },
  lofi: { sources: ['jazz', 'soul'], families: ['major', 'minor'] },
};

const here = dirname(fileURLToPath(import.meta.url));
const csv = process.argv[2] ?? join(here, 'data', 'chordonomicon_v2.csv');
const outDir = join(here, '..', '..', 'src', 'theory', 'data', 'transitions');

const bySource = new Map<string, string>();
for (const [genre, g] of Object.entries(GENRES)) for (const s of g.sources) bySource.set(s, genre);

const counts: Record<string, Counts> = Object.fromEntries(Object.keys(GENRES).map((g) => [g, {}]));

let header = true;
const lines = createInterface({ input: createReadStream(csv) });
for await (const line of lines) {
  if (header) {
    header = false;
    continue;
  }
  // Columns: id,chords,release_date,genres,decade,rock_genre,artist_id,main_genre,...
  // Only `chords` and `main_genre` matter, and neither contains a comma.
  const cols = line.split(',');
  const genre = bySource.get(cols[cols.length - 3] ?? '');
  if (!genre || !cols[1]) continue;
  addSong(counts[genre]!, cols[1], GENRES[genre]!.families);
}

mkdirSync(outDir, { recursive: true });
const generatedAt = new Date().toISOString().slice(0, 10);
for (const [genre, byFamily] of Object.entries(counts)) {
  const file = {
    source:
      'Chordonomicon (Kantarelis et al., 2024), huggingface.co/datasets/ailsntua/Chordonomicon',
    licence: 'CC BY-NC 4.0',
    genres: GENRES[genre]!.sources,
    songs: {} as Partial<Record<Family, number>>,
    generatedAt,
    start: {} as Record<string, unknown>,
    transitions: {} as Record<string, unknown>,
  };
  console.log(`\n== ${genre} (${GENRES[genre]!.sources.join(' + ')})`);
  for (const family of GENRES[genre]!.families) {
    const fc = byFamily[family];
    if (!fc) continue;
    const { start, transitions } = pruneFamily(fc);
    file.songs[family] = fc.songs;
    file.start[family] = start;
    file.transitions[family] = transitions;
    console.log(`-- ${family}: ${fc.songs} songs, ${Object.keys(transitions).length} states`);
    for (const [gram, share] of topFourGrams(fc)) {
      console.log(`   ${(share * 100).toFixed(2).padStart(5)} %  ${gram}`);
    }
  }
  const text = JSON.stringify(file, null, 2) + '\n';
  writeFileSync(join(outDir, `${genre}.json`), text);
  console.log(`   wrote ${genre}.json, ${(text.length / 1024).toFixed(1)} KB`);
}
