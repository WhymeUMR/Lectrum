import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const env: any = {
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
    const users = new Map<string, any>();
    const refresh = new Map<string, any>();
    return {
      repo: {
        async createAuthUser(input: any) {
          users.set(String(input.login || '').toLowerCase(), {
            userId: input.userId,
            login: String(input.login || '').toLowerCase(),
            passwordHash: input.passwordHash,
            provider: input.provider ?? 'local',
            providerUserId: input.providerUserId ?? null,
            role: input.role,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        },
        async getAuthUserByLogin(login: string) {
          return users.get(String(login || '').toLowerCase()) ?? null;
        },
        async getAuthUserByProvider(provider: string, providerUserId: string) {
          for (const value of users.values()) {
            if (value.provider === provider && value.providerUserId === providerUserId) {
              return value;
            }
          }
          return null;
        },
        async updateAuthUserPassword(userId: string, passwordHash: string) {
          for (const [key, value] of users.entries()) {
            if (value.userId === userId) {
              users.set(key, { ...value, passwordHash, updatedAt: new Date().toISOString() });
              break;
            }
          }
        },
        async createRefreshSession(input: any) {
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
        async getRefreshSession(jti: string) {
          return refresh.get(jti) ?? null;
        },
        async revokeRefreshSession(jti: string) {
          const current = refresh.get(jti);
          if (current) {
            current.revokedAt = new Date().toISOString();
            refresh.set(jti, current);
          }
        },
        async deleteExpiredRefreshSessions() {}
      }
    };
  }

  test('login -> refresh rotates refresh token and revokes old one', async () => {
    const store = buildStore();
    const service = new AuthService(env, store as any);

    const first = await service.login('admin', 'secret');
    const second = await service.refresh(first.refreshToken);

    assert.ok(first.accessToken.length > 20);
    assert.ok(second.accessToken.length > 20);
    await assert.rejects(() => service.refresh(first.refreshToken));
  });

  test('logout revokes refresh token', async () => {
    const store = buildStore();
    const service = new AuthService(env, store as any);

    const session = await service.login('admin', 'secret');
    await service.logout(session.refreshToken);
    await assert.rejects(() => service.refresh(session.refreshToken));
  });

  test('register creates user and allows login', async () => {
    const store = buildStore();
    const service = new AuthService(env, store as any);

    const registered = await service.register('new.user', 'VerySecurePassword1!');
    assert.ok(registered.accessToken.length > 20);

    const logged = await service.login('new.user', 'VerySecurePassword1!');
    assert.ok(logged.accessToken.length > 20);
  });

  test('changePassword updates local account password', async () => {
    const store = buildStore();
    const service = new AuthService(env, store as any);

    await service.register('pwd.user', 'StartStrong1!');
    await service.changePassword(
      { sub: 'unused', login: 'pwd.user', role: 'user' },
      'StartStrong1!',
      'NewStrongPassword2@'
    );

    await assert.rejects(() => service.login('pwd.user', 'StartStrong1!'));
    const logged = await service.login('pwd.user', 'NewStrongPassword2@');
    assert.ok(logged.accessToken.length > 20);
  });

  test('telegram login validates payload and reuses existing social user', async () => {
    const store = buildStore();
    const service = new AuthService(env, store as any);
    const payload: any = {
      id: 777,
      username: 'tg_user',
      first_name: 'TG',
      auth_date: Math.floor(Date.now() / 1000)
    };
    const dataCheckString = Object.entries(payload)
      .map(([k, v]) => `${k}=${String(v)}`)
      .sort()
      .join('\n');
    const secret = createHash('sha256').update(env.AUTH_TELEGRAM_BOT_TOKEN).digest();
    payload.hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');

    const first = await service.loginWithTelegram(payload);
    const second = await service.loginWithTelegram(payload);

    assert.ok(first.accessToken.length > 20);
    assert.ok(second.accessToken.length > 20);
  });
});
