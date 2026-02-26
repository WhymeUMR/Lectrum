"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const global_exception_filter_1 = require("./global-exception.filter");
const common_1 = require("@nestjs/common");
(0, node_test_1.describe)('GlobalExceptionFilter', () => {
    let filter;
    (0, node_test_1.test)('should format HttpException', () => {
        filter = new global_exception_filter_1.GlobalExceptionFilter();
        let jsonStatus;
        let jsonResponse;
        const mockResponse = {
            status: (code) => {
                jsonStatus = code;
                return {
                    json: (body) => {
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
        const exception = new common_1.BadRequestException('Bad thing happened');
        filter.catch(exception, mockHost);
        strict_1.default.strictEqual(jsonStatus, 400);
        strict_1.default.strictEqual(jsonResponse.statusCode, 400);
        strict_1.default.strictEqual(jsonResponse.message, 'Bad thing happened');
    });
    (0, node_test_1.test)('should catch Unknown errors as InternalServerError', () => {
        filter = new global_exception_filter_1.GlobalExceptionFilter();
        let jsonStatus;
        let jsonResponse;
        const mockResponse = {
            status: (code) => {
                jsonStatus = code;
                return {
                    json: (body) => {
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
        filter.catch(exception, mockHost);
        console.error = oldError;
        strict_1.default.strictEqual(jsonStatus, 500);
        strict_1.default.strictEqual(jsonResponse.statusCode, 500);
        strict_1.default.strictEqual(jsonResponse.message, 'Internal server error');
    });
});
//# sourceMappingURL=global-exception.filter.spec.js.map