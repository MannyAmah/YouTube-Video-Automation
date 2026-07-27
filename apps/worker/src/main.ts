import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule, WorkerService } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['error', 'warn'],
  });
  const service = app.get(WorkerService);
  await service.start();

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`Received ${signal}, shutting down worker...`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Worker failed to start:', err);
  process.exit(1);
});
