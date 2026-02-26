import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ZodValidationPipe } from './zod-validation.pipe';
import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';

describe('ZodValidationPipe', () => {
    const schema = z.object({
        name: z.string().min(3)
    });
    const pipe = new ZodValidationPipe(schema);

    test('should pass validation for valid data', () => {
        const validData = { name: 'Lectures' };
        const result = pipe.transform(validData, { type: 'body' } as any);
        assert.deepEqual(result, validData);
    });

    test('should throw BadRequestException for invalid data', () => {
        const invalidData = { name: 'Ab' };
        try {
            pipe.transform(invalidData, { type: 'body' } as any);
            assert.fail('Should have thrown an error');
        } catch (e) {
            assert.ok(e instanceof BadRequestException);
            const response = e.getResponse() as any;
            assert.strictEqual(response.message, 'Validation failed');
            assert.strictEqual(response.errors[0].path, 'name');
        }
    });

    test('should skip validation if type is custom', () => {
        const data = { unknown: true };
        const result = pipe.transform(data, { type: 'custom' } as any);
        assert.deepEqual(result, data);
    });
});
