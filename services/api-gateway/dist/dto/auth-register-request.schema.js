"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthRegisterRequestSchema = void 0;
const zod_1 = require("zod");
exports.AuthRegisterRequestSchema = zod_1.z.object({
    login: zod_1.z
        .string()
        .min(3)
        .max(64)
        .regex(/^[a-zA-Z0-9._-]+$/),
    password: zod_1.z
        .string()
        .min(8)
        .max(128)
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character')
});
//# sourceMappingURL=auth-register-request.schema.js.map