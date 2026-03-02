"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthRefreshRequestSchema = void 0;
const zod_1 = require("zod");
exports.AuthRefreshRequestSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(1)
});
//# sourceMappingURL=auth-refresh-request.schema.js.map