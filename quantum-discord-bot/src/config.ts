import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  discordToken: requireEnv('DISCORD_BOT_TOKEN'),
  clientId: requireEnv('DISCORD_CLIENT_ID'),
  guildId: process.env.DISCORD_GUILD_ID || null,
  orgServerUrl: (process.env.ORG_SERVER_URL ?? 'http://localhost:3100').replace(/\/+$/, ''),
  orgServerAuthToken: requireEnv('ORG_SERVER_AUTH_TOKEN'),
};
