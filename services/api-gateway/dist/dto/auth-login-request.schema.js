"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthLoginRequestSchema = void 0;
const zod_1 = require("zod");
exports.AuthLoginRequestSchema = zod_1.z.object({
    login: zod_1.z.string().min(1),
    password: zod_1.z.string().min(1)
});
//# sourceMappingURL=auth-login-request.schema.js.map