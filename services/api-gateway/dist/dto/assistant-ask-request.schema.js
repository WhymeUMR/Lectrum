"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssistantAskRequestSchema = void 0;
const zod_1 = require("zod");
exports.AssistantAskRequestSchema = zod_1.z.object({
    jobId: zod_1.z.string().min(1),
    sessionId: zod_1.z.string().min(1).max(128),
    question: zod_1.z.string().min(3).max(2000)
});
//# sourceMappingURL=assistant-ask-request.schema.js.map