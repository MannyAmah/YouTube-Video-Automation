import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

/** Build the Nest application (shared by main.ts and the API tests). */
export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn'],
  });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.disable('x-powered-by');

  const webDist = process.env.WEB_DIST ?? join(__dirname, '..', '..', 'web', 'dist');
  if (existsSync(webDist)) {
    app.useStaticAssets(webDist);
    const express = app.getHttpAdapter().getInstance();
    express.get(/^\/(?!api\/).*/, (_req: unknown, res: { sendFile: (p: string) => void }) => {
      res.sendFile(join(webDist, 'index.html'));
    });
  }
  return app;
}
