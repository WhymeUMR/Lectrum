import { IngestionJobSchema } from '@lecture/contracts';

export const CreateIngestionRequestSchema = IngestionJobSchema.pick({
  sourceType: true,
  sourceUrl: true,
  filename: true,
  mimeType: true,
  requestedLanguage: true,
  fileBase64: true
});
