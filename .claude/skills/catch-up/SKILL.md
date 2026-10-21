---
name: catch-up
description: Start-of-session briefing. Reads the latest log entry, recent commits and the current milestone section of the spec.
disable-model-invocation: true
allowed-tools: Read Grep Bash(git log*) Bash(git status*)
---

Get up to speed cheaply. Read only what is listed here.

1. The newest entry in `docs/progress/LOG.md` (stop at the second `## ` heading).
2. `git log --oneline -10` and `git status --short`.
3. In `docs/SPEC.md`, only the section for the milestone named in the CLAUDE.md Status block (Grep for `### M<n>`, read that section).
4. If the next task touches theory or audio, skim the matching section of `docs/THEORY.md` or `docs/AUDIO.md` named in that milestone. Nothing else.

Then reply in under 10 lines: where we are, what's next, anything risky. Ask "Shall I start on <first task>?" $ARGUMENTS
