import { z } from 'zod';

export const AssistantAskRequestSchema = z.object({
  jobId: z.string().min(1),
  sessionId: z.string().min(1).max(128),
  question: z.string().min(3).max(2000)
});

