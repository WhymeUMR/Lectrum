"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthUserStateUpdateRequestSchema = void 0;
const zod_1 = require("zod");
const nullableString = zod_1.z.union([zod_1.z.string(), zod_1.z.null()]).optional();
exports.AuthUserStateUpdateRequestSchema = zod_1.z.object({
    lastJobId: nullableString,
    assistantSessionId: nullableString
});
//# sourceMappingURL=auth-user-state-update-request.schema.js.map