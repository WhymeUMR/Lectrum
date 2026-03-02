import { z } from 'zod';

export const AuthRefreshRequestSchema = z.object({
  refreshToken: z.string().min(1)
});
