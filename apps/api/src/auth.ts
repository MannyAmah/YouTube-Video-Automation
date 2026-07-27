import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '@yva/db';
import { Env, verifyPassword } from '@yva/shared';
import { ENV, PRISMA } from './tokens';

const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export const SESSION_COOKIE = 'yva_session';

/** Simple fixed-window rate limit for login attempts (per process). */
const loginAttempts = new Map<string, { count: number; windowStart: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

function loginRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > LOGIN_MAX_ATTEMPTS;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException('Not signed in');
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; email: string }>(token);
      (req as Request & { user?: { id: string; email: string } }).user = {
        id: payload.sub,
        email: payload.email,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Session expired');
    }
  }
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    private readonly jwt: JwtService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const key = req.ip ?? 'unknown';
    if (loginRateLimited(key)) {
      throw new UnauthorizedException('Too many login attempts; try again later');
    }
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) throw new UnauthorizedException('Invalid credentials');
    const user = await this.prisma.adminUser.findUnique({ where: { email: parsed.data.email } });
    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const token = await this.jwt.signAsync({ sub: user.id, email: user.email });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.env.NODE_ENV === 'production',
      maxAge: 12 * 3600 * 1000,
      path: '/',
    });
    return { ok: true, email: user.email };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: Request & { user?: { id: string; email: string } }) {
    return { email: req.user?.email };
  }
}
