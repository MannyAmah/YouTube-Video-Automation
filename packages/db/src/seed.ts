import { loadEnv, hashPassword } from '@yva/shared';
import { getPrisma } from './index';

/**
 * Idempotent seed: creates the admin user from ADMIN_EMAIL/ADMIN_PASSWORD
 * and a default channel with SAFE policy seeds. Note: even though the
 * product default is autonomous publishing, a channel only becomes able to
 * publish after YouTube OAuth is connected, so seeding autonomous mode
 * cannot publish anything by itself.
 */
async function main() {
  const env = loadEnv();
  const prisma = getPrisma();

  const existingAdmin = await prisma.adminUser.findUnique({ where: { email: env.ADMIN_EMAIL } });
  if (!existingAdmin) {
    await prisma.adminUser.create({
      data: { email: env.ADMIN_EMAIL, passwordHash: hashPassword(env.ADMIN_PASSWORD) },
    });
    console.log(`Created admin user ${env.ADMIN_EMAIL}`);
  }

  const channelCount = await prisma.channel.count();
  if (channelCount === 0) {
    await prisma.channel.create({
      data: {
        title: 'MedExplained',
        niche: 'medication-education',
        publishMode: env.PUBLISH_MODE,
        maxPublishesPerDay: env.MAX_PUBLISHES_PER_DAY,
      },
    });
    console.log('Created default channel "MedExplained"');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
