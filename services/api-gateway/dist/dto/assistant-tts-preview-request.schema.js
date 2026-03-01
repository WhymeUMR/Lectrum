"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssistantTtsPreviewRequestSchema = void 0;
const zod_1 = require("zod");
exports.AssistantTtsPreviewRequestSchema = zod_1.z.object({
    ttsVoiceId: zod_1.z.string().min(1).max(128),
    ttsModel: zod_1.z.string().min(1).max(128).optional(),
    text: zod_1.z.string().min(1).max(500).optional()
});
//# sourceMappingURL=assistant-tts-preview-request.schema.js.map