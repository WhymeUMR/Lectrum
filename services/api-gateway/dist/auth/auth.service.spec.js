"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_crypto_1 = require("node:crypto");
const auth_service_1 = require("./auth.service");
(0, node_test_1.describe)('AuthService', () => {
    const env = {
        AUTH_USER_LOGIN: 'admin',
        AUTH_USER_PASSWORD: 'secret',
        AUTH_ACCESS_TTL_SECONDS: 900,
        AUTH_REFRESH_TTL_SECONDS: 3600,
        AUTH_JWT_ISSUER: 'lecture-api',
        AUTH_JWT_AUDIENCE: 'lecture-client',
        AUTH_JWT_ACCESS_SECRET: 'a'.repeat(40),
        AUTH_JWT_REFRESH_SECRET: 'b'.repeat(40),
        AUTH_GOOGLE_CLIENT_ID: undefined,
        AUTH_TELEGRAM_BOT_TOKEN: 'telegram-bot-token',
        AUTH_TELEGRAM_BOT_USERNAME: 'my_bot'
    };
    function buildStore() {
        const users = new Map();
        const refresh = new Map();
        return {
            repo: {
                async createAuthUser(input) {
                    users.set(String(input.login || '').toLowerCase(), {
                        userId: input.userId,
                        login: String(input.login || '').toLowerCase(),
                        passwordHash: input.passwordHash,
                        role: input.role,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    });
                },
                async getAuthUserByLogin(login) {
                    return users.get(String(login || '').toLowerCase()) ?? null;
                },
                async getAuthUserByProvider(provider, providerUserId) {
                    for (const value of users.values()) {
                        if (value.provider === provider && value.providerUserId === providerUserId) {
                            return value;
                        }
                    }
                    return null;
                },
                async createRefreshSession(input) {
                    refresh.set(input.jti, {
                        jti: input.jti,
                        userSub: input.userSub,
                        login: input.login,
                        role: input.role,
                        expiresAt: input.expiresAt,
                        revokedAt: null,
                        createdAt: new Date().toISOString()
                    });
                },
                async getRefreshSession(jti) {
                    return refresh.get(jti) ?? null;
                },
                async revokeRefreshSession(jti) {
                    const current = refresh.get(jti);
                    if (current) {
                        current.revokedAt = new Date().toISOString();
                        refresh.set(jti, current);
                    }
                },
                async deleteExpiredRefreshSessions() { }
            }
        };
    }
    (0, node_test_1.test)('login -> refresh rotates refresh token and revokes old one', async () => {
        const store = buildStore();
        const service = new auth_service_1.AuthService(env, store);
        const first = await service.login('admin', 'secret');
        const second = await service.refresh(first.refreshToken);
        strict_1.default.ok(first.accessToken.length > 20);
        strict_1.default.ok(second.accessToken.length > 20);
        await strict_1.default.rejects(() => service.refresh(first.refreshToken));
    });
    (0, node_test_1.test)('logout revokes refresh token', async () => {
        const store = buildStore();
        const service = new auth_service_1.AuthService(env, store);
        const session = await service.login('admin', 'secret');
        await service.logout(session.refreshToken);
        await strict_1.default.rejects(() => service.refresh(session.refreshToken));
    });
    (0, node_test_1.test)('register creates user and allows login', async () => {
        const store = buildStore();
        const service = new auth_service_1.AuthService(env, store);
        const registered = await service.register('new.user', 'very-secure-password');
        strict_1.default.ok(registered.accessToken.length > 20);
        const logged = await service.login('new.user', 'very-secure-password');
        strict_1.default.ok(logged.accessToken.length > 20);
    });
    (0, node_test_1.test)('telegram login validates payload and reuses existing social user', async () => {
        const store = buildStore();
        const service = new auth_service_1.AuthService(env, store);
        const payload = {
            id: 777,
            username: 'tg_user',
            first_name: 'TG',
            auth_date: Math.floor(Date.now() / 1000)
        };
        const dataCheckString = Object.entries(payload)
            .map(([k, v]) => `${k}=${String(v)}`)
            .sort()
            .join('\n');
        const secret = (0, node_crypto_1.createHash)('sha256').update(env.AUTH_TELEGRAM_BOT_TOKEN).digest();
        payload.hash = (0, node_crypto_1.createHmac)('sha256', secret).update(dataCheckString).digest('hex');
        const first = await service.loginWithTelegram(payload);
        const second = await service.loginWithTelegram(payload);
        strict_1.default.ok(first.accessToken.length > 20);
        strict_1.default.ok(second.accessToken.length > 20);
    });
});
//# sourceMappingURL=auth.service.spec.js.map