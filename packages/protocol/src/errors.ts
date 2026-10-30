import { z } from 'zod';

/** Every error reply from the API has this shape. The message is for people, the code for code. */
export const ApiErrorCode = z.enum(['missing_code', 'invalid_code', 'not_found', 'internal']);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export const ApiError = z.object({
  error: z.object({
    code: ApiErrorCode,
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;
