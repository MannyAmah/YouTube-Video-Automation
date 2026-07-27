import type { PrismaClient } from '@yva/db';
import { decryptSecret, Env } from '@yva/shared';
import { createOAuthClient } from '@yva/providers';
import type { OAuth2Client } from 'google-auth-library';

/**
 * Build an authenticated Google OAuth2 client for a channel from its
 * encrypted refresh token. Returns null when the channel has no live
 * connection (callers surface a MissingProviderError with guidance).
 */
export async function oauthClientForChannel(
  prisma: PrismaClient,
  env: Env,
  channelId: string,
): Promise<OAuth2Client | null> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  const connection = await prisma.oAuthConnection.findUnique({ where: { channelId } });
  if (!connection || connection.revokedAt) return null;
  const refreshToken = decryptSecret(connection.encryptedRefreshToken, env.APP_ENCRYPTION_KEY);
  const client = createOAuthClient(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${env.PUBLIC_URL}/api/oauth/google/callback`,
  );
  client.setCredentials({ refresh_token: refreshToken });
  client.on('tokens', () => {
    void prisma.oAuthConnection
      .update({ where: { channelId }, data: { lastRefreshedAt: new Date() } })
      .catch(() => undefined);
  });
  return client;
}
