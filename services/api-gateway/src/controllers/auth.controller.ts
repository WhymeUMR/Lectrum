import { Body, Controller, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { AuthLoginRequestSchema } from '../dto/auth-login-request.schema';
import { AuthRefreshRequestSchema } from '../dto/auth-refresh-request.schema';
import { AuthRegisterRequestSchema } from '../dto/auth-register-request.schema';
import { AuthUserStateUpdateRequestSchema } from '../dto/auth-user-state-update-request.schema';
import { AuthGoogleRequestSchema } from '../dto/auth-google-request.schema';
import { AuthTelegramRequestSchema } from '../dto/auth-telegram-request.schema';
import { AuthService } from '../auth/auth.service';
import { Public } from '../auth/public.decorator';
import { AuthUser } from '../auth/auth.types';

@Controller('/api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('/register')
  async register(
    @Body(new ZodValidationPipe(AuthRegisterRequestSchema))
    body: { login: string; password: string }
  ) {
    return this.authService.register(body.login, body.password);
  }

  @Public()
  @Post('/login')
  async login(
    @Body(new ZodValidationPipe(AuthLoginRequestSchema))
    body: { login: string; password: string }
  ) {
    return this.authService.login(body.login, body.password);
  }

  @Public()
  @Post('/google')
  async loginWithGoogle(
    @Body(new ZodValidationPipe(AuthGoogleRequestSchema))
    body: { idToken: string }
  ) {
    return this.authService.loginWithGoogle(body.idToken);
  }

  @Public()
  @Post('/telegram')
  async loginWithTelegram(
    @Body(new ZodValidationPipe(AuthTelegramRequestSchema))
    body: {
      id: string | number;
      first_name?: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
      auth_date: string | number;
      hash: string;
    }
  ) {
    return this.authService.loginWithTelegram(body);
  }

  @Public()
  @Post('/refresh')
  async refresh(
    @Body(new ZodValidationPipe(AuthRefreshRequestSchema))
    body: { refreshToken: string }
  ) {
    return this.authService.refresh(body.refreshToken);
  }

  @Public()
  @Post('/logout')
  async logout(
    @Body(new ZodValidationPipe(AuthRefreshRequestSchema))
    body: { refreshToken: string }
  ) {
    await this.authService.logout(body.refreshToken);
    return { success: true };
  }

  @Get('/me')
  me(@Req() request: { user?: AuthUser }) {
    if (!request.user) {
      throw new UnauthorizedException('Not authenticated');
    }
    return { user: request.user };
  }

  @Get('/state')
  async getState(@Req() request: { user?: AuthUser }) {
    if (!request.user) {
      throw new UnauthorizedException('Not authenticated');
    }
    return this.authService.getUserState(request.user);
  }

  @Post('/state')
  async setState(
    @Req() request: { user?: AuthUser },
    @Body(new ZodValidationPipe(AuthUserStateUpdateRequestSchema))
    body: { lastJobId?: string | null; assistantSessionId?: string | null }
  ) {
    if (!request.user) {
      throw new UnauthorizedException('Not authenticated');
    }
    return this.authService.setUserState(request.user, body);
  }
}
