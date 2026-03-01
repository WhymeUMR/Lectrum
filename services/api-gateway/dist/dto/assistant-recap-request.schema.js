"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssistantRecapRequestSchema = void 0;
const zod_1 = require("zod");
exports.AssistantRecapRequestSchema = zod_1.z.object({
    jobId: zod_1.z.string().min(1),
    sessionId: zod_1.z.string().min(1).max(128),
    ttsModel: zod_1.z.string().min(1).max(128).optional(),
    ttsVoiceId: zod_1.z.string().min(1).max(128).optional()
});
//# sourceMappingURL=assistant-recap-request.schema.js.map