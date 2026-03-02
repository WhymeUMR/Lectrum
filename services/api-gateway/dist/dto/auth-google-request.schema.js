"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthGoogleRequestSchema = void 0;
const zod_1 = require("zod");
exports.AuthGoogleRequestSchema = zod_1.z.object({
    idToken: zod_1.z.string().min(1)
});
//# sourceMappingURL=auth-google-request.schema.js.map