"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenerateFlashcardsRequestSchema = void 0;
const zod_1 = require("zod");
exports.GenerateFlashcardsRequestSchema = zod_1.z.object({
    count: zod_1.z.coerce.number().int().min(1).max(10).default(5)
});
//# sourceMappingURL=generate-flashcards-request.schema.js.map