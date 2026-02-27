"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
let GlobalExceptionFilter = class GlobalExceptionFilter {
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        if (exception instanceof common_1.HttpException) {
            const status = exception.getStatus();
            const res = exception.getResponse();
            return response.status(status).json({
                statusCode: status,
                ...(typeof res === 'object' && res !== null ? res : { message: res })
            });
        }
        if (this.isPayloadTooLarge(exception)) {
            return response.status(common_1.HttpStatus.PAYLOAD_TOO_LARGE).json({
                statusCode: common_1.HttpStatus.PAYLOAD_TOO_LARGE,
                message: 'Payload too large'
            });
        }
        console.error('Unhandled Exception:', exception);
        return response.status(common_1.HttpStatus.INTERNAL_SERVER_ERROR).json({
            statusCode: common_1.HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'Internal server error'
        });
    }
    isPayloadTooLarge(exception) {
        if (!exception || typeof exception !== 'object') {
            return false;
        }
        const candidate = exception;
        return (candidate.type === 'entity.too.large' ||
            candidate.name === 'PayloadTooLargeError' ||
            candidate.code === 'LIMIT_FILE_SIZE');
    }
};
exports.GlobalExceptionFilter = GlobalExceptionFilter;
exports.GlobalExceptionFilter = GlobalExceptionFilter = __decorate([
    (0, common_1.Catch)()
], GlobalExceptionFilter);
//# sourceMappingURL=global-exception.filter.js.map