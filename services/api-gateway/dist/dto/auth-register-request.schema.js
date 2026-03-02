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
    password: zod_1.z.string().min(8).max(128)
});
//# sourceMappingURL=auth-register-request.schema.js.map