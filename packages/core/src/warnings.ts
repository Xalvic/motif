/**
 * Warnings from the idea edits (search, setChord, checkTempo). The code is for tests and
 * callers; the message is plain English for a person or a model.
 */
export type WarningCode =
  | 'constraints-not-met'
  | 'ending-locked'
  | 'locks-kept-key'
  | 'locks-dropped'
  | 'borrowed-chord'
  | 'cadence-broken'
  | 'same-chord'
  | 'tempo-outside-genre';

export interface Warning {
  code: WarningCode;
  message: string;
}
