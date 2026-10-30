import { z } from 'zod';

/** `GET /api/me`. Needs an invite code; replies with the name the code belongs to. */
export const MeResponse = z.object({
  name: z.string(),
});
export type MeResponse = z.infer<typeof MeResponse>;
