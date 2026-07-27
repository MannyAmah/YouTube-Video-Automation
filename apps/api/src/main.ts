import { loadEnv } from '@yva/shared';
import { createApp } from './bootstrap';

async function bootstrap() {
  const env = loadEnv();
  const app = await createApp();
  await app.listen(env.APP_PORT);
  // eslint-disable-next-line no-console
  console.log(`API listening on :${env.APP_PORT}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('API failed to start:', err);
  process.exit(1);
});
