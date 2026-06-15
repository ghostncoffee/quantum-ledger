import { REST, Routes } from 'discord.js';
import { config } from './config';
import { commands } from './commands';
import { logger } from './lib/logger';

async function main(): Promise<void> {
  const rest = new REST().setToken(config.discordToken);
  const body = commands.map((command) => command.data.toJSON());

  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  await rest.put(route, { body });

  logger.info(
    config.guildId
      ? `Registered ${body.length} command(s) for guild ${config.guildId}`
      : `Registered ${body.length} global command(s) — may take up to an hour to appear`,
  );
}

main().catch((err) => {
  logger.error('Failed to register commands', err);
  process.exit(1);
});
