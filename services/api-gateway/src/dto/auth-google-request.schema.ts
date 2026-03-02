import { z } from 'zod';

export const AuthGoogleRequestSchema = z.object({
  idToken: z.string().min(1)
});
