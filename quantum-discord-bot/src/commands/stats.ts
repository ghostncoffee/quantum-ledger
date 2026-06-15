import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import { fetchClanStats, StatsPeriod } from '../lib/orgClient';

const PERIOD_LABELS: Record<StatsPeriod, string> = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
  all_time: 'All Time',
};

const TYPE_EMOJI: Record<string, string> = {
  mining: '⛏️',
  hauling: '🚚',
  contract: '💥',
  salvage: '♻️',
  refining: '🔧',
  trading: '📦',
  crafting: '🛠️',
};

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('Show org activity stats from Quantum Org Server')
  .addStringOption((option) =>
    option
      .setName('period')
      .setDescription('Time range (defaults to this week)')
      .addChoices(
        { name: 'Today', value: 'today' },
        { name: 'This Week', value: 'week' },
        { name: 'This Month', value: 'month' },
        { name: 'All Time', value: 'all_time' },
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const period = (interaction.options.getString('period') ?? 'week') as StatsPeriod;

  await interaction.deferReply();

  const stats = await fetchClanStats(period);

  const breakdown = stats.sessionsByType.length
    ? stats.sessionsByType
        .map((row) => `${TYPE_EMOJI[row.session_type] ?? '•'} ${capitalize(row.session_type)} — ${row.count}`)
        .join('\n')
    : 'No activity yet';

  const embed = new EmbedBuilder()
    .setTitle(`📊 Org Activity — ${PERIOD_LABELS[period]}`)
    .setColor(0x5865f2)
    .addFields(
      { name: 'Sessions logged', value: String(stats.sessionCount), inline: true },
      { name: 'Active members', value: `${stats.activeMembers} / ${stats.memberCount}`, inline: true },
      { name: 'Activity breakdown', value: breakdown },
    )
    .setFooter({ text: `Quantum Org Server • ${period}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
