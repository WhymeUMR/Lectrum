"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const config_1 = require("@lecture/config");
const job_store_service_1 = require("../services/job-store.service");
let AuthService = class AuthService {
    constructor(env, store) {
        this.env = env;
        this.store = store;
    }
    async register(login, password) {
        await this.ensureBootstrapAdmin();
        const normalizedLogin = this.normalizeLogin(login);
        const normalizedPassword = String(password || '');
        const existing = await this.store.repo.getAuthUserByLogin(normalizedLogin);
        if (existing) {
            throw new common_1.ConflictException('User already exists');
        }
        const user = {
            userId: (0, node_crypto_1.randomUUID)(),
            login: normalizedLogin,
            role: 'user',
            provider: 'local',
            providerUserId: null,
            passwordHash: this.hashPassword(normalizedPassword)
        };
        await this.store.repo.createAuthUser(user);
        return this.issueTokenPair({
            sub: user.userId,
            login: user.login,
            role: user.role
        });
    }
    async login(login, password) {
        await this.ensureBootstrapAdmin();
        const normalizedLogin = this.normalizeLogin(login);
        const normalizedPassword = String(password || '');
        const user = await this.store.repo.getAuthUserByLogin(normalizedLogin);
        if (!user || !this.verifyPassword(normalizedPassword, user.passwordHash)) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        return this.issueTokenPair({
            sub: user.userId,
            login: user.login,
            role: user.role
        });
    }
    async loginWithGoogle(idToken) {
        if (!this.env.AUTH_GOOGLE_CLIENT_ID) {
            throw new common_1.BadRequestException('Google auth is not configured');
        }
        const tokenInfo = await this.verifyGoogleIdToken(idToken, this.env.AUTH_GOOGLE_CLIENT_ID);
        const providerUserId = String(tokenInfo.sub || '').trim();
        if (!providerUserId) {
            throw new common_1.UnauthorizedException('Invalid Google token subject');
        }
        const user = await this.findOrCreateSocialUser({
            provider: 'google',
            providerUserId,
            preferredLogin: this.preferredGoogleLogin(tokenInfo)
        });
        return this.issueTokenPair({
            sub: user.userId,
            login: user.login,
            role: user.role
        });
    }
    async loginWithTelegram(payload) {
        if (!this.env.AUTH_TELEGRAM_BOT_TOKEN) {
            throw new common_1.BadRequestException('Telegram auth is not configured');
        }
        this.verifyTelegramPayload(payload, this.env.AUTH_TELEGRAM_BOT_TOKEN);
        const providerUserId = String(payload.id || '').trim();
        if (!providerUserId) {
            throw new common_1.UnauthorizedException('Invalid Telegram user id');
        }
        const preferredLogin = this.preferredTelegramLogin(payload);
        const user = await this.findOrCreateSocialUser({
            provider: 'telegram',
            providerUserId,
            preferredLogin
        });
        return this.issueTokenPair({
            sub: user.userId,
            login: user.login,
            role: user.role
        });
    }
    async refresh(refreshToken) {
        const claims = this.verifyToken(refreshToken, 'refresh');
        const session = await this.store.repo.getRefreshSession(claims.jti);
        if (!session || session.revokedAt || this.isExpiredIsoTimestamp(session.expiresAt)) {
            await this.store.repo.revokeRefreshSession(claims.jti);
            throw new common_1.UnauthorizedException('Refresh token is invalid or expired');
        }
        await this.store.repo.revokeRefreshSession(claims.jti);
        return this.issueTokenPair({
            sub: session.userSub,
            login: session.login,
            role: session.role
        });
    }
    async logout(refreshToken) {
        const claims = this.verifyToken(refreshToken, 'refresh');
        await this.store.repo.revokeRefreshSession(claims.jti);
    }
    async changePassword(user, currentPassword, newPassword) {
        const account = await this.store.repo.getAuthUserByLogin(this.normalizeLogin(user.login));
        if (!account) {
            throw new common_1.UnauthorizedException('User is not found');
        }
        if (account.provider !== 'local') {
            throw new common_1.BadRequestException('Password change is available only for local accounts');
        }
        if (!this.verifyPassword(String(currentPassword || ''), account.passwordHash)) {
            throw new common_1.UnauthorizedException('Current password is invalid');
        }
        const normalizedNewPassword = String(newPassword || '');
        await this.store.repo.updateAuthUserPassword(account.userId, this.hashPassword(normalizedNewPassword));
    }
    verifyAccessToken(accessToken) {
        const claims = this.verifyToken(accessToken, 'access');
        return {
            sub: claims.sub,
            login: claims.login,
            role: claims.role
        };
    }
    async getUserState(user) {
        const state = await this.store.repo.getAuthUserState(user.sub);
        return {
            lastJobId: state?.lastJobId ?? null,
            assistantSessionId: state?.assistantSessionId ?? null,
            updatedAt: state?.updatedAt
        };
    }
    async setUserState(user, payload) {
        const normalizedLastJobId = this.cleanOptionalString(payload.lastJobId, 128);
        const normalizedSessionId = this.cleanOptionalString(payload.assistantSessionId, 128);
        await this.store.repo.upsertAuthUserState({
            userSub: user.sub,
            lastJobId: normalizedLastJobId,
            assistantSessionId: normalizedSessionId
        });
        return this.getUserState(user);
    }
    async issueTokenPair(user) {
        await this.store.repo.deleteExpiredRefreshSessions();
        const accessExpiresIn = this.env.AUTH_ACCESS_TTL_SECONDS;
        const refreshExpiresIn = this.env.AUTH_REFRESH_TTL_SECONDS;
        const now = this.now();
        const refreshJti = (0, node_crypto_1.randomUUID)();
        const accessToken = this.signToken({
            ...user,
            type: 'access',
            jti: (0, node_crypto_1.randomUUID)(),
            iss: this.env.AUTH_JWT_ISSUER,
            aud: this.env.AUTH_JWT_AUDIENCE,
            iat: now,
            exp: now + accessExpiresIn
        }, this.env.AUTH_JWT_ACCESS_SECRET);
        const refreshToken = this.signToken({
            ...user,
            type: 'refresh',
            jti: refreshJti,
            iss: this.env.AUTH_JWT_ISSUER,
            aud: this.env.AUTH_JWT_AUDIENCE,
            iat: now,
            exp: now + refreshExpiresIn
        }, this.env.AUTH_JWT_REFRESH_SECRET);
        await this.store.repo.createRefreshSession({
            jti: refreshJti,
            userSub: user.sub,
            login: user.login,
            role: user.role,
            expiresAt: new Date((now + refreshExpiresIn) * 1000).toISOString()
        });
        return {
            accessToken,
            refreshToken,
            accessExpiresIn,
            refreshExpiresIn,
            tokenType: 'Bearer'
        };
    }
    verifyToken(token, expectedType) {
        const secret = expectedType === 'access'
            ? this.env.AUTH_JWT_ACCESS_SECRET
            : this.env.AUTH_JWT_REFRESH_SECRET;
        const claims = this.decodeAndVerify(token, secret);
        if (claims.type !== expectedType) {
            throw new common_1.UnauthorizedException('Invalid token type');
        }
        return claims;
    }
    signToken(payload, secret) {
        const header = {
            alg: 'HS256',
            typ: 'JWT'
        };
        const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
        const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
        const unsignedToken = `${encodedHeader}.${encodedPayload}`;
        const signature = (0, node_crypto_1.createHmac)('sha256', secret).update(unsignedToken).digest('base64url');
        return `${unsignedToken}.${signature}`;
    }
    decodeAndVerify(token, secret) {
        const parts = String(token || '').split('.');
        if (parts.length !== 3) {
            throw new common_1.UnauthorizedException('Invalid token');
        }
        const [encodedHeader, encodedPayload, encodedSignature] = parts;
        const unsignedToken = `${encodedHeader}.${encodedPayload}`;
        const expectedSignature = (0, node_crypto_1.createHmac)('sha256', secret).update(unsignedToken).digest();
        const providedSignature = this.decodeBase64Url(encodedSignature);
        if (providedSignature.byteLength !== expectedSignature.byteLength ||
            !(0, node_crypto_1.timingSafeEqual)(providedSignature, expectedSignature)) {
            throw new common_1.UnauthorizedException('Invalid token signature');
        }
        let payload;
        try {
            payload = JSON.parse(this.decodeBase64Url(encodedPayload).toString('utf8'));
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid token payload');
        }
        const claims = this.parseClaims(payload);
        if (claims.iss !== this.env.AUTH_JWT_ISSUER || claims.aud !== this.env.AUTH_JWT_AUDIENCE) {
            throw new common_1.UnauthorizedException('Invalid token issuer or audience');
        }
        if (claims.exp <= this.now()) {
            throw new common_1.UnauthorizedException('Token expired');
        }
        return claims;
    }
    parseClaims(payload) {
        if (!payload || typeof payload !== 'object') {
            throw new common_1.UnauthorizedException('Invalid token payload');
        }
        const claims = payload;
        const typeOk = claims.type === 'access' || claims.type === 'refresh';
        const roleOk = claims.role === 'admin' || claims.role === 'user';
        const allStringFieldsOk = [
            claims.sub,
            claims.login,
            claims.jti,
            claims.iss,
            claims.aud
        ].every((value) => typeof value === 'string' && value.length > 0);
        const timeFieldsOk = typeof claims.iat === 'number' &&
            Number.isFinite(claims.iat) &&
            typeof claims.exp === 'number' &&
            Number.isFinite(claims.exp);
        if (!typeOk || !roleOk || !allStringFieldsOk || !timeFieldsOk) {
            throw new common_1.UnauthorizedException('Invalid token claims');
        }
        return claims;
    }
    base64UrlEncode(value) {
        return Buffer.from(value, 'utf8').toString('base64url');
    }
    decodeBase64Url(value) {
        try {
            return Buffer.from(value, 'base64url');
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid token encoding');
        }
    }
    safeStringEquals(a, b) {
        const left = Buffer.from(a, 'utf8');
        const right = Buffer.from(b, 'utf8');
        if (left.byteLength !== right.byteLength) {
            return false;
        }
        return (0, node_crypto_1.timingSafeEqual)(left, right);
    }
    now() {
        return Math.floor(Date.now() / 1000);
    }
    isExpiredIsoTimestamp(value) {
        const epochMs = Date.parse(value);
        if (!Number.isFinite(epochMs)) {
            return true;
        }
        return epochMs <= Date.now();
    }
    cleanOptionalString(value, maxLength) {
        const normalized = String(value ?? '').trim();
        if (!normalized) {
            return null;
        }
        return normalized.slice(0, maxLength);
    }
    async verifyGoogleIdToken(idToken, expectedAudience) {
        const token = String(idToken || '').trim();
        if (!token) {
            throw new common_1.UnauthorizedException('idToken is required');
        }
        const url = new URL('https://oauth2.googleapis.com/tokeninfo');
        url.searchParams.set('id_token', token);
        const response = await fetch(url.toString(), {
            method: 'GET'
        });
        if (!response.ok) {
            throw new common_1.UnauthorizedException('Google token validation failed');
        }
        const payload = (await response.json());
        const issuer = String(payload.iss || '');
        const audience = String(payload.aud || '');
        const allowedIssuers = new Set(['accounts.google.com', 'https://accounts.google.com']);
        if (!allowedIssuers.has(issuer)) {
            throw new common_1.UnauthorizedException('Invalid Google issuer');
        }
        if (audience !== expectedAudience) {
            throw new common_1.UnauthorizedException('Invalid Google audience');
        }
        const emailVerified = String(payload.email_verified || '').toLowerCase() === 'true';
        if (payload.email && !emailVerified) {
            throw new common_1.UnauthorizedException('Google email is not verified');
        }
        return payload;
    }
    verifyTelegramPayload(payload, botToken) {
        const authDateSec = Number(payload.auth_date || 0);
        if (!Number.isFinite(authDateSec) || authDateSec <= 0) {
            throw new common_1.UnauthorizedException('Invalid Telegram auth date');
        }
        const nowSec = Math.floor(Date.now() / 1000);
        if (Math.abs(nowSec - authDateSec) > 86400) {
            throw new common_1.UnauthorizedException('Telegram auth payload expired');
        }
        const dataForCheck = Object.entries(payload)
            .filter(([key, value]) => key !== 'hash' && value !== undefined && value !== null)
            .map(([key, value]) => `${key}=${String(value)}`)
            .sort()
            .join('\n');
        const secret = (0, node_crypto_1.createHash)('sha256').update(botToken).digest();
        const calculated = (0, node_crypto_1.createHmac)('sha256', secret).update(dataForCheck).digest('hex');
        const given = String(payload.hash || '').trim().toLowerCase();
        if (!given || calculated.length !== given.length) {
            throw new common_1.UnauthorizedException('Invalid Telegram hash');
        }
        const isValid = (0, node_crypto_1.timingSafeEqual)(Buffer.from(calculated, 'utf8'), Buffer.from(given, 'utf8'));
        if (!isValid) {
            throw new common_1.UnauthorizedException('Invalid Telegram signature');
        }
    }
    preferredGoogleLogin(tokenInfo) {
        const email = String(tokenInfo.email || '').trim().toLowerCase();
        if (email && email.includes('@')) {
            const base = email.split('@')[0];
            const normalized = this.normalizeLogin(base);
            if (normalized) {
                return normalized;
            }
        }
        return `google_${String(tokenInfo.sub || '').slice(0, 24)}`;
    }
    preferredTelegramLogin(payload) {
        const username = this.normalizeLogin(String(payload.username || ''));
        if (username) {
            return username;
        }
        return `telegram_${String(payload.id || '').trim()}`;
    }
    async findOrCreateSocialUser(input) {
        const existing = await this.store.repo.getAuthUserByProvider(input.provider, input.providerUserId);
        if (existing) {
            return existing;
        }
        const login = await this.resolveUniqueLogin(input.preferredLogin);
        const created = {
            userId: (0, node_crypto_1.randomUUID)(),
            login,
            passwordHash: this.hashPassword((0, node_crypto_1.randomUUID)()),
            provider: input.provider,
            providerUserId: input.providerUserId,
            role: 'user'
        };
        await this.store.repo.createAuthUser(created);
        return {
            userId: created.userId,
            login: created.login,
            passwordHash: created.passwordHash,
            provider: created.provider,
            providerUserId: created.providerUserId,
            role: created.role,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }
    async resolveUniqueLogin(preferredLogin) {
        const normalized = this.normalizeLogin(preferredLogin).replace(/[^a-z0-9._-]/g, '');
        const base = normalized || `user_${(0, node_crypto_1.randomUUID)().slice(0, 8)}`;
        for (let i = 0; i < 100; i++) {
            const candidate = i === 0 ? base : `${base}_${i + 1}`;
            const exists = await this.store.repo.getAuthUserByLogin(candidate);
            if (!exists) {
                return candidate;
            }
        }
        return `user_${(0, node_crypto_1.randomUUID)().replace(/-/g, '').slice(0, 16)}`;
    }
    normalizeLogin(value) {
        return String(value || '').trim().toLowerCase();
    }
    hashPassword(password) {
        const salt = (0, node_crypto_1.randomBytes)(16).toString('hex');
        const hash = (0, node_crypto_1.scryptSync)(password, salt, 64).toString('hex');
        return `scrypt$${salt}$${hash}`;
    }
    verifyPassword(password, stored) {
        const parts = String(stored || '').split('$');
        if (parts.length !== 3 || parts[0] !== 'scrypt') {
            return false;
        }
        const salt = parts[1];
        const expected = Buffer.from(parts[2], 'hex');
        const actual = (0, node_crypto_1.scryptSync)(password, salt, 64);
        if (actual.byteLength !== expected.byteLength) {
            return false;
        }
        return (0, node_crypto_1.timingSafeEqual)(actual, expected);
    }
    async ensureBootstrapAdmin() {
        const adminLogin = this.normalizeLogin(this.env.AUTH_USER_LOGIN);
        const existing = await this.store.repo.getAuthUserByLogin(adminLogin);
        if (existing) {
            return;
        }
        await this.store.repo.createAuthUser({
            userId: (0, node_crypto_1.randomUUID)(),
            login: adminLogin,
            provider: 'local',
            providerUserId: null,
            role: 'admin',
            passwordHash: this.hashPassword(String(this.env.AUTH_USER_PASSWORD || ''))
        });
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(config_1.APP_ENV)),
    __metadata("design:paramtypes", [Object, job_store_service_1.JobStoreService])
], AuthService);
//# sourceMappingURL=auth.service.js.map