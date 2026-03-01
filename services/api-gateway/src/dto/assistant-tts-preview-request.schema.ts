import { z } from 'zod';

export const AssistantTtsPreviewRequestSchema = z.object({
  ttsVoiceId: z.string().min(1).max(128),
  ttsModel: z.string().min(1).max(128).optional(),
  text: z.string().min(1).max(500).optional()
});

