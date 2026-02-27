"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenerateFlashcardsByJobRequestSchema = void 0;
const zod_1 = require("zod");
const generate_flashcards_request_schema_1 = require("./generate-flashcards-request.schema");
exports.GenerateFlashcardsByJobRequestSchema = generate_flashcards_request_schema_1.GenerateFlashcardsRequestSchema.extend({
    jobId: zod_1.z.string().min(1)
});
//# sourceMappingURL=generate-flashcards-by-job-request.schema.js.map