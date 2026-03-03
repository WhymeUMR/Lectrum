"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const zod_validation_pipe_1 = require("../pipes/zod-validation.pipe");
const auth_login_request_schema_1 = require("../dto/auth-login-request.schema");
const auth_refresh_request_schema_1 = require("../dto/auth-refresh-request.schema");
const auth_register_request_schema_1 = require("../dto/auth-register-request.schema");
const auth_user_state_update_request_schema_1 = require("../dto/auth-user-state-update-request.schema");
const auth_google_request_schema_1 = require("../dto/auth-google-request.schema");
const auth_telegram_request_schema_1 = require("../dto/auth-telegram-request.schema");
const auth_change_password_request_schema_1 = require("../dto/auth-change-password-request.schema");
const auth_service_1 = require("../auth/auth.service");
const public_decorator_1 = require("../auth/public.decorator");
let AuthController = class AuthController {
    constructor(authService) {
        this.authService = authService;
    }
    async register(body) {
        return this.authService.register(body.login, body.password);
    }
    async login(body) {
        return this.authService.login(body.login, body.password);
    }
    async loginWithGoogle(body) {
        return this.authService.loginWithGoogle(body.idToken);
    }
    async loginWithTelegram(body) {
        return this.authService.loginWithTelegram(body);
    }
    async refresh(body) {
        return this.authService.refresh(body.refreshToken);
    }
    async logout(body) {
        await this.authService.logout(body.refreshToken);
        return { success: true };
    }
    async changePassword(request, body) {
        if (!request.user) {
            throw new common_1.UnauthorizedException('Not authenticated');
        }
        await this.authService.changePassword(request.user, body.currentPassword, body.newPassword);
        return { success: true };
    }
    me(request) {
        if (!request.user) {
            throw new common_1.UnauthorizedException('Not authenticated');
        }
        return { user: request.user };
    }
    async getState(request) {
        if (!request.user) {
            throw new common_1.UnauthorizedException('Not authenticated');
        }
        return this.authService.getUserState(request.user);
    }
    async setState(request, body) {
        if (!request.user) {
            throw new common_1.UnauthorizedException('Not authenticated');
        }
        return this.authService.setUserState(request.user, body);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('/register'),
    __param(0, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(auth_register_request_schema_1.AuthRegisterRequestSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "register", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('/login'),
    __param(0, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(auth_login_request_schema_1.AuthLoginRequestSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('/google'),
    __param(0, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(auth_google_request_schema_1.AuthGoogleRequestSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "loginWithGoogle", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('/telegram'),
    __param(0, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(auth_telegram_request_schema_1.AuthTelegramRequestSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "loginWithTelegram", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('/refresh'),
    __param(0, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(auth_refresh_request_schema_1.AuthRefreshRequestSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('/logout'),
    __param(0, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(auth_refresh_request_schema_1.AuthRefreshRequestSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.Post)('/change-password'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(auth_change_password_request_schema_1.AuthChangePasswordRequestSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "changePassword", null);
__decorate([
    (0, common_1.Get)('/me'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "me", null);
__decorate([
    (0, common_1.Get)('/state'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "getState", null);
__decorate([
    (0, common_1.Post)('/state'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(auth_user_state_update_request_schema_1.AuthUserStateUpdateRequestSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "setState", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('/api/v1/auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map