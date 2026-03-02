import { z } from 'zod';

export const AuthRegisterRequestSchema = z.object({
  login: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(8).max(128)
});
