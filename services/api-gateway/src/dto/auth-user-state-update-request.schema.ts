import { z } from 'zod';

const nullableString = z.union([z.string(), z.null()]).optional();

export const AuthUserStateUpdateRequestSchema = z.object({
  lastJobId: nullableString,
  assistantSessionId: nullableString
});
