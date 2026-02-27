import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GlobalExceptionFilter } from './global-exception.filter';
import { BadRequestException } from '@nestjs/common';

describe('GlobalExceptionFilter', () => {
    let filter: GlobalExceptionFilter;

    test('should format HttpException', () => {
        filter = new GlobalExceptionFilter();
        let jsonStatus: number | undefined;
        let jsonResponse: any;

        const mockResponse = {
            status: (code: number) => {
                jsonStatus = code;
                return {
                    json: (body: any) => {
                        jsonResponse = body;
                    }
                };
            }
        };

        const mockHost = {
            switchToHttp: () => ({
                getResponse: () => mockResponse
            })
        };

        const exception = new BadRequestException('Bad thing happened');
        filter.catch(exception, mockHost as any);

        assert.strictEqual(jsonStatus, 400);
        assert.strictEqual(jsonResponse.statusCode, 400);
        assert.strictEqual(jsonResponse.message, 'Bad thing happened');
    });

    test('should catch Unknown errors as InternalServerError', () => {
        filter = new GlobalExceptionFilter();
        let jsonStatus: number | undefined;
        let jsonResponse: any;

        const mockResponse = {
            status: (code: number) => {
                jsonStatus = code;
                return {
                    json: (body: any) => {
                        jsonResponse = body;
                    }
                };
            }
        };

        const mockHost = {
            switchToHttp: () => ({
                getResponse: () => mockResponse
            })
        };

        const exception = new Error('Unknown crash');

        // suppress console.error for this test
        const oldError = console.error;
        console.error = () => { };
        filter.catch(exception, mockHost as any);
        console.error = oldError;

        assert.strictEqual(jsonStatus, 500);
        assert.strictEqual(jsonResponse.statusCode, 500);
        assert.strictEqual(jsonResponse.message, 'Internal server error');
    });
});
