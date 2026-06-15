import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import { fetchBlueprints, BlueprintEntry } from '../lib/orgClient';
import { joinWithLimit, truncate } from '../lib/format';

const MAX_DESCRIPTION_LENGTH = 4096;
const MAX_FIELD_LENGTH = 1024;

export const data = new SlashCommandBuilder()
  .setName('blueprint')
  .setDescription('Show unlocked org blueprints, or who has unlocked a specific one')
  .addStringOption((option) =>
    option
      .setName('name')
      .setDescription('Blueprint name to search for (closest match is used)')
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const blueprints = await fetchBlueprints();

  if (!blueprints.length) {
    await interaction.editReply('No blueprints discovered yet.');
    return;
  }

  const query = interaction.options.getString('name');

  const embed = query
    ? buildMatchEmbed(query, findClosestBlueprint(query, blueprints))
    : buildListEmbed(blueprints);

  await interaction.editReply({ embeds: [embed] });
}

function buildListEmbed(blueprints: BlueprintEntry[]): EmbedBuilder {
  const lines = blueprints.map((bp) => `**${bp.product_name}** — ${bp.members.join(', ')}`);

  return new EmbedBuilder()
    .setTitle(`📘 Org Blueprints — ${blueprints.length} unlocked`)
    .setColor(0x5865f2)
    .setDescription(joinWithLimit(lines, MAX_DESCRIPTION_LENGTH))
    .setFooter({ text: 'Quantum Org Server' })
    .setTimestamp();
}

function buildMatchEmbed(query: string, match: BlueprintEntry): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`📘 ${match.product_name}`)
    .setColor(0x5865f2)
    .addFields({ name: 'Unlocked by', value: truncate(match.members.join(', '), MAX_FIELD_LENGTH) })
    .setFooter({ text: 'Quantum Org Server' })
    .setTimestamp();

  if (match.product_name.toLowerCase() !== query.toLowerCase()) {
    embed.setDescription(`Closest match for "${query}"`);
  }

  return embed;
}

// Exact match, then substring containment (shortest name wins), then Levenshtein distance.
function findClosestBlueprint(query: string, blueprints: BlueprintEntry[]): BlueprintEntry {
  const q = query.toLowerCase();

  const exact = blueprints.find((bp) => bp.product_name.toLowerCase() === q);
  if (exact) return exact;

  const substringMatches = blueprints.filter((bp) => bp.product_name.toLowerCase().includes(q));
  if (substringMatches.length) {
    return substringMatches.sort((a, b) => a.product_name.length - b.product_name.length)[0];
  }

  let best = blueprints[0];
  let bestDistance = levenshtein(q, best.product_name.toLowerCase());
  for (const bp of blueprints.slice(1)) {
    const distance = levenshtein(q, bp.product_name.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = bp;
    }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[a.length][b.length];
}
