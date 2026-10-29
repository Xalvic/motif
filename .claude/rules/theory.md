---
paths:
  - "packages/core/src/**"
  - "packages/core/tests/**"
---

# Theory code rules

- Pure functions only. No DOM, no audio, no `Date.now()`, no `Math.random()`. Take `rng` as a parameter.
- Rules and numbers come from `docs/THEORY.md`. If you change a rule, update that doc in the same commit.
- Roman tokens follow THEORY §2.1. Use tonal only for note spelling and intervals.
- Every new generator rule gets a property test against THEORY §8 invariants.
- Golden-seed snapshots in `packages/core/tests/theory/golden/`: if they change, say so in the commit message and why.
- Genre data lives in `packages/core/src/theory/data/` and is validated at load (zod or a hand-written validator).
