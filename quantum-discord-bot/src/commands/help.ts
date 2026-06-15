import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import { commands } from './index';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Show all available commands and what they do');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle('🛰️ Quantum Discord Bot — Commands')
    .setColor(0x5865f2)
    .setDescription(
      commands.map((command) => `**/${command.data.name}** — ${command.data.description}`).join('\n'),
    );

  await interaction.reply({ embeds: [embed] });
}
