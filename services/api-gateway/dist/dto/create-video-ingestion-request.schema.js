"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateVideoIngestionRequestSchema = void 0;
const zod_1 = require("zod");
exports.CreateVideoIngestionRequestSchema = zod_1.z.object({
    sourceUrl: zod_1.z.string().url(),
    requestedLanguage: zod_1.z.string().min(1).optional()
});
//# sourceMappingURL=create-video-ingestion-request.schema.js.map