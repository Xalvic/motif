# Motif

Pick a genre, get a theory-aware chord progression, see it on a keyboard, hear it with real instruments, get a melody starter, and export MIDI to FL Studio.

`prototype/chord-spark.html` is the working v0. Open it in a browser to see where this started.

## Getting started in Claude Code

1. Put this folder where you keep projects and run `git init && git add -A && git commit -m "spec bundle"`.
2. Open the folder in Claude Code (desktop).
3. First message:

   > Read CLAUDE.md, then the M0 section of docs/SPEC.md. Set up M0. Before writing code, tell me your plan in a few lines.

4. When you stop for the day, type `/wrap-up`. Next time, start with `/catch-up` (or just say what you want to do; the Status block in CLAUDE.md already tells Claude where you left off).

## How the memory works (and why it's cheap)

| File | Loaded at session start? | Purpose |
|---|---|---|
| `CLAUDE.md` | Yes, always (~1k tokens) | Project rules + a 4–5 line Status block |
| `.claude/rules/theory.md`, `audio.md` | Only when Claude opens matching files | Folder-specific rules |
| `.claude/skills/wrap-up`, `catch-up` | Only when you type the command | Session handoff routines |
| `docs/SPEC.md`, `THEORY.md`, `AUDIO.md` | No, read per milestone | The full spec |
| `docs/progress/LOG.md` | No, top entry on `/catch-up` | Session history |
| `docs/decisions.md` | No, on demand | Choices already made |

Claude Code also keeps its own auto memory per project (first 200 lines of its MEMORY.md load each session). It's complementary; the files above are the source of truth you can read and edit.

## Docs
- `docs/SPEC.md`: features, architecture, milestones M0–M7, backlog
- `docs/THEORY.md`: progression, voicing and melody rules, genre profiles, ragas
- `docs/AUDIO.md`: Tone.js + smplr engine, instrument map, MIDI export, licences
- `CREDITS.md`: sample and data licences
