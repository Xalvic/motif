---
paths:
  - "apps/web/src/audio/**"
---

# Audio code rules

- Design is in `docs/AUDIO.md`. The bar pump (§3.2) is the only scheduler.
- Note times come from the transport callback's `time`. No setTimeout/setInterval for sound.
- UI updates from audio go through `Tone.getDraw().schedule(fn, time)`.
- Instruments load lazily per genre through `instruments.ts`; never construct a smplr instrument elsewhere.
- Any new sample source: add it to `CREDITS.md` with its licence before committing.
- Dispose Tone nodes you create when a genre or idea is torn down.
- There are no automated sound tests: after audio changes, list what you checked by ear in the session log.
