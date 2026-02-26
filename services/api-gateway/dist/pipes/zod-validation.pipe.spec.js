"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const zod_validation_pipe_1 = require("./zod-validation.pipe");
const zod_1 = require("zod");
const common_1 = require("@nestjs/common");
(0, node_test_1.describe)('ZodValidationPipe', () => {
    const schema = zod_1.z.object({
        name: zod_1.z.string().min(3)
    });
    const pipe = new zod_validation_pipe_1.ZodValidationPipe(schema);
    (0, node_test_1.test)('should pass validation for valid data', () => {
        const validData = { name: 'Lectures' };
        const result = pipe.transform(validData, { type: 'body' });
        strict_1.default.deepEqual(result, validData);
    });
    (0, node_test_1.test)('should throw BadRequestException for invalid data', () => {
        const invalidData = { name: 'Ab' };
        try {
            pipe.transform(invalidData, { type: 'body' });
            strict_1.default.fail('Should have thrown an error');
        }
        catch (e) {
            strict_1.default.ok(e instanceof common_1.BadRequestException);
            const response = e.getResponse();
            strict_1.default.strictEqual(response.message, 'Validation failed');
            strict_1.default.strictEqual(response.errors[0].path, 'name');
        }
    });
    (0, node_test_1.test)('should skip validation if type is custom', () => {
        const data = { unknown: true };
        const result = pipe.transform(data, { type: 'custom' });
        strict_1.default.deepEqual(result, data);
    });
});
//# sourceMappingURL=zod-validation.pipe.spec.js.map