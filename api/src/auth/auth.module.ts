import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RequireAuthGuard } from './require-auth.guard';
import { AuthMiddleware } from './auth.middleware';

@Module({
  controllers: [AuthController],
  providers: [AuthService, RequireAuthGuard, AuthMiddleware],
  exports: [AuthService, RequireAuthGuard, AuthMiddleware],
})
export class AuthModule {}
