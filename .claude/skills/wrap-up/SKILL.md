---
name: wrap-up
description: End-of-session handoff. Updates the Status block in CLAUDE.md and adds a session entry to docs/progress/LOG.md.
disable-model-invocation: true
allowed-tools: Read Edit Bash(git status*) Bash(git log*) Bash(git diff*) Bash(git add*) Bash(git commit*)
---

Close this session so the next one starts with the right context and few tokens.

1. Gather facts, don't rely on memory alone: `git status --short`, `git log --oneline -15`, and what we did in this conversation.
2. Add a new entry at the TOP of the entries in `docs/progress/LOG.md` (just after `<!-- entries:start -->`). Max 15 lines:
   ```
   ## YYYY-MM-DD · <short title>
   - Milestone: <M#> <name> (<% or state>)
   - Done: <bullets, concrete: files/features>
   - Checked by ear: <only if audio changed>
   - Decisions: <one line each; also append to docs/decisions.md>
   - Open: <bugs, questions, half-done work with file names>
   - Next: <1–3 concrete first tasks for next session>
   ```
3. Replace (do not append to) the text between `<!-- status:start -->` and `<!-- status:end -->` in `CLAUDE.md`. Max 5 lines: Milestone, Last session (one line), Next (1–3 items), Blockers.
4. If `LOG.md` is over ~300 lines, move every entry except the newest 10 into `docs/progress/archive/<YYYY-MM>.md` (append, oldest at bottom).
5. If CLAUDE.md is over 100 lines, tell the user what could move into `docs/` instead of trimming it yourself.
6. Commit only these docs: `git add CLAUDE.md docs/progress docs/decisions.md && git commit -m "chore: session wrap-up $ARGUMENTS"`. If there is uncommitted code, list it and ask before committing it.
7. Reply with the new Status block and nothing else long.
