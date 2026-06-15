import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import { fetchFleet } from '../lib/orgClient';

const TYPE_EMOJI: Record<string, string> = {
  mining: '⛏️',
  trading: '📦',
  combat: '💥',
  multi: '🚀',
  other: '🔧',
};

const MAX_DESCRIPTION_LENGTH = 4096;

export const data = new SlashCommandBuilder()
  .setName('fleet')
  .setDescription('Show all ships available across the org');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const ships = await fetchFleet();

  if (!ships.length) {
    await interaction.editReply('No ships registered yet.');
    return;
  }

  const totalShips = ships.reduce((sum, ship) => sum + ship.count, 0);

  const lines = ships.map((ship) => {
    const emoji = TYPE_EMOJI[ship.type] ?? '•';
    const scu = ship.scu_capacity > 0 ? ` (${ship.scu_capacity} SCU)` : '';
    return `${emoji} **${ship.count}×** ${ship.name}${scu}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`🚀 Org Fleet — ${totalShips} ships, ${ships.length} types`)
    .setColor(0x5865f2)
    .setDescription(joinWithLimit(lines, MAX_DESCRIPTION_LENGTH))
    .setFooter({ text: 'Quantum Org Server' })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

function joinWithLimit(lines: string[], maxLength: number): string {
  let result = '';
  for (let i = 0; i < lines.length; i++) {
    const next = result ? `${result}\n${lines[i]}` : lines[i];
    if (next.length > maxLength - 20) {
      return `${result}\n…and ${lines.length - i} more`;
    }
    result = next;
  }
  return result;
}
