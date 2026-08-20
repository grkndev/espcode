import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import './request-user';

export const SESSION_COOKIE = 'espcode_session';

// master.plan.md §4.2 — anonim kullanım birinci sınıf vatandaş: bu middleware
// hiçbir isteği reddetmez, yalnızca geçerli bir cookie varsa req.user'ı doldurur.
// Girişin zorunlu olduğu uçlar RequireAuthGuard ile ayrıca korunur.
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly authService: AuthService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const cookies = req.cookies as Record<string, string> | undefined;
    const token = cookies?.[SESSION_COOKIE];
    if (typeof token === 'string') {
      const payload = this.authService.verifySession(token);
      req.user = payload ? { id: payload.sub } : null;
    } else {
      req.user = null;
    }
    next();
  }
}
