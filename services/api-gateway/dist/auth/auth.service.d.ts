import { AppEnv } from '@lecture/config';
import { AuthUser } from './auth.types';
import { JobStoreService } from '../services/job-store.service';
type TokenPair = {
    accessToken: string;
    refreshToken: string;
    accessExpiresIn: number;
    refreshExpiresIn: number;
    tokenType: 'Bearer';
};
type UserStatePayload = {
    lastJobId: string | null;
    assistantSessionId: string | null;
    updatedAt?: string;
};
export declare class AuthService {
    private readonly env;
    private readonly store;
    constructor(env: AppEnv, store: JobStoreService);
    register(login: string, password: string): Promise<TokenPair>;
    login(login: string, password: string): Promise<TokenPair>;
    loginWithGoogle(idToken: string): Promise<TokenPair>;
    loginWithTelegram(payload: {
        id: string | number;
        first_name?: string;
        last_name?: string;
        username?: string;
        photo_url?: string;
        auth_date: string | number;
        hash: string;
    }): Promise<TokenPair>;
    refresh(refreshToken: string): Promise<TokenPair>;
    logout(refreshToken: string): Promise<void>;
    changePassword(user: AuthUser, currentPassword: string, newPassword: string): Promise<void>;
    verifyAccessToken(accessToken: string): AuthUser;
    getUserState(user: AuthUser): Promise<UserStatePayload>;
    setUserState(user: AuthUser, payload: {
        lastJobId?: string | null;
        assistantSessionId?: string | null;
    }): Promise<UserStatePayload>;
    private issueTokenPair;
    private verifyToken;
    private signToken;
    private decodeAndVerify;
    private parseClaims;
    private base64UrlEncode;
    private decodeBase64Url;
    private safeStringEquals;
    private now;
    private isExpiredIsoTimestamp;
    private cleanOptionalString;
    private verifyGoogleIdToken;
    private verifyTelegramPayload;
    private preferredGoogleLogin;
    private preferredTelegramLogin;
    private findOrCreateSocialUser;
    private resolveUniqueLogin;
    private normalizeLogin;
    private hashPassword;
    private verifyPassword;
    private ensureBootstrapAdmin;
}
export {};
