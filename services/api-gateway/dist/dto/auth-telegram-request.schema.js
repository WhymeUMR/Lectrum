"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthTelegramRequestSchema = void 0;
const zod_1 = require("zod");
exports.AuthTelegramRequestSchema = zod_1.z.object({
    id: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]),
    first_name: zod_1.z.string().optional(),
    last_name: zod_1.z.string().optional(),
    username: zod_1.z.string().optional(),
    photo_url: zod_1.z.string().optional(),
    auth_date: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]),
    hash: zod_1.z.string().min(1)
});
//# sourceMappingURL=auth-telegram-request.schema.js.map