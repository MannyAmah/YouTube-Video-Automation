import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { ArtifactStore, getPrisma } from '@yva/db';
import { createLogger, loadEnv } from '@yva/shared';
import { AuthController, AuthGuard } from './auth';
import { OAuthController } from './oauth';
import { RunsController } from './runs';
import { SystemController } from './system';
import { ENV, LOG, PIPELINE_Q, PRISMA, STORE } from './tokens';

const env = loadEnv();

@Module({
  imports: [
    JwtModule.register({
      secret: env.SESSION_SECRET,
      signOptions: { expiresIn: '12h' },
    }),
  ],
  controllers: [AuthController, OAuthController, RunsController, SystemController],
  providers: [
    AuthGuard,
    { provide: ENV, useValue: env },
    { provide: LOG, useValue: createLogger('api') },
    { provide: PRISMA, useFactory: () => getPrisma() },
    {
      provide: PIPELINE_Q,
      useFactory: () =>
        new Queue('pipeline', {
          connection: new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null }),
        }),
    },
    {
      provide: STORE,
      useFactory: () => new ArtifactStore(getPrisma(), env.MEDIA_ROOT),
    },
  ],
})
export class AppModule {}
