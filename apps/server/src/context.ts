import type { ApiErrorCode } from '@motif/protocol/errors';

/** Values that middleware puts on the Hono context for later middleware and the log line. */
export interface AppEnv {
  Variables: {
    requestId: string;
    /** Set by `requireInvite` when the code is good. */
    codeName?: string;
    /** Set by `requireInvite` when it says no. */
    authFailure?: ApiErrorCode;
  };
}
