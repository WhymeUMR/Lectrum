import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    register(body: {
        login: string;
        password: string;
    }): Promise<{
        accessToken: string;
        refreshToken: string;
        accessExpiresIn: number;
        refreshExpiresIn: number;
        tokenType: "Bearer";
    }>;
    login(body: {
        login: string;
        password: string;
    }): Promise<{
        accessToken: string;
        refreshToken: string;
        accessExpiresIn: number;
        refreshExpiresIn: number;
        tokenType: "Bearer";
    }>;
    loginWithGoogle(body: {
        idToken: string;
    }): Promise<{
        accessToken: string;
        refreshToken: string;
        accessExpiresIn: number;
        refreshExpiresIn: number;
        tokenType: "Bearer";
    }>;
    loginWithTelegram(body: {
        id: string | number;
        first_name?: string;
        last_name?: string;
        username?: string;
        photo_url?: string;
        auth_date: string | number;
        hash: string;
    }): Promise<{
        accessToken: string;
        refreshToken: string;
        accessExpiresIn: number;
        refreshExpiresIn: number;
        tokenType: "Bearer";
    }>;
    refresh(body: {
        refreshToken: string;
    }): Promise<{
        accessToken: string;
        refreshToken: string;
        accessExpiresIn: number;
        refreshExpiresIn: number;
        tokenType: "Bearer";
    }>;
    logout(body: {
        refreshToken: string;
    }): Promise<{
        success: boolean;
    }>;
    changePassword(request: {
        user?: AuthUser;
    }, body: {
        currentPassword: string;
        newPassword: string;
    }): Promise<{
        success: boolean;
    }>;
    me(request: {
        user?: AuthUser;
    }): {
        user: AuthUser;
    };
    getState(request: {
        user?: AuthUser;
    }): Promise<{
        lastJobId: string | null;
        assistantSessionId: string | null;
        updatedAt?: string;
    }>;
    setState(request: {
        user?: AuthUser;
    }, body: {
        lastJobId?: string | null;
        assistantSessionId?: string | null;
    }): Promise<{
        lastJobId: string | null;
        assistantSessionId: string | null;
        updatedAt?: string;
    }>;
}
