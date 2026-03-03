"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthChangePasswordRequestSchema = void 0;
const zod_1 = require("zod");
const strongPasswordSchema = zod_1.z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character');
exports.AuthChangePasswordRequestSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1),
    newPassword: strongPasswordSchema
});
//# sourceMappingURL=auth-change-password-request.schema.js.map