"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateIngestionRequestSchema = void 0;
const contracts_1 = require("@lecture/contracts");
exports.CreateIngestionRequestSchema = contracts_1.IngestionJobSchema.pick({
    sourceType: true,
    sourceUrl: true,
    filename: true,
    mimeType: true,
    requestedLanguage: true,
    fileBase64: true
});
//# sourceMappingURL=create-ingestion-request.schema.js.map