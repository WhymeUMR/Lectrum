"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateUrlIngestionRequestSchema = void 0;
const zod_1 = require("zod");
exports.CreateUrlIngestionRequestSchema = zod_1.z.object({
    sourceUrl: zod_1.z.string().url(),
    requestedLanguage: zod_1.z.string().min(1).optional()
});
//# sourceMappingURL=create-url-ingestion-request.schema.js.map