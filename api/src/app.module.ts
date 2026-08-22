import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CompileModule } from './compile/compile.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AuthMiddleware } from './auth/auth.middleware';
import { ProjectsModule } from './projects/projects.module';
import { BuildsModule } from './builds/builds.module';
import { GithubModule } from './github/github.module';
import { LibrariesModule } from './libraries/libraries.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    GithubModule,
    ProjectsModule,
    BuildsModule,
    LibrariesModule,
    CompileModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // §4.2 — her isteğe uygulanır, hiçbirini reddetmez; yalnızca req.user'ı
    // doldurur. Girişin zorunlu olduğu uçlar RequireAuthGuard ile korunur.
    consumer.apply(AuthMiddleware).forRoutes('*');
  }
}
