import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Redis/Prisma bağlantılarını SIGTERM'de kapatmak için (deploy'da her
  // konteyner yeniden başlatmasında onModuleDestroy'ların çalışması gerekiyor).
  app.enableShutdownHooks();

  // master.plan.md §2 — nihai halde CORS app.espcode.dev'e sabitlenecek;
  // yerel geliştirmede APP_ORIGIN=localhost:3010.
  app.enableCors({ origin: process.env.APP_ORIGIN ?? true, credentials: true });
  // §4.1 — session cookie'sini req.cookies'te okumak için (AuthMiddleware).
  app.use(cookieParser());

  // backend.plan.md §7.3 — istek gövdesi doğrulaması, bilinmeyen alanları at
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
