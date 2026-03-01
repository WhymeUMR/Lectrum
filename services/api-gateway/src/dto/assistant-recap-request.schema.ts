import { z } from 'zod';

export const AssistantRecapRequestSchema = z.object({
  jobId: z.string().min(1),
  sessionId: z.string().min(1).max(128),
  ttsModel: z.string().min(1).max(128).optional(),
  ttsVoiceId: z.string().min(1).max(128).optional()
});
