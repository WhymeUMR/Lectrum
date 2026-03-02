"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Public = exports.IS_PUBLIC_ROUTE = void 0;
const common_1 = require("@nestjs/common");
exports.IS_PUBLIC_ROUTE = 'isPublicRoute';
const Public = () => (0, common_1.SetMetadata)(exports.IS_PUBLIC_ROUTE, true);
exports.Public = Public;
//# sourceMappingURL=public.decorator.js.map