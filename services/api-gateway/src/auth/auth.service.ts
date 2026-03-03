import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { APP_ENV, AppEnv } from '@lecture/config';
import { AuthUser, TokenClaims } from './auth.types';
import { JobStoreService } from '../services/job-store.service';

type TokenPair = {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
  refreshExpiresIn: number;
  tokenType: 'Bearer';
};

type GoogleTokenInfo = {
  iss?: string;
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: string;
};

type UserStatePayload = {
  lastJobId: string | null;
  assistantSessionId: string | null;
  updatedAt?: string;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly store: JobStoreService
  ) {}

  async register(login: string, password: string): Promise<TokenPair> {
    await this.ensureBootstrapAdmin();
    const normalizedLogin = this.normalizeLogin(login);
    const normalizedPassword = String(password || '');
    const existing = await this.store.repo.getAuthUserByLogin(normalizedLogin);
    if (existing) {
      throw new ConflictException('User already exists');
    }

    const user = {
      userId: randomUUID(),
      login: normalizedLogin,
      role: 'user' as const,
      provider: 'local' as const,
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

  async login(login: string, password: string): Promise<TokenPair> {
    await this.ensureBootstrapAdmin();
    const normalizedLogin = this.normalizeLogin(login);
    const normalizedPassword = String(password || '');
    const user = await this.store.repo.getAuthUserByLogin(normalizedLogin);
    if (!user || !this.verifyPassword(normalizedPassword, user.passwordHash)) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokenPair({
      sub: user.userId,
      login: user.login,
      role: user.role
    });
  }

  async loginWithGoogle(idToken: string): Promise<TokenPair> {
    if (!this.env.AUTH_GOOGLE_CLIENT_ID) {
      throw new BadRequestException('Google auth is not configured');
    }
    const tokenInfo = await this.verifyGoogleIdToken(idToken, this.env.AUTH_GOOGLE_CLIENT_ID);
    const providerUserId = String(tokenInfo.sub || '').trim();
    if (!providerUserId) {
      throw new UnauthorizedException('Invalid Google token subject');
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

  async loginWithTelegram(payload: {
    id: string | number;
    first_name?: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    auth_date: string | number;
    hash: string;
  }): Promise<TokenPair> {
    if (!this.env.AUTH_TELEGRAM_BOT_TOKEN) {
      throw new BadRequestException('Telegram auth is not configured');
    }
    this.verifyTelegramPayload(payload, this.env.AUTH_TELEGRAM_BOT_TOKEN);

    const providerUserId = String(payload.id || '').trim();
    if (!providerUserId) {
      throw new UnauthorizedException('Invalid Telegram user id');
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

  async refresh(refreshToken: string): Promise<TokenPair> {
    const claims = this.verifyToken(refreshToken, 'refresh');
    const session = await this.store.repo.getRefreshSession(claims.jti);
    if (!session || session.revokedAt || this.isExpiredIsoTimestamp(session.expiresAt)) {
      await this.store.repo.revokeRefreshSession(claims.jti);
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }
    await this.store.repo.revokeRefreshSession(claims.jti);
    return this.issueTokenPair({
      sub: session.userSub,
      login: session.login,
      role: session.role
    });
  }

  async logout(refreshToken: string): Promise<void> {
    const claims = this.verifyToken(refreshToken, 'refresh');
    await this.store.repo.revokeRefreshSession(claims.jti);
  }

  async changePassword(user: AuthUser, currentPassword: string, newPassword: string): Promise<void> {
    const account = await this.store.repo.getAuthUserByLogin(this.normalizeLogin(user.login));
    if (!account) {
      throw new UnauthorizedException('User is not found');
    }
    if (account.provider !== 'local') {
      throw new BadRequestException('Password change is available only for local accounts');
    }
    if (!this.verifyPassword(String(currentPassword || ''), account.passwordHash)) {
      throw new UnauthorizedException('Current password is invalid');
    }

    const normalizedNewPassword = String(newPassword || '');
    await this.store.repo.updateAuthUserPassword(account.userId, this.hashPassword(normalizedNewPassword));
  }

  verifyAccessToken(accessToken: string): AuthUser {
    const claims = this.verifyToken(accessToken, 'access');
    return {
      sub: claims.sub,
      login: claims.login,
      role: claims.role
    };
  }

  async getUserState(user: AuthUser): Promise<UserStatePayload> {
    const state = await this.store.repo.getAuthUserState(user.sub);
    return {
      lastJobId: state?.lastJobId ?? null,
      assistantSessionId: state?.assistantSessionId ?? null,
      updatedAt: state?.updatedAt
    };
  }

  async setUserState(
    user: AuthUser,
    payload: { lastJobId?: string | null; assistantSessionId?: string | null }
  ): Promise<UserStatePayload> {
    const normalizedLastJobId = this.cleanOptionalString(payload.lastJobId, 128);
    const normalizedSessionId = this.cleanOptionalString(payload.assistantSessionId, 128);
    await this.store.repo.upsertAuthUserState({
      userSub: user.sub,
      lastJobId: normalizedLastJobId,
      assistantSessionId: normalizedSessionId
    });
    return this.getUserState(user);
  }

  private async issueTokenPair(user: AuthUser): Promise<TokenPair> {
    await this.store.repo.deleteExpiredRefreshSessions();
    const accessExpiresIn = this.env.AUTH_ACCESS_TTL_SECONDS;
    const refreshExpiresIn = this.env.AUTH_REFRESH_TTL_SECONDS;
    const now = this.now();
    const refreshJti = randomUUID();

    const accessToken = this.signToken(
      {
        ...user,
        type: 'access',
        jti: randomUUID(),
        iss: this.env.AUTH_JWT_ISSUER,
        aud: this.env.AUTH_JWT_AUDIENCE,
        iat: now,
        exp: now + accessExpiresIn
      },
      this.env.AUTH_JWT_ACCESS_SECRET
    );

    const refreshToken = this.signToken(
      {
        ...user,
        type: 'refresh',
        jti: refreshJti,
        iss: this.env.AUTH_JWT_ISSUER,
        aud: this.env.AUTH_JWT_AUDIENCE,
        iat: now,
        exp: now + refreshExpiresIn
      },
      this.env.AUTH_JWT_REFRESH_SECRET
    );

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

  private verifyToken(token: string, expectedType: 'access' | 'refresh'): TokenClaims {
    const secret =
      expectedType === 'access'
        ? this.env.AUTH_JWT_ACCESS_SECRET
        : this.env.AUTH_JWT_REFRESH_SECRET;
    const claims = this.decodeAndVerify(token, secret);
    if (claims.type !== expectedType) {
      throw new UnauthorizedException('Invalid token type');
    }
    return claims;
  }

  private signToken(payload: TokenClaims, secret: string): string {
    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };
    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;
    const signature = createHmac('sha256', secret).update(unsignedToken).digest('base64url');
    return `${unsignedToken}.${signature}`;
  }

  private decodeAndVerify(token: string, secret: string): TokenClaims {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid token');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = createHmac('sha256', secret).update(unsignedToken).digest();
    const providedSignature = this.decodeBase64Url(encodedSignature);

    if (
      providedSignature.byteLength !== expectedSignature.byteLength ||
      !timingSafeEqual(providedSignature, expectedSignature)
    ) {
      throw new UnauthorizedException('Invalid token signature');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(this.decodeBase64Url(encodedPayload).toString('utf8'));
    } catch {
      throw new UnauthorizedException('Invalid token payload');
    }

    const claims = this.parseClaims(payload);
    if (claims.iss !== this.env.AUTH_JWT_ISSUER || claims.aud !== this.env.AUTH_JWT_AUDIENCE) {
      throw new UnauthorizedException('Invalid token issuer or audience');
    }
    if (claims.exp <= this.now()) {
      throw new UnauthorizedException('Token expired');
    }

    return claims;
  }

  private parseClaims(payload: unknown): TokenClaims {
    if (!payload || typeof payload !== 'object') {
      throw new UnauthorizedException('Invalid token payload');
    }
    const claims = payload as Partial<TokenClaims>;
    const typeOk = claims.type === 'access' || claims.type === 'refresh';
    const roleOk = claims.role === 'admin' || claims.role === 'user';
    const allStringFieldsOk = [
      claims.sub,
      claims.login,
      claims.jti,
      claims.iss,
      claims.aud
    ].every((value) => typeof value === 'string' && value.length > 0);
    const timeFieldsOk =
      typeof claims.iat === 'number' &&
      Number.isFinite(claims.iat) &&
      typeof claims.exp === 'number' &&
      Number.isFinite(claims.exp);

    if (!typeOk || !roleOk || !allStringFieldsOk || !timeFieldsOk) {
      throw new UnauthorizedException('Invalid token claims');
    }

    return claims as TokenClaims;
  }

  private base64UrlEncode(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url');
  }

  private decodeBase64Url(value: string): Buffer {
    try {
      return Buffer.from(value, 'base64url');
    } catch {
      throw new UnauthorizedException('Invalid token encoding');
    }
  }

  private safeStringEquals(a: string, b: string): boolean {
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');
    if (left.byteLength !== right.byteLength) {
      return false;
    }
    return timingSafeEqual(left, right);
  }

  private now(): number {
    return Math.floor(Date.now() / 1000);
  }

  private isExpiredIsoTimestamp(value: string): boolean {
    const epochMs = Date.parse(value);
    if (!Number.isFinite(epochMs)) {
      return true;
    }
    return epochMs <= Date.now();
  }

  private cleanOptionalString(value: string | null | undefined, maxLength: number): string | null {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return null;
    }
    return normalized.slice(0, maxLength);
  }

  private async verifyGoogleIdToken(idToken: string, expectedAudience: string): Promise<GoogleTokenInfo> {
    const token = String(idToken || '').trim();
    if (!token) {
      throw new UnauthorizedException('idToken is required');
    }

    const url = new URL('https://oauth2.googleapis.com/tokeninfo');
    url.searchParams.set('id_token', token);
    const response = await fetch(url.toString(), {
      method: 'GET'
    });
    if (!response.ok) {
      throw new UnauthorizedException('Google token validation failed');
    }
    const payload = (await response.json()) as GoogleTokenInfo;
    const issuer = String(payload.iss || '');
    const audience = String(payload.aud || '');
    const allowedIssuers = new Set(['accounts.google.com', 'https://accounts.google.com']);
    if (!allowedIssuers.has(issuer)) {
      throw new UnauthorizedException('Invalid Google issuer');
    }
    if (audience !== expectedAudience) {
      throw new UnauthorizedException('Invalid Google audience');
    }
    const emailVerified = String(payload.email_verified || '').toLowerCase() === 'true';
    if (payload.email && !emailVerified) {
      throw new UnauthorizedException('Google email is not verified');
    }
    return payload;
  }

  private verifyTelegramPayload(
    payload: {
      id: string | number;
      first_name?: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
      auth_date: string | number;
      hash: string;
    },
    botToken: string
  ): void {
    const authDateSec = Number(payload.auth_date || 0);
    if (!Number.isFinite(authDateSec) || authDateSec <= 0) {
      throw new UnauthorizedException('Invalid Telegram auth date');
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - authDateSec) > 86400) {
      throw new UnauthorizedException('Telegram auth payload expired');
    }

    const dataForCheck = Object.entries(payload)
      .filter(([key, value]) => key !== 'hash' && value !== undefined && value !== null)
      .map(([key, value]) => `${key}=${String(value)}`)
      .sort()
      .join('\n');
    const secret = createHash('sha256').update(botToken).digest();
    const calculated = createHmac('sha256', secret).update(dataForCheck).digest('hex');
    const given = String(payload.hash || '').trim().toLowerCase();
    if (!given || calculated.length !== given.length) {
      throw new UnauthorizedException('Invalid Telegram hash');
    }
    const isValid = timingSafeEqual(Buffer.from(calculated, 'utf8'), Buffer.from(given, 'utf8'));
    if (!isValid) {
      throw new UnauthorizedException('Invalid Telegram signature');
    }
  }

  private preferredGoogleLogin(tokenInfo: GoogleTokenInfo): string {
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

  private preferredTelegramLogin(payload: { username?: string; id: string | number }): string {
    const username = this.normalizeLogin(String(payload.username || ''));
    if (username) {
      return username;
    }
    return `telegram_${String(payload.id || '').trim()}`;
  }

  private async findOrCreateSocialUser(input: {
    provider: 'google' | 'telegram';
    providerUserId: string;
    preferredLogin: string;
  }) {
    const existing = await this.store.repo.getAuthUserByProvider(input.provider, input.providerUserId);
    if (existing) {
      return existing;
    }
    const login = await this.resolveUniqueLogin(input.preferredLogin);
    const created = {
      userId: randomUUID(),
      login,
      passwordHash: this.hashPassword(randomUUID()),
      provider: input.provider,
      providerUserId: input.providerUserId,
      role: 'user' as const
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

  private async resolveUniqueLogin(preferredLogin: string): Promise<string> {
    const normalized = this.normalizeLogin(preferredLogin).replace(/[^a-z0-9._-]/g, '');
    const base = normalized || `user_${randomUUID().slice(0, 8)}`;
    for (let i = 0; i < 100; i++) {
      const candidate = i === 0 ? base : `${base}_${i + 1}`;
      const exists = await this.store.repo.getAuthUserByLogin(candidate);
      if (!exists) {
        return candidate;
      }
    }
    return `user_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }

  private normalizeLogin(value: string): string {
    return String(value || '').trim().toLowerCase();
  }

  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    return `scrypt$${salt}$${hash}`;
  }

  private verifyPassword(password: string, stored: string): boolean {
    const parts = String(stored || '').split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') {
      return false;
    }
    const salt = parts[1];
    const expected = Buffer.from(parts[2], 'hex');
    const actual = scryptSync(password, salt, 64);
    if (actual.byteLength !== expected.byteLength) {
      return false;
    }
    return timingSafeEqual(actual, expected);
  }

  private async ensureBootstrapAdmin(): Promise<void> {
    const adminLogin = this.normalizeLogin(this.env.AUTH_USER_LOGIN);
    const existing = await this.store.repo.getAuthUserByLogin(adminLogin);
    if (existing) {
      return;
    }
    await this.store.repo.createAuthUser({
      userId: randomUUID(),
      login: adminLogin,
      provider: 'local',
      providerUserId: null,
      role: 'admin',
      passwordHash: this.hashPassword(String(this.env.AUTH_USER_PASSWORD || ''))
    });
  }
}
